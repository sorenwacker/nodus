//! Node commands for CRUD operations on graph nodes

use crate::database::{self, nodes::Node};
use crate::import_helpers;
use crate::watcher::write_file_locked;
use serde::Deserialize;

// ============================================================================
// Node Commands
// ============================================================================

#[tauri::command]
pub async fn get_nodes() -> Result<Vec<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_node(id: String) -> Result<Option<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateNodeInput {
    pub title: String,
    pub file_path: Option<String>,
    pub markdown_content: Option<String>,
    pub node_type: Option<String>,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub tags: Option<Vec<String>>,
    pub workspace_id: Option<String>,
    pub color_theme: Option<String>,
}

#[tauri::command]
pub async fn create_node(input: CreateNodeInput) -> Result<Node, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    create_node_impl(pool, input).await
}

pub(crate) async fn create_node_impl(
    pool: &database::DbPool,
    input: CreateNodeInput,
) -> Result<Node, String> {
    let now = chrono::Utc::now().timestamp();
    let node = Node {
        id: uuid::Uuid::new_v4().to_string(),
        title: input.title,
        file_path: input.file_path,
        markdown_content: input.markdown_content,
        node_type: input.node_type.unwrap_or_else(|| "note".to_string()),
        canvas_x: input.canvas_x,
        canvas_y: input.canvas_y,
        width: input.width.unwrap_or(200.0),
        height: input.height.unwrap_or(120.0),
        z_index: 0,
        frame_id: None,
        color_theme: input.color_theme,
        is_collapsed: false,
        tags: input.tags.map(|t| serde_json::to_string(&t).unwrap()),
        workspace_id: input.workspace_id,
        checksum: None,
        created_at: now,
        updated_at: now,
        deleted_at: None,
    };

    database::nodes::create(pool, &node)
        .await
        .map_err(|e| e.to_string())?;

    // Wikilinks in initial content must create edges just like a later
    // content edit would. Failure must not fail the creation: the node is
    // already inserted, and an error here would make the frontend fall back
    // to a duplicate local node.
    if let Some(ref content) = node.markdown_content {
        let links = import_helpers::extract_wikilinks(content);
        if !links.is_empty() {
            if let Err(e) = super::wikilinks::sync_wikilinks_for_node(pool, &node.id, &links).await
            {
                eprintln!("[CreateNode] wikilink sync failed for {}: {}", node.id, e);
            }
            let _ = database::edges::merge_bidirectional_wikilinks(pool).await;
        }
        super::wikilinks::set_synced_hash(
            pool,
            &node.id,
            &crate::checksum::compute_string(content),
        )
        .await;
    }

    // Links elsewhere that dangled until this node existed become edges now
    if let Err(e) = super::wikilinks::resolve_pending_links_to(pool, &node).await {
        eprintln!("[CreateNode] pending link resolution failed: {}", e);
    }

    Ok(node)
}

/// Create a node from a vault file (used during sync)
#[tauri::command]
pub async fn update_node_position(id: String, x: f64, y: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_position(pool, &id, x, y)
        .await
        .map_err(|e| e.to_string())
}

/// Update node content from file (database only, no write-back to file).
/// Used when syncing external file changes to prevent infinite loops.
#[tauri::command]
pub async fn update_node_content_from_file(
    id: String,
    content: String,
    checksum: String,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_content_and_checksum(pool, &id, &content, &checksum)
        .await
        .map_err(|e| e.to_string())
}

/// Update node content. Returns the new checksum if file was written.
#[tauri::command]
pub async fn update_node_content(id: String, content: String) -> Result<Option<String>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    update_node_content_impl(pool, &id, &content).await
}

