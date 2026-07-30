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

    // Merge any bidirectional edges that were created
    let _ = database::edges::merge_bidirectional_wikilinks(pool).await;

    Ok(created)
}

/// Sync all wikilinks for all nodes in a workspace
/// Reads from files when available (not just database content) to ensure accurate sync
#[tauri::command]
pub async fn sync_all_wikilinks(workspace_id: Option<String>) -> Result<usize, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Build title map ONCE for all nodes (performance optimization)
    let title_to_id = build_title_to_id_map(&all_nodes);
    println!(
        "[SyncWikilinks] Built title map with {} entries",
        title_to_id.len()
    );

    let mut total_created = 0;
    let mut total_removed = 0;
    let mut processed = 0;

    for node in &all_nodes {
        // Filter by workspace if specified
        if let Some(ref ws_id) = workspace_id {
            if node.workspace_id.as_ref() != Some(ws_id) {
                continue;
            }
        }

        // Read from file if available (more accurate than database content)
        let (content, _source) = if let Some(ref file_path) = node.file_path {
            match std::fs::read_to_string(file_path) {
                Ok(c) => (c, "file"),
                Err(_) => (
                    node.markdown_content.clone().unwrap_or_default(),
                    "db-fallback",
                ),
            }
        } else {
            (node.markdown_content.clone().unwrap_or_default(), "db")
        };
        let links = import_helpers::extract_wikilinks(&content);

        // Sync wikilinks (add new, remove old)
        match sync_wikilinks_for_node_with_map(pool, &node.id, &links, &title_to_id).await {
            Ok((created, removed)) => {
                total_created += created;
                total_removed += removed;
            }
            Err(e) => eprintln!("Failed to sync wikilinks for {}: {}", node.title, e),
        }

        processed += 1;
        if processed % 50 == 0 {
            println!(
                "[SyncWikilinks] Processed {}/{} nodes...",
                processed,
                all_nodes.len()
            );
        }
    }

    // Merge bidirectional wikilinks into single undirected edges
    let merged = database::edges::merge_bidirectional_wikilinks(pool)
        .await
        .unwrap_or(0);

    println!(
        "[SyncWikilinks] Done: {} created, {} removed, {} merged for workspace {:?}",
        total_created, total_removed, merged, workspace_id
    );
    Ok(total_created)
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

    // Resolve links to target IDs
    let mut should_exist: std::collections::HashSet<String> = std::collections::HashSet::new();
    for link in &unique_links {
        let target_id = title_to_id
            .get(link)
            .or_else(|| {
                link.rsplit('/')
                    .next()
                    .and_then(|name| title_to_id.get(name))
            })
            .cloned();

        if let Some(tid) = target_id {
            if source_id != tid {
                should_exist.insert(tid);
            }
        }
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
