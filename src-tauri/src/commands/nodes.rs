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

    Ok(node)
}

/// Create a node from a vault file (used during sync)
#[tauri::command]
pub async fn create_node_from_file(
    file_path: String,
    workspace_id: Option<String>,
) -> Result<Node, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let path = std::path::Path::new(&file_path);

    // Validate file path - must be a .md file and not contain path traversal
    if !file_path.ends_with(".md") {
        return Err("Only .md files can be imported".to_string());
    }
    if file_path.contains("..") {
        return Err("Invalid file path".to_string());
    }

    // Verify file exists and is within a valid workspace vault
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
            }
        }
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

    // Create edges for wikilinks
    let links = import_helpers::extract_wikilinks(&content);
    sync_wikilinks_for_node(pool, &node_id, &links).await?;

    Ok(node)
}

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
    // Get existing wikilink edges from this node
    let existing_edges = database::edges::get_edges_from_node(pool, source_id)
        .await
        .map_err(|e| e.to_string())?;

    let existing_wikilink_edges: Vec<_> = existing_edges
        .iter()
        .filter(|e| e.link_type == "wikilink")
        .collect();

    let existing_targets: std::collections::HashSet<String> = existing_wikilink_edges
        .iter()
        .map(|e| e.target_node_id.clone())
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

    // Create new edges
    for target_id in &should_exist {
        if !existing_targets.contains(target_id) {
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

    // Write content to file
    let content = node.markdown_content.unwrap_or_default();
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

        // Write content to file
        let content = node.markdown_content.unwrap_or_default();
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

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct UpdateNodeInput {
    pub id: String,
    pub title: Option<String>,
    pub markdown_content: Option<String>,
    pub node_type: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub async fn update_node(_input: UpdateNodeInput) -> Result<(), String> {
    let _pool = database::get_pool().map_err(|e| e.to_string())?;

    // TODO: Implement partial update
    // For now, just update position is implemented

    Ok(())
}

#[tauri::command]
pub async fn delete_node(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get the node first to check for file_path
    if let Ok(Some(node)) = database::nodes::get_by_id(pool, &id).await {
        if let Some(file_path) = &node.file_path {
            let path = std::path::Path::new(file_path);
            if path.exists() {
                // Create .nodus-trash directory next to the file
                if let Some(parent) = path.parent() {
                    let trash_dir = parent.join(".nodus-trash");
                    if !trash_dir.exists() {
                        std::fs::create_dir_all(&trash_dir)
                            .map_err(|e| format!("Failed to create trash dir: {}", e))?;
                    }

                    // Move file to trash with original filename
                    if let Some(filename) = path.file_name() {
                        let trash_path = trash_dir.join(filename);
                        std::fs::rename(path, &trash_path)
                            .map_err(|e| format!("Failed to move file to trash: {}", e))?;
                    }
                }
            }
        }
    }

    database::nodes::soft_delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Batch delete multiple nodes efficiently
#[tauri::command]
pub async fn delete_nodes(ids: Vec<String>) -> Result<(), String> {
    if ids.is_empty() {
        return Ok(());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get all nodes with file_paths in one query
    let nodes = database::nodes::get_many_by_ids(pool, &ids)
        .await
        .map_err(|e| e.to_string())?;

    // Move files to trash (collect errors but don't fail)
    for node in &nodes {
        if let Some(file_path) = &node.file_path {
            let path = std::path::Path::new(file_path);
            if path.exists() {
                if let Some(parent) = path.parent() {
                    let trash_dir = parent.join(".nodus-trash");
                    if !trash_dir.exists() {
                        let _ = std::fs::create_dir_all(&trash_dir);
                    }
                    if let Some(filename) = path.file_name() {
                        let trash_path = trash_dir.join(filename);
                        let _ = std::fs::rename(path, &trash_path);
                    }
                }
            }
        }
    }

    // Batch soft delete all nodes
    database::nodes::soft_delete_many(pool, &ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_node(node: Node) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Restore file from trash if it exists
    if let Some(file_path) = &node.file_path {
        let path = std::path::Path::new(file_path);
        if let Some(parent) = path.parent() {
            let trash_dir = parent.join(".nodus-trash");
            if let Some(filename) = path.file_name() {
                let trash_path = trash_dir.join(filename);
                if trash_path.exists() && !path.exists() {
                    std::fs::rename(&trash_path, path)
                        .map_err(|e| format!("Failed to restore file from trash: {}", e))?;
                }
            }
        }
    }

    database::nodes::restore(pool, &node.id)
        .await
        .map_err(|e| e.to_string())
}

/// Get all soft-deleted nodes for a workspace
#[tauri::command]
pub async fn get_deleted_nodes(workspace_id: String) -> Result<Vec<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::get_deleted(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

/// Restore nodes whose files still exist on disk
#[tauri::command]
pub async fn restore_nodes_with_files(workspace_id: String) -> Result<usize, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::restore_if_file_exists(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())
}

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

    // Check if node has a file_path - if so, write to file with locking
    if let Some(node) = database::nodes::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())?
    {
        if let Some(ref file_path) = node.file_path {
            let path = std::path::Path::new(file_path);
            if path.exists() {
                // Write to file with exclusive lock and get new checksum
                let checksum = write_file_locked(path, &content).map_err(|e| e.to_string())?;

                // Update content and checksum in database
                database::nodes::update_content_and_checksum(pool, &id, &content, &checksum)
                    .await
                    .map_err(|e| e.to_string())?;

                return Ok(Some(checksum));
            }
        }
    }

    // No file_path or file doesn't exist - just update database
    database::nodes::update_content(pool, &id, &content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(None)
}

#[tauri::command]
pub async fn update_node_title(id: String, title: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_title(pool, &id, &title)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_file_path(id: String, file_path: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    // Treat empty string as None (clear file_path)
    let file_path = file_path.filter(|p| !p.is_empty());
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

    // Calculate new path
    let target_dir = Path::new(&target_folder);
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

    // Calculate new path
    let target_dir = Path::new(&target_folder);
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
                // Use custom filename provided by the user
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
