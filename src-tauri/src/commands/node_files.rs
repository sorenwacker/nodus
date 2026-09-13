//! Commands for the files behind nodes: creating a node from a file, giving a
//! node a file, moving one, and recording where it lives.

use crate::database::{self, nodes::Node};
use crate::import_helpers;

#[tauri::command]
pub async fn create_node_from_file(
    file_path: String,
    workspace_id: Option<String>,
) -> Result<Node, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    create_node_from_file_impl(pool, file_path, workspace_id).await
}

pub(crate) async fn create_node_from_file_impl(
    pool: &database::DbPool,
    file_path: String,
    workspace_id: Option<String>,
) -> Result<Node, String> {
    let path = std::path::Path::new(&file_path);

    // Validate file path - must be a .md file and not contain path traversal
    if !file_path.ends_with(".md") {
        return Err("Only .md files can be imported".to_string());
    }
    if file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }

    // Verify the file is within the target workspace's vault; when no
    // workspace (or one without a vault) is given, it must still be inside
    // one of the configured vaults - the check must not be bypassable
    let mut checked_against_own_vault = false;
    if let Some(ref ws_id) = workspace_id {
        if let Ok(Some(workspace)) = database::workspaces::get_by_id(pool, ws_id).await {
            if let Some(vault_path) = &workspace.vault_path {
                let canonical_vault = std::path::Path::new(vault_path)
                    .canonicalize()
                    .map_err(|e| format!("Invalid vault path: {}", e))?;
                let canonical_file = path
                    .canonicalize()
                    .map_err(|e| format!("Invalid file path: {}", e))?;
                if !canonical_file.starts_with(&canonical_vault) {
                    return Err("File must be within workspace vault".to_string());
                }
                checked_against_own_vault = true;
            }
        }
    }
    if !checked_against_own_vault {
        super::validate_path_in_workspace(path).await?;
    }

    // Check if node already exists for this file
    if let Ok(Some(_)) = database::nodes::get_by_file_path(pool, &file_path).await {
        return Err("Node already exists for this file".to_string());
    }

    // Read file content
    let content = std::fs::read_to_string(path).map_err(|e| e.to_string())?;

    // Extract title from filename
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled")
        .to_string();

    // Compute checksum
    let checksum = crate::checksum::compute_string(&content);

    // Get count of existing nodes to position new node
    let existing_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let node_count = existing_nodes
        .iter()
        .filter(|n| n.workspace_id == workspace_id)
        .count();

    // Position in grid
    let x = (node_count % 5) as f64 * 250.0 + 100.0;
    let y = (node_count / 5) as f64 * 200.0 + 100.0;

    let now = chrono::Utc::now().timestamp();
    let node_id = uuid::Uuid::new_v4().to_string();

    let node = Node {
        id: node_id.clone(),
        title,
        file_path: Some(file_path),
        markdown_content: Some(content.clone()),
        node_type: "note".to_string(),
        canvas_x: x,
        canvas_y: y,
        width: 200.0,
        height: 120.0,
        z_index: 0,
        frame_id: None,
        color_theme: None,
        is_collapsed: false,
        tags: None,
        workspace_id,
        checksum: Some(checksum),
        created_at: now,
        updated_at: now,
        deleted_at: None,
    };

    database::nodes::create(pool, &node)
        .await
        .map_err(|e| e.to_string())?;

    // Create edges for wikilinks. The node is already stored, so a failed sync
    // is reported and left for the next pass rather than failing a creation
    // that happened, as creating a node any other way does
    // (PRODUCT_DESIGN.md > Importing a vault)
    let links = import_helpers::extract_wikilinks(&content);
    match super::wikilinks::sync_wikilinks_for_node(pool, &node_id, &links).await {
        Ok(_) => {
            if let Some(hash) = node.checksum.as_deref() {
                super::wikilinks::set_synced_hash(pool, &node_id, hash).await;
            }
        }
        Err(e) => eprintln!(
            "[CreateNodeFromFile] wikilink sync failed for {}: {}",
            node_id, e
        ),
    }

    // Links elsewhere that dangled until this file's node existed
    if let Err(e) = super::wikilinks::resolve_pending_links_to(pool, &node).await {
        eprintln!("[CreateNodeFromFile] pending link resolution failed: {}", e);
    }

    Ok(node)
}