pub(crate) async fn update_node_content_impl(
    pool: &database::DbPool,
    id: &str,
    content: &str,
) -> Result<Option<String>, String> {
    // Write back to the backing file only while folder sync is active for it
    if let Some(node) = database::nodes::get_by_id(pool, id)
        .await
        .map_err(|e| e.to_string())?
    {
        if let Some(ref file_path) = node.file_path {
            let path = std::path::Path::new(file_path);
            if path.exists() && file_write_allowed(pool, &node, path).await {
                // Keep a frontmatter block already present in the file (e.g.
                // OKF metadata written at creation) instead of stripping it
                let existing = std::fs::read_to_string(path).unwrap_or_default();
                let to_write = super::okf::preserve_frontmatter(&existing, content);

                // Write to file with exclusive lock and get new checksum
                let checksum = write_file_locked(path, &to_write).map_err(|e| e.to_string())?;

                // Update content and checksum in database
                database::nodes::update_content_and_checksum(pool, id, content, &checksum)
                    .await
                    .map_err(|e| e.to_string())?;

                return Ok(Some(checksum));
            }
        }
    }

    // Sync off, no file_path, or file doesn't exist - just update database
    database::nodes::update_content(pool, id, content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(None)
}

/// A node's file may be rewritten only when a workspace with sync enabled
/// covers it: the node's own workspace, or - for nodes without a workspace -
/// any workspace whose vault contains the file.
async fn file_write_allowed(pool: &database::DbPool, node: &Node, path: &std::path::Path) -> bool {
    let Ok(file) = path.canonicalize() else {
        return false;
    };

    let workspaces = match node.workspace_id.as_deref() {
        Some(ws_id) => match database::workspaces::get_by_id(pool, ws_id).await {
            Ok(Some(workspace)) => vec![workspace],
            _ => return false,
        },
        None => match database::workspaces::get_all(pool).await {
            Ok(workspaces) => workspaces,
            _ => return false,
        },
    };

    workspaces.iter().any(|workspace| {
        workspace.sync_enabled
            && workspace
                .vault_path
                .as_deref()
                .and_then(|vault| std::path::Path::new(vault).canonicalize().ok())
                .is_some_and(|vault| file.starts_with(&vault))
    })
}

#[tauri::command]
pub async fn update_node_title(id: String, title: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_title(pool, &id, &title)
        .await
        .map_err(|e| e.to_string())?;

    // The new title may satisfy links elsewhere that dangled until now
    if let Ok(Some(node)) = database::nodes::get_by_id(pool, &id).await {
        if let Err(e) = super::wikilinks::resolve_pending_links_to(pool, &node).await {
            eprintln!("[UpdateTitle] pending link resolution failed: {}", e);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn update_node_size(id: String, width: f64, height: f64) -> Result<(), String> {
    println!(
        "[update_node_size] id={}, width={}, height={}",
        id, width, height
    );
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_size(pool, &id, width, height)
        .await
        .map_err(|e| {
            eprintln!("[update_node_size] ERROR: {}", e);
            e.to_string()
        })?;
    println!("[update_node_size] Success for {}", id);
    Ok(())
}

#[tauri::command]
pub async fn update_node_color(id: String, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_color(pool, &id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_workspace(id: String, workspace_id: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_workspace(pool, &id, workspace_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_tags(pool, &id, &tags)
        .await
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

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

    async fn insert_workspace(pool: &DbPool, id: &str, vault_path: &str, sync_enabled: bool) {
        let workspace = database::workspaces::Workspace {
            id: id.to_string(),
            name: id.to_string(),
            color: None,
            vault_path: Some(vault_path.to_string()),
            sync_enabled,
            created_at: 0,
            updated_at: 0,
        };
        database::workspaces::create(pool, &workspace)
            .await
            .expect("insert workspace");
    }

    async fn insert_file_node(
        pool: &DbPool,
        id: &str,
        file_path: &str,
        workspace_id: Option<&str>,
    ) {
        let node = Node {
            id: id.to_string(),
            title: id.to_string(),
            file_path: Some(file_path.to_string()),
            markdown_content: Some("original".to_string()),
            node_type: "note".to_string(),
            canvas_x: 0.0,
            canvas_y: 0.0,
            width: 200.0,
            height: 120.0,
            z_index: 0,
            frame_id: None,
            color_theme: None,
            is_collapsed: false,
            tags: None,
            workspace_id: workspace_id.map(|w| w.to_string()),
            checksum: None,
            created_at: 0,
            updated_at: 0,
            deleted_at: None,
        };
        database::nodes::create(pool, &node)
            .await
            .expect("insert node");
    }

    fn vault_with_file(content: &str) -> (tempfile::TempDir, String) {
        let vault = tempfile::tempdir().unwrap();
        let file = vault.path().join("note.md");
        std::fs::write(&file, content).unwrap();
        (vault, file.to_string_lossy().to_string())
    }

    fn create_input(title: &str, content: Option<&str>) -> CreateNodeInput {
        CreateNodeInput {
            title: title.to_string(),
            file_path: None,
            markdown_content: content.map(|c| c.to_string()),
            node_type: None,
            canvas_x: 0.0,
            canvas_y: 0.0,
            width: None,
            height: None,
            tags: None,
            workspace_id: None,
            color_theme: None,
        }
    }

    #[tokio::test]
    async fn create_node_with_wikilink_content_creates_edges() {
        let pool = memory_pool().await;
        sqlx::query(
            "INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('b', 'beta', 0, 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let node = create_node_impl(&pool, create_input("alpha", Some("see [[beta]]")))
            .await
            .unwrap();

        let edges = database::edges::get_all(&pool).await.unwrap();
        assert_eq!(edges.len(), 1, "initial content must create wikilink edges");
        assert_eq!(edges[0].source_node_id, node.id);
        assert_eq!(edges[0].target_node_id, "b");
        assert_eq!(edges[0].link_type, "wikilink");
    }

    #[tokio::test]
    async fn create_node_without_links_creates_no_edges() {
        let pool = memory_pool().await;
        sqlx::query(
            "INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('b', 'beta', 0, 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        create_node_impl(&pool, create_input("alpha", Some("plain text")))
            .await
            .unwrap();
        create_node_impl(&pool, create_input("gamma", None))
            .await
            .unwrap();

        assert!(database::edges::get_all(&pool).await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn create_node_skips_wikilink_edge_for_already_connected_pair() {
        let pool = memory_pool().await;
        sqlx::query(
            "INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('b', 'beta', 0, 0)",
        )
        .execute(&pool)
        .await
        .unwrap();

        let node = create_node_impl(
            &pool,
            create_input("alpha", Some("see [[beta]] and [[beta]]")),
        )
        .await
        .unwrap();

        let edges = database::edges::get_all(&pool).await.unwrap();
        assert_eq!(
            edges.len(),
            1,
            "duplicate links must not create parallel edges"
        );
        assert_eq!(edges[0].source_node_id, node.id);
    }

    #[tokio::test]
    async fn sync_disabled_updates_database_only() {
        let pool = memory_pool().await;
        let (vault, file) = vault_with_file("original");
        insert_workspace(&pool, "ws", &vault.path().to_string_lossy(), false).await;
        insert_file_node(&pool, "n", &file, Some("ws")).await;

        let result = update_node_content_impl(&pool, "n", "changed")
            .await
            .unwrap();

        assert_eq!(result, None, "no checksum: file must not be written");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "original");
        let node = database::nodes::get_by_id(&pool, "n")
            .await
            .unwrap()
            .unwrap();
        assert_eq!(node.markdown_content.as_deref(), Some("changed"));
    }

    #[tokio::test]
    async fn sync_enabled_writes_file_in_vault() {
        let pool = memory_pool().await;
        let (vault, file) = vault_with_file("original");
        insert_workspace(&pool, "ws", &vault.path().to_string_lossy(), true).await;
        insert_file_node(&pool, "n", &file, Some("ws")).await;

        let result = update_node_content_impl(&pool, "n", "changed")
            .await
            .unwrap();

        assert!(result.is_some(), "checksum expected: file must be written");
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "changed");
    }

    #[tokio::test]
    async fn sync_enabled_ignores_file_outside_vault() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().unwrap();
        let (_outside_dir, file) = vault_with_file("original");
        insert_workspace(&pool, "ws", &vault.path().to_string_lossy(), true).await;
        insert_file_node(&pool, "n", &file, Some("ws")).await;

        let result = update_node_content_impl(&pool, "n", "changed")
            .await
            .unwrap();

        assert_eq!(result, None);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "original");
    }

    #[tokio::test]
    async fn write_back_keeps_file_frontmatter() {
        let pool = memory_pool().await;
        let (vault, file) = vault_with_file("---\ntype: Note\n---\noriginal");
        insert_workspace(&pool, "ws", &vault.path().to_string_lossy(), true).await;
        insert_file_node(&pool, "n", &file, Some("ws")).await;

        update_node_content_impl(&pool, "n", "changed")
            .await
            .unwrap();

        assert_eq!(
            std::fs::read_to_string(&file).unwrap(),
            "---\ntype: Note\n---\nchanged"
        );
    }

    #[tokio::test]
    async fn workspaceless_node_in_synced_vault_writes_file() {
        let pool = memory_pool().await;
        let (vault, file) = vault_with_file("original");
        insert_workspace(&pool, "ws", &vault.path().to_string_lossy(), true).await;
        insert_file_node(&pool, "n", &file, None).await;

        let result = update_node_content_impl(&pool, "n", "changed")
            .await
            .unwrap();

        assert!(result.is_some());
        assert_eq!(std::fs::read_to_string(&file).unwrap(), "changed");
    }
}
