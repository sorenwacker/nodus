//! Wikilink extraction and edge synchronization commands

use crate::database::{self, nodes::Node};
use crate::import_helpers;

/// Sync wikilinks for a node - creates edges for new links
#[tauri::command]
pub async fn sync_node_wikilinks(node_id: String) -> Result<usize, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let node = database::nodes::get_by_id(pool, &node_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Node not found")?;

    let content = node.markdown_content.unwrap_or_default();
    let links = import_helpers::extract_wikilinks(&content);

    let created = sync_wikilinks_for_node(pool, &node_id, &links).await?;
    set_synced_hash(pool, &node_id, &crate::checksum::compute_string(&content)).await;

    // Merge any bidirectional edges that were created
    let _ = database::edges::merge_bidirectional_wikilinks(pool).await;

    Ok(created)
}

/// Record the content hash a node's wikilinks were last synced at, so the
/// full pass can skip it while unchanged
pub(crate) async fn set_synced_hash(pool: &database::DbPool, node_id: &str, hash: &str) {
    let _ = sqlx::query("UPDATE nodes SET wikilink_synced_hash = ? WHERE id = ?")
        .bind(hash)
        .bind(node_id)
        .execute(pool)
        .await;
}

/// The normalized keys under which a node is reachable by wikilinks
/// (lowercased title, and folder/stem for file nodes)
pub(crate) fn node_link_keys(node: &Node) -> Vec<String> {
    let mut keys = vec![node.title.to_lowercase()];
    if let Some(ref file_path) = node.file_path {
        let path = std::path::Path::new(file_path);
        if let (Some(stem), Some(parent)) = (path.file_stem(), path.parent()) {
            if let Some(folder) = parent.file_name() {
                keys.push(format!(
                    "{}/{}",
                    folder.to_string_lossy().to_lowercase(),
                    stem.to_string_lossy().to_lowercase()
                ));
            }
        }
    }
    keys
}

/// Create edges for links elsewhere that dangled until this node appeared
/// (called on node creation and rename). Returns created edge count.
pub(crate) async fn resolve_pending_links_to(
    pool: &database::DbPool,
    node: &Node,
) -> Result<usize, String> {
    let keys = node_link_keys(node);
    let mut sources: Vec<String> = Vec::new();
    for key in &keys {
        let rows: Vec<(String,)> = sqlx::query_as(
            "SELECT DISTINCT source_node_id FROM pending_wikilinks WHERE target_key = ?",
        )
        .bind(key)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;
        for (id,) in rows {
            if !sources.contains(&id) && id != node.id {
                sources.push(id);
            }
        }
    }
    if sources.is_empty() {
        return Ok(0);
    }

    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let title_to_id = build_title_to_id_map(&all_nodes);
    let mut created = 0;
    for source_id in sources {
        let Some(source) = all_nodes.iter().find(|n| n.id == source_id) else {
            continue;
        };
        let content = source.markdown_content.clone().unwrap_or_default();
        let links = import_helpers::extract_wikilinks(&content);
        let (c, _) =
            sync_wikilinks_for_node_with_map(pool, &source_id, &links, &title_to_id).await?;
        created += c;
    }
    Ok(created)
}

/// Sync all wikilinks for all nodes in a workspace
#[tauri::command]
pub async fn sync_all_wikilinks(workspace_id: Option<String>) -> Result<usize, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let (created, _removed, processed, skipped) =
        sync_workspace_wikilinks_impl(pool, workspace_id.as_deref()).await?;
    println!(
        "[SyncWikilinks] Done: {} created, {} synced, {} unchanged (skipped) for workspace {:?}",
        created, processed, skipped, workspace_id
    );
    Ok(created)
}