/// Create a file in the vault for a node
#[tauri::command]
pub async fn create_file_for_node(node_id: String) -> Result<String, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let node = database::nodes::get_by_id(pool, &node_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Node not found")?;

    // Node already has a file
    if node.file_path.is_some() {
        return Err("Node already has a file".to_string());
    }

    // Get workspace to find vault path
    let workspace_id = node.workspace_id.as_ref().ok_or("Node has no workspace")?;
    let workspace = database::workspaces::get_by_id(pool, workspace_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Workspace not found")?;

    let vault_path = workspace.vault_path.ok_or("Workspace has no vault path")?;

    // Create file path - sanitize title to prevent path traversal
    let safe_title = node
        .title
        .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
        .replace("..", "_"); // Prevent directory traversal
    let file_path = std::path::Path::new(&vault_path).join(format!("{}.md", safe_title));

    // Verify the resolved path is within the vault (defense in depth)
    let canonical_vault = std::path::Path::new(&vault_path)
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))?;
    let canonical_file = file_path
        .parent()
        .ok_or("Invalid file path")?
        .canonicalize()
        .unwrap_or_else(|_| canonical_vault.clone());
    if !canonical_file.starts_with(&canonical_vault) {
        return Err("Path traversal detected".to_string());
    }

    let file_path_str = file_path.to_string_lossy().to_string();

    // Write content with OKF frontmatter (new files only carry it from birth)
    let content = super::okf::with_frontmatter(&node);
    std::fs::write(&file_path, &content).map_err(|e| e.to_string())?;

    // Compute checksum
    let checksum = crate::checksum::compute_string(&content);

    // Update node with file path
    database::nodes::update_file_path(pool, &node_id, &file_path_str, &checksum)
        .await
        .map_err(|e| e.to_string())?;

    Ok(file_path_str)
}

/// Export all nodes without files to the vault as .md files
#[tauri::command]
pub async fn export_nodes_to_files(workspace_id: String) -> Result<i32, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get workspace to find vault path
    let workspace = database::workspaces::get_by_id(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or("Workspace not found")?;

    let vault_path = workspace.vault_path.ok_or("Workspace has no vault path")?;
    let vault_path_obj = std::path::Path::new(&vault_path);

    if !vault_path_obj.exists() {
        std::fs::create_dir_all(vault_path_obj).map_err(|e| e.to_string())?;
    }

    // Get all nodes in this workspace without file paths
    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let nodes_to_export: Vec<_> = all_nodes
        .into_iter()
        .filter(|n| {
            if n.workspace_id.as_deref() != Some(&workspace_id) || n.deleted_at.is_some() {
                return false;
            }
            // Export if no file_path OR if file doesn't exist
            match &n.file_path {
                None => true,
                Some(path) => !std::path::Path::new(path).exists(),
            }
        })
        .collect();

    println!(
        "[ExportNodes] Exporting {} nodes to {}",
        nodes_to_export.len(),
        vault_path
    );

    let mut exported_count = 0;

    for node in nodes_to_export {
        // Use title, or extract from content, or fallback to node ID
        let base_name = if !node.title.trim().is_empty() {
            node.title.clone()
        } else if let Some(ref content) = node.markdown_content {
            // Try to extract title from first # heading
            let title_from_heading = content
                .lines()
                .find(|line| line.starts_with("# "))
                .map(|line| line.trim_start_matches("# ").trim().to_string());

            // Or use first non-empty line
            let first_line = content
                .lines()
                .find(|line| !line.trim().is_empty())
                .map(|line| line.trim().trim_start_matches('#').trim().to_string());

            title_from_heading
                .or(first_line)
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| format!("Untitled-{}", &node.id[..8.min(node.id.len())]))
        } else {
            format!("Untitled-{}", &node.id[..8.min(node.id.len())])
        };

        // Sanitize for filename (truncate to reasonable length)
        let mut safe_title = base_name
            .chars()
            .take(100)
            .collect::<String>()
            .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_")
            .replace("..", "_")
            .trim()
            .to_string();

        // Ensure we never have an empty filename
        if safe_title.is_empty() {
            safe_title = format!("Untitled-{}", &node.id[..8.min(node.id.len())]);
        }

        println!(
            "[ExportNodes] Node '{}' -> file '{}.md'",
            node.title, safe_title
        );

        let file_path = vault_path_obj.join(format!("{}.md", safe_title));

        // Skip if file already exists (might be from another source)
        if file_path.exists() {
            println!("[ExportNodes] Skipping {}: file exists", safe_title);
            continue;
        }

        let file_path_str = file_path.to_string_lossy().to_string();

        // Write content with OKF frontmatter (new files only carry it from birth)
        let content = super::okf::with_frontmatter(&node);
        if let Err(e) = std::fs::write(&file_path, &content) {
            eprintln!("[ExportNodes] Failed to write {}: {}", file_path_str, e);
            continue;
        }

        // Compute checksum
        let checksum = crate::checksum::compute_string(&content);

        // Update node with file path
        if let Err(e) =
            database::nodes::update_file_path(pool, &node.id, &file_path_str, &checksum).await
        {
            eprintln!("[ExportNodes] Failed to update node {}: {}", node.id, e);
            continue;
        }

        println!("[ExportNodes] Exported: {}", file_path_str);
        exported_count += 1;
    }

    Ok(exported_count)
}