/// Incremental full pass: nodes whose content hash matches their last-synced
/// hash are skipped without touching the filesystem or the edge table. The
/// file watcher handles individual changes; this pass is the safety net.
/// Returns (created, removed, processed, skipped).
pub(crate) async fn sync_workspace_wikilinks_impl(
    pool: &database::DbPool,
    workspace_id: Option<&str>,
) -> Result<(usize, usize, usize, usize), String> {
    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Last-synced hashes, fetched in one query
    let synced_hashes: std::collections::HashMap<String, String> =
        sqlx::query_as::<_, (String, Option<String>)>(
            "SELECT id, wikilink_synced_hash FROM nodes WHERE wikilink_synced_hash IS NOT NULL",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter_map(|(id, hash)| hash.map(|h| (id, h)))
        .collect();

    // Build title map lazily: only needed once a node actually syncs
    let mut title_to_id: Option<std::collections::HashMap<String, String>> = None;

    let mut total_created = 0;
    let mut total_removed = 0;
    let mut processed = 0;
    let mut skipped = 0;

    for node in &all_nodes {
        if let Some(ws_id) = workspace_id {
            if node.workspace_id.as_deref() != Some(ws_id) {
                continue;
            }
        }

        // Cheap change check: the watcher keeps checksum current for file
        // nodes; content-only nodes hash their stored content
        let current_hash = match (&node.checksum, &node.markdown_content) {
            (Some(checksum), _) => checksum.clone(),
            (None, content) => {
                crate::checksum::compute_string(content.as_deref().unwrap_or_default())
            }
        };
        if synced_hashes.get(&node.id) == Some(&current_hash) {
            skipped += 1;
            continue;
        }

        // Changed (or never synced): read the real content and sync
        let content = if let Some(ref file_path) = node.file_path {
            std::fs::read_to_string(file_path)
                .unwrap_or_else(|_| node.markdown_content.clone().unwrap_or_default())
        } else {
            node.markdown_content.clone().unwrap_or_default()
        };
        let links = import_helpers::extract_wikilinks(&content);

        let map = match &title_to_id {
            Some(map) => map,
            None => {
                title_to_id = Some(build_title_to_id_map(&all_nodes));
                title_to_id.as_ref().unwrap()
            }
        };
        match sync_wikilinks_for_node_with_map(pool, &node.id, &links, map).await {
            Ok((created, removed)) => {
                total_created += created;
                total_removed += removed;
                set_synced_hash(pool, &node.id, &current_hash).await;
            }
            Err(e) => eprintln!("Failed to sync wikilinks for {}: {}", node.title, e),
        }
        processed += 1;
    }

    // Merge bidirectional wikilinks only when something changed
    if processed > 0 {
        let _ = database::edges::merge_bidirectional_wikilinks(pool).await;
    }

    Ok((total_created, total_removed, processed, skipped))
}

/// Build title-to-id map for wikilink resolution
pub(crate) fn build_title_to_id_map(nodes: &[Node]) -> std::collections::HashMap<String, String> {
    let mut title_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for node in nodes {
        // Map by title
        title_to_id.insert(node.title.to_lowercase(), node.id.clone());

        // Also map by relative path (e.g., "concepts/FAIR-Digital-Objects")
        if let Some(ref file_path) = node.file_path {
            if let Some(stem) = std::path::Path::new(file_path).file_stem() {
                let stem_str = stem.to_string_lossy().to_lowercase();
                if let Some(parent) = std::path::Path::new(file_path).parent() {
                    if let Some(folder) = parent.file_name() {
                        let folder_str = folder.to_string_lossy().to_lowercase();
                        let path_key = format!("{}/{}", folder_str, stem_str);
                        title_to_id.insert(path_key, node.id.clone());
                    }
                }
            }
        }
    }
    title_to_id
}

/// Helper to sync wikilinks for a node (uses pre-built title map for performance)
/// Returns (created_count, removed_count)
pub(crate) async fn sync_wikilinks_for_node_with_map(
    pool: &database::DbPool,
    source_id: &str,
    links: &[String],
    title_to_id: &std::collections::HashMap<String, String>,
) -> Result<(usize, usize), String> {
    // All edges touching this node, in either direction and of any link_type.
    // A pair already connected manually (e.g. 'related') must not receive a
    // parallel wikilink edge.
    let existing_edges = database::edges::get_edges_for_node(pool, source_id)
        .await
        .map_err(|e| e.to_string())?;

    let existing_wikilink_edges: Vec<_> = existing_edges
        .iter()
        .filter(|e| e.link_type == "wikilink" && e.source_node_id == source_id)
        .collect();

    let connected_node_ids: std::collections::HashSet<String> = existing_edges
        .iter()
        .map(|e| {
            if e.source_node_id == source_id {
                e.target_node_id.clone()
            } else {
                e.source_node_id.clone()
            }
        })
        .collect();

    // Process each link to get target IDs that SHOULD exist
    let unique_links: std::collections::HashSet<String> = links
        .iter()
        .map(|l| {
            let without_anchor = l.split('#').next().unwrap_or(l);
            without_anchor.to_lowercase()
        })
        .collect();

    // Resolve links to target IDs; unresolved keys are remembered so the
    // edge appears the moment a matching node is created or renamed
    let mut should_exist: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut unresolved: Vec<String> = Vec::new();
    for link in &unique_links {
        let target_id = title_to_id
            .get(link)
            .or_else(|| {
                link.rsplit('/')
                    .next()
                    .and_then(|name| title_to_id.get(name))
            })
            .cloned();

        match target_id {
            Some(tid) => {
                if source_id != tid {
                    should_exist.insert(tid);
                }
            }
            None => unresolved.push(link.clone()),
        }
    }

    // Replace this node's pending-link records with the current unresolved set
    let _ = sqlx::query("DELETE FROM pending_wikilinks WHERE source_node_id = ?")
        .bind(source_id)
        .execute(pool)
        .await;
    for key in &unresolved {
        let _ = sqlx::query(
            "INSERT OR IGNORE INTO pending_wikilinks (source_node_id, target_key) VALUES (?, ?)",
        )
        .bind(source_id)
        .bind(key)
        .execute(pool)
        .await;
    }

    let now = chrono::Utc::now().timestamp();
    let mut created_count = 0;
    let mut removed_count = 0;

    // Create edges only for pairs that are not already connected in any way
    for target_id in &should_exist {
        if !connected_node_ids.contains(target_id) {
            let edge = database::edges::Edge {
                id: uuid::Uuid::new_v4().to_string(),
                source_node_id: source_id.to_string(),
                target_node_id: target_id.clone(),
                label: None,
                link_type: "wikilink".to_string(),
                weight: 1.0,
                color: None,
                storyline_id: None,
                created_at: now,
                directed: true,
            };
            if database::edges::create(pool, &edge).await.is_ok() {
                created_count += 1;
            }
        }
    }

    // Remove edges that no longer have corresponding wikilinks
    for edge in &existing_wikilink_edges {
        if !should_exist.contains(&edge.target_node_id)
            && database::edges::delete(pool, &edge.id).await.is_ok()
        {
            removed_count += 1;
        }
    }

    Ok((created_count, removed_count))
}

/// Helper for callers that don't have a pre-built title map
pub(crate) async fn sync_wikilinks_for_node(
    pool: &database::DbPool,
    source_id: &str,
    links: &[String],
) -> Result<usize, String> {
    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let title_to_id = build_title_to_id_map(&all_nodes);
    let (created, _removed) =
        sync_wikilinks_for_node_with_map(pool, source_id, links, &title_to_id).await?;
    Ok(created)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::edges::Edge;
    use crate::database::DbPool;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    async fn insert_node(pool: &DbPool, id: &str, title: &str) {
        sqlx::query("INSERT INTO nodes (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)")
            .bind(id)
            .bind(title)
            .execute(pool)
            .await
            .expect("insert node");
    }

    async fn insert_edge(pool: &DbPool, id: &str, source: &str, target: &str, link_type: &str) {
        let edge = Edge {
            id: id.to_string(),
            source_node_id: source.to_string(),
            target_node_id: target.to_string(),
            label: None,
            link_type: link_type.to_string(),
            weight: 1.0,
            color: None,
            storyline_id: None,
            created_at: 0,
            directed: true,
        };
        database::edges::create(pool, &edge)
            .await
            .expect("insert edge");
    }

    async fn sync(pool: &DbPool, source: &str, links: &[&str]) -> (usize, usize) {
        let all_nodes = database::nodes::get_all(pool).await.unwrap();
        let map = build_title_to_id_map(&all_nodes);
        let links: Vec<String> = links.iter().map(|l| l.to_string()).collect();
        sync_wikilinks_for_node_with_map(pool, source, &links, &map)
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn creates_edge_for_unlinked_pair() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;

        let (created, removed) = sync(&pool, "a", &["beta"]).await;

        assert_eq!((created, removed), (1, 0));
        let edges = database::edges::get_all(&pool).await.unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].link_type, "wikilink");
    }

    #[tokio::test]
    async fn skips_pair_already_connected_by_manual_edge() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;
        insert_edge(&pool, "e1", "a", "b", "related").await;

        let (created, _) = sync(&pool, "a", &["beta"]).await;

        assert_eq!(
            created, 0,
            "existing manual edge must suppress wikilink edge"
        );
        assert_eq!(database::edges::get_all(&pool).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn skips_pair_connected_by_reverse_edge() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;
        insert_edge(&pool, "e1", "b", "a", "related").await;

        let (created, _) = sync(&pool, "a", &["beta"]).await;

        assert_eq!(
            created, 0,
            "reverse-direction edge must suppress wikilink edge"
        );
        assert_eq!(database::edges::get_all(&pool).await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn removes_wikilink_edge_when_link_disappears() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;
        insert_edge(&pool, "e1", "a", "b", "wikilink").await;

        let (created, removed) = sync(&pool, "a", &[]).await;

        assert_eq!((created, removed), (0, 1));
        assert!(database::edges::get_all(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn keeps_manual_edge_when_link_disappears() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;
        insert_edge(&pool, "e1", "a", "b", "related").await;

        let (created, removed) = sync(&pool, "a", &[]).await;

        assert_eq!((created, removed), (0, 0));
        assert_eq!(database::edges::get_all(&pool).await.unwrap().len(), 1);
    }

    async fn set_content(pool: &DbPool, id: &str, content: &str) {
        sqlx::query("UPDATE nodes SET markdown_content = ? WHERE id = ?")
            .bind(content)
            .bind(id)
            .execute(pool)
            .await
            .expect("set content");
    }

    async fn pending_count(pool: &DbPool, source: &str) -> i64 {
        let row: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM pending_wikilinks WHERE source_node_id = ?")
                .bind(source)
                .fetch_one(pool)
                .await
                .unwrap();
        row.0
    }

    #[tokio::test]
    async fn full_pass_skips_unchanged_nodes() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "beta").await;
        set_content(&pool, "a", "see [[beta]]").await;

        let (created, _, processed, skipped) =
            sync_workspace_wikilinks_impl(&pool, None).await.unwrap();
        assert_eq!((created, processed, skipped), (1, 2, 0));

        // Nothing changed: the second pass touches no node
        let (created, _, processed, skipped) =
            sync_workspace_wikilinks_impl(&pool, None).await.unwrap();
        assert_eq!((created, processed, skipped), (0, 0, 2));

        // A content change re-syncs exactly that node
        set_content(&pool, "a", "no links anymore").await;
        let (created, removed, processed, skipped) =
            sync_workspace_wikilinks_impl(&pool, None).await.unwrap();
        assert_eq!((created, removed, processed, skipped), (0, 1, 1, 1));
    }

    #[tokio::test]
    async fn dangling_link_resolves_when_target_is_created() {
        use crate::commands::nodes::{create_node_impl, CreateNodeInput};

        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        set_content(&pool, "a", "see [[missing]]").await;

        sync_workspace_wikilinks_impl(&pool, None).await.unwrap();
        assert!(database::edges::get_all(&pool).await.unwrap().is_empty());
        assert_eq!(pending_count(&pool, "a").await, 1);

        let created = create_node_impl(
            &pool,
            CreateNodeInput {
                title: "Missing".to_string(),
                file_path: None,
                markdown_content: None,
                node_type: None,
                canvas_x: 0.0,
                canvas_y: 0.0,
                width: None,
                height: None,
                tags: None,
                workspace_id: None,
                color_theme: None,
            },
        )
        .await
        .unwrap();

        let edges = database::edges::get_all(&pool).await.unwrap();
        assert_eq!(edges.len(), 1, "dangling link must become an edge");
        assert_eq!(edges[0].source_node_id, "a");
        assert_eq!(edges[0].target_node_id, created.id);
        assert_eq!(pending_count(&pool, "a").await, 0);
    }

    #[tokio::test]
    async fn dangling_link_resolves_on_rename() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        insert_node(&pool, "b", "other").await;
        set_content(&pool, "a", "see [[newname]]").await;

        sync_workspace_wikilinks_impl(&pool, None).await.unwrap();
        assert!(database::edges::get_all(&pool).await.unwrap().is_empty());

        // Rename b to the dangling target (mirrors the update_node_title command)
        database::nodes::update_title(&pool, "b", "newname")
            .await
            .unwrap();
        let node = database::nodes::get_by_id(&pool, "b")
            .await
            .unwrap()
            .unwrap();
        resolve_pending_links_to(&pool, &node).await.unwrap();

        let edges = database::edges::get_all(&pool).await.unwrap();
        assert_eq!(edges.len(), 1);
        assert_eq!(edges[0].target_node_id, "b");
    }

    #[tokio::test]
    async fn resolves_links_by_relative_path() {
        let pool = memory_pool().await;
        insert_node(&pool, "a", "alpha").await;
        sqlx::query(
            "INSERT INTO nodes (id, title, file_path, created_at, updated_at)
             VALUES ('b', 'beta', '/vault/concepts/beta.md', 0, 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let (created, _) = sync(&pool, "a", &["concepts/beta"]).await;

        assert_eq!(created, 1);
    }
}