#[tauri::command]
pub async fn update_node_file_path(id: String, file_path: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    // Treat empty string as None (clear file_path)
    let file_path = file_path.filter(|p| !p.is_empty());
    // Every later file operation on this node trusts the stored path, so it
    // must lie in a workspace vault. Clearing the path stores nothing to check
    // (PRODUCT_DESIGN.md > Validating caller-supplied paths)
    if let Some(path) = &file_path {
        super::validate_path_in_workspace(std::path::Path::new(path)).await?;
    }
    database::nodes::update_file_path_only(pool, &id, file_path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Check if moving a node's file would cause a collision
/// Returns the conflicting filename if collision exists, None otherwise
#[tauri::command]
pub async fn check_file_collision(
    node_id: String,
    target_folder: String,
) -> Result<Option<String>, String> {
    use std::path::Path;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get node by ID
    let node = database::nodes::get_by_id(pool, &node_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    // Check if node has a file_path
    let old_path_str = match node.file_path {
        Some(p) => p,
        None => return Ok(None), // No file, no collision possible
    };
    let old_path = Path::new(&old_path_str);

    // Get filename from old path
    let filename = match old_path.file_name() {
        Some(f) => f,
        None => return Err("Invalid file path".to_string()),
    };

    // The target folder comes from the webview; never probe paths outside the vaults
    let target_dir = Path::new(&target_folder);
    super::validate_target_dir_in_workspace(target_dir).await?;
    let new_path = target_dir.join(filename);

    // Check for collision (different path but file exists)
    if new_path.exists() && new_path != old_path {
        Ok(Some(filename.to_string_lossy().to_string()))
    } else {
        Ok(None)
    }
}

/// Move a node's file to a different folder
/// Used for folder-frame sync when nodes are dragged between frames
/// collision_resolution: "auto" (default, auto-rename), "replace" (overwrite), or a new filename
#[tauri::command]
pub async fn move_node_file(
    node_id: String,
    target_folder: String,
    collision_resolution: Option<String>,
) -> Result<String, String> {
    use crate::watcher::FileLock;
    use std::path::Path;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get node by ID
    let node = database::nodes::get_by_id(pool, &node_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    // Check if node has a file_path
    let old_path_str = node
        .file_path
        .ok_or_else(|| "Node has no associated file".to_string())?;
    let old_path = Path::new(&old_path_str);

    // Check if source file exists
    if !old_path.exists() {
        return Err(format!("Source file does not exist: {}", old_path_str));
    }

    // Get filename from old path
    let filename = old_path
        .file_name()
        .ok_or_else(|| "Invalid file path".to_string())?;

    // The target folder comes from the webview; validate it before any
    // filesystem operation (create_dir_all, remove_file, rename)
    let target_dir = Path::new(&target_folder);
    super::validate_target_dir_in_workspace(target_dir).await?;
    let mut new_path = target_dir.join(filename);

    // Handle filename conflicts based on collision_resolution parameter
    if new_path.exists() && new_path != old_path {
        let resolution = collision_resolution.as_deref().unwrap_or("auto");

        match resolution {
            "replace" => {
                // Delete the existing file first
                std::fs::remove_file(&new_path)
                    .map_err(|e| format!("Failed to remove existing file: {}", e))?;
            }
            "auto" => {
                // Auto-rename by appending number suffix
                let stem = new_path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("file")
                    .to_string();
                let ext = new_path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("md")
                    .to_string();

                let mut counter = 1;
                loop {
                    let new_name = format!("{}-{}.{}", stem, counter, ext);
                    new_path = target_dir.join(&new_name);
                    if !new_path.exists() {
                        break;
                    }
                    counter += 1;
                    if counter > 100 {
                        return Err("Too many filename conflicts".to_string());
                    }
                }
            }
            custom_name => {
                // Use custom filename provided by the user; it must be a plain
                // filename, not a path that could escape the validated folder
                let custom_path = Path::new(custom_name);
                if custom_path.components().count() != 1
                    || custom_path
                        .components()
                        .any(|c| !matches!(c, std::path::Component::Normal(_)))
                {
                    return Err("Custom filename must not contain path separators".to_string());
                }
                new_path = target_dir.join(custom_name);
                // Check if this custom name also conflicts
                if new_path.exists() && new_path != old_path {
                    return Err(format!(
                        "The custom filename '{}' also exists in the target folder",
                        custom_name
                    ));
                }
            }
        }
    }

    // If paths are the same, nothing to do
    if new_path == old_path {
        return Ok(old_path_str);
    }

    // Acquire exclusive lock on the source file
    let _lock = FileLock::exclusive(old_path).map_err(|e| format!("Failed to lock file: {}", e))?;

    // Create target directory if it doesn't exist
    if !target_dir.exists() {
        std::fs::create_dir_all(target_dir)
            .map_err(|e| format!("Failed to create target directory: {}", e))?;
    }

    // Move the file
    std::fs::rename(old_path, &new_path).map_err(|e| format!("Failed to move file: {}", e))?;

    // Lock is released on drop

    // Update node.file_path in database
    let new_path_str = new_path.to_string_lossy().to_string();
    let checksum = crate::checksum::compute_file(&new_path)
        .map_err(|e| format!("Failed to compute checksum: {}", e))?;

    database::nodes::update_file_path(pool, &node_id, &new_path_str, &checksum)
        .await
        .map_err(|e| e.to_string())?;

    Ok(new_path_str)
}

#[cfg(test)]
mod tests {
    use crate::database::{self, DbPool};
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

    async fn insert_workspace(pool: &DbPool, id: &str, vault_path: &str) {
        let workspace = database::workspaces::Workspace {
            id: id.to_string(),
            name: id.to_string(),
            color: None,
            vault_path: Some(vault_path.to_string()),
            sync_enabled: true,
            created_at: 0,
            updated_at: 0,
        };
        database::workspaces::create(pool, &workspace)
            .await
            .expect("insert workspace");
    }

    /// A node that was stored is returned, whatever its wikilink sync did: the
    /// creation happened, and the caller is not told otherwise. Creating a node
    /// any other way already worked this way.
    #[tokio::test]
    async fn keeps_a_node_whose_wikilink_sync_failed() {
        let pool = memory_pool().await;
        let dir = tempfile::tempdir().expect("temp dir");
        let file = dir.path().join("Alpha.md");
        std::fs::write(&file, "sees [[Beta]]").expect("write note");
        insert_workspace(&pool, "w1", dir.path().to_str().unwrap()).await;
        // The sync reads a node's edges first, so this makes it fail
        sqlx::query("DROP TABLE edges")
            .execute(&pool)
            .await
            .expect("drop edges");

        let node = super::create_node_from_file_impl(
            &pool,
            file.to_string_lossy().to_string(),
            Some("w1".to_string()),
        )
        .await
        .expect("the node was stored, so it is returned");

        let hash: Option<String> =
            sqlx::query_scalar("SELECT wikilink_synced_hash FROM nodes WHERE id = ?")
                .bind(&node.id)
                .fetch_one(&pool)
                .await
                .expect("hash");
        assert_eq!(hash, None, "a failed sync is left for the next pass");
    }
}
