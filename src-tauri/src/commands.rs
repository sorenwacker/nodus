//! Tauri commands for frontend communication
//!
//! All commands are async and return Results for proper error handling.

use crate::database::{self, edges::Edge, frames::Frame, nodes::Node, storylines::{Storyline, StorylineNode}, themes::Theme};
use crate::themes as theme_module;
use crate::watcher::{write_file_locked, FileChangeEvent, FileLock, VaultWatcher};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Global watcher state
pub struct WatcherState(pub Mutex<Option<VaultWatcher>>);

/// Global file locks state for tracking active edit locks
pub struct LocksState(pub Mutex<std::collections::HashMap<String, FileLock>>);

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

#[tauri::command]
pub async fn update_node_position(id: String, x: f64, y: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_position(pool, &id, x, y)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Edge Commands
// ============================================================================

#[tauri::command]
pub async fn get_edges() -> Result<Vec<Edge>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeInput {
    pub source_node_id: String,
    pub target_node_id: String,
    pub label: Option<String>,
    pub link_type: Option<String>,
    pub color: Option<String>,
    pub storyline_id: Option<String>,
}

#[tauri::command]
pub async fn create_edge(input: CreateEdgeInput) -> Result<Edge, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let edge = Edge {
        id: uuid::Uuid::new_v4().to_string(),
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        label: input.label,
        link_type: input.link_type.unwrap_or_else(|| "related".to_string()),
        weight: 1.0,
        color: input.color,
        storyline_id: input.storyline_id,
        created_at: chrono::Utc::now().timestamp(),
    };

    database::edges::create(pool, &edge)
        .await
        .map_err(|e| e.to_string())?;

    Ok(edge)
}

#[tauri::command]
pub async fn delete_edge(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_edge_color(id: String, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_color(pool, &id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_edge_storyline(id: String, storyline_id: Option<String>, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_storyline_and_color(pool, &id, storyline_id.as_deref(), color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn restore_edge(edge: Edge) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::create(pool, &edge)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn deduplicate_edges() -> Result<u64, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let removed = database::edges::deduplicate(pool)
        .await
        .map_err(|e| e.to_string())?;
    println!("Removed {} duplicate edges", removed);
    Ok(removed)
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
                let checksum = write_file_locked(path, &content)
                    .map_err(|e| e.to_string())?;

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
pub async fn update_node_size(id: String, width: f64, height: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_size(pool, &id, width, height)
        .await
        .map_err(|e| e.to_string())
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

// ============================================================================
// Vault Watcher Commands
// ============================================================================

#[tauri::command]
pub async fn watch_vault(
    path: String,
    app_handle: AppHandle,
    watcher_state: State<'_, WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let mut watcher = VaultWatcher::new(path, move |event: FileChangeEvent| {
        if let Err(e) = app_handle.emit("vault-file-changed", &event) {
            eprintln!("Failed to emit file change event: {}", e);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher.start().map_err(|e| e.to_string())?;

    let mut state = watcher_state.0.lock().unwrap();
    *state = Some(watcher);

    Ok(())
}

#[tauri::command]
pub async fn stop_watching(watcher_state: State<'_, WatcherState>) -> Result<(), String> {
    let mut state = watcher_state.0.lock().unwrap();

    if let Some(ref mut watcher) = *state {
        watcher.stop().map_err(|e| e.to_string())?;
    }

    *state = None;
    Ok(())
}

/// Extract wikilinks from markdown content
fn extract_wikilinks(content: &str) -> Vec<String> {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

/// Get relative folder path from vault root (empty string for root)
fn get_relative_folder(file_path: &std::path::Path, vault_root: &std::path::Path) -> Option<String> {
    file_path.parent().and_then(|parent| {
        parent.strip_prefix(vault_root).ok().map(|rel| {
            rel.to_string_lossy().to_string()
        })
    })
}

#[tauri::command]
pub async fn import_vault(path: String, workspace_id: Option<String>, delete_originals: Option<bool>) -> Result<Vec<Node>, String> {
    let path = PathBuf::from(&path);
    let should_delete = delete_originals.unwrap_or(false);

    println!("Importing vault from: {:?}, workspace_id: {:?}, delete_originals: {}", path, workspace_id, should_delete);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    let mut title_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut node_links: Vec<(String, Vec<String>)> = Vec::new();
    let mut skipped = 0;

    // Track folders and their frames
    // Key: relative folder path, Value: (frame_id, nodes_in_folder count)
    let mut folder_frames: std::collections::HashMap<String, (String, usize)> = std::collections::HashMap::new();
    // Track which node belongs to which folder
    let mut node_folders: Vec<(String, String)> = Vec::new(); // (node_id, folder_path)

    // First pass: collect all files and create frames for folders
    let now = chrono::Utc::now().timestamp_millis();
    let mut files_to_import: Vec<(PathBuf, String)> = Vec::new(); // (file_path, folder)

    for entry in walkdir::WalkDir::new(&path)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            // Skip all hidden files and directories (starting with .)
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.')
        })
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "md") {
            let folder = get_relative_folder(file_path, &path).unwrap_or_default();
            println!("  Found: {:?} in folder: '{}'", file_path.file_name(), folder);
            files_to_import.push((file_path.to_path_buf(), folder.clone()));

            // Track folder for frame creation
            folder_frames.entry(folder).or_insert_with(|| {
                (String::new(), 0) // frame_id will be set later
            }).1 += 1;
        }
    }

    println!("Total files found: {}, folders: {:?}", files_to_import.len(), folder_frames.keys().collect::<Vec<_>>());

    // Create frames for non-root folders with multiple files
    let frame_spacing = 800.0;
    let mut frame_count = 0;
    for (folder, (frame_id_slot, count)) in folder_frames.iter_mut() {
        // Skip root folder (empty string) and single-file folders
        if folder.is_empty() || *count < 2 {
            continue;
        }

        // Check if frame already exists
        let frame_title = folder.split('/').last().unwrap_or(folder);
        if let Ok(Some(existing)) = database::frames::get_by_title_and_workspace(
            pool,
            frame_title,
            workspace_id.as_deref()
        ).await {
            *frame_id_slot = existing.id;
            continue;
        }

        // Create new frame
        let frame_id = uuid::Uuid::new_v4().to_string();
        let frame_x = (frame_count % 3) as f64 * frame_spacing + 50.0;
        let frame_y = (frame_count / 3) as f64 * frame_spacing + 50.0;

        let frame = database::frames::Frame {
            id: frame_id.clone(),
            title: frame_title.to_string(),
            canvas_x: frame_x,
            canvas_y: frame_y,
            width: 600.0,
            height: 400.0,
            color: None,
            workspace_id: workspace_id.clone(),
            created_at: now,
            updated_at: now,
        };

        if database::frames::create(pool, &frame).await.is_ok() {
            *frame_id_slot = frame_id;
            frame_count += 1;
        }
    }

    // Second pass: import files and assign to frames
    let mut folder_node_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
    // Track files to delete after successful import
    let mut files_to_delete: Vec<PathBuf> = Vec::new();

    for (file_path, folder) in files_to_import {
        let file_path_str = file_path.to_string_lossy().to_string();

        // Check if this file is already imported
        if let Ok(Some(existing)) = database::nodes::get_by_file_path(pool, &file_path_str).await {
            if existing.deleted_at.is_some() {
                let _ = database::nodes::hard_delete(pool, &existing.id).await;
            } else {
                skipped += 1;
                continue;
            }
        }

        // Read file content
        let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;

        // Extract title from filename
        let title = file_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        // Extract wikilinks
        let links = extract_wikilinks(&content);

        // Compute checksum
        let checksum = crate::checksum::compute_string(&content);

        // Get frame info for this folder
        let frame_id = folder_frames.get(&folder).and_then(|(fid, _)| {
            if fid.is_empty() { None } else { Some(fid.clone()) }
        });

        // Calculate position within frame or on canvas
        let node_idx = folder_node_counts.entry(folder.clone()).or_insert(0);
        let (initial_x, initial_y) = if frame_id.is_some() {
            // Position within frame
            let cols = 3;
            let spacing = 180.0;
            let frame_info = folder_frames.get(&folder);
            let (frame_x, frame_y) = if let Some((_, _)) = frame_info {
                // Find frame position
                let fi = folder_frames.keys().position(|k| k == &folder).unwrap_or(0);
                let fx = (fi % 3) as f64 * 800.0 + 50.0;
                let fy = (fi / 3) as f64 * 800.0 + 50.0;
                (fx, fy)
            } else {
                (50.0, 50.0)
            };
            let x = frame_x + 30.0 + (*node_idx % cols) as f64 * spacing;
            let y = frame_y + 60.0 + (*node_idx / cols) as f64 * 140.0;
            (x, y)
        } else {
            // Root folder nodes - grid layout
            let cols = 5;
            let spacing = 250.0;
            let idx = nodes.len();
            let x = (idx % cols) as f64 * spacing + 100.0;
            let y = (idx / cols) as f64 * spacing + 100.0;
            (x, y)
        };
        *node_idx += 1;

        let now_ts = chrono::Utc::now().timestamp();
        let node_id = uuid::Uuid::new_v4().to_string();

        // If we're deleting originals, don't store file_path (file won't exist)
        // Also skip checksum since there's no file to track
        let (stored_file_path, stored_checksum) = if should_delete {
            (None, None)
        } else {
            (Some(file_path_str.clone()), Some(checksum))
        };

        let node = Node {
            id: node_id.clone(),
            title: title.clone(),
            file_path: stored_file_path,
            markdown_content: Some(content),
            node_type: "note".to_string(),
            canvas_x: initial_x,
            canvas_y: initial_y,
            width: 200.0,
            height: 120.0,
            z_index: 0,
            frame_id: frame_id.clone(),
            color_theme: None,
            is_collapsed: false,
            tags: None,
            workspace_id: workspace_id.clone(),
            checksum: stored_checksum,
            created_at: now_ts,
            updated_at: now_ts,
            deleted_at: None,
        };

        database::nodes::create(pool, &node)
            .await
            .map_err(|e| e.to_string())?;

        // Track file for deletion if requested
        if should_delete {
            files_to_delete.push(file_path);
        }

        if let Some(fid) = &frame_id {
            node_folders.push((node_id.clone(), fid.clone()));
        }

        title_to_id.insert(title.to_lowercase(), node_id.clone());
        node_links.push((node_id, links));
        nodes.push(node);
    }

    // Create edges for wikilinks (deduplicated)
    let now = chrono::Utc::now().timestamp();
    let mut edge_count = 0;
    let mut seen_edges: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

    for (source_id, links) in node_links {
        let unique_links: std::collections::HashSet<String> = links.into_iter()
            .map(|l| l.to_lowercase())
            .collect();

        for link in unique_links {
            if let Some(target_id) = title_to_id.get(&link) {
                if source_id != *target_id {
                    let edge_key = (source_id.clone(), target_id.clone());
                    if seen_edges.contains(&edge_key) {
                        continue;
                    }
                    seen_edges.insert(edge_key);

                    let edge = database::edges::Edge {
                        id: uuid::Uuid::new_v4().to_string(),
                        source_node_id: source_id.clone(),
                        target_node_id: target_id.clone(),
                        label: None,
                        link_type: "wikilink".to_string(),
                        weight: 1.0,
                        color: None,
                        storyline_id: None,
                        created_at: now,
                    };
                    if database::edges::create(pool, &edge).await.is_ok() {
                        edge_count += 1;
                    }
                }
            }
        }
    }

    // Clean up duplicate edges
    let duplicates_removed = database::edges::deduplicate(pool).await.unwrap_or(0);

    // Delete original files if requested (after successful import)
    let mut deleted_count = 0;
    if !files_to_delete.is_empty() {
        for file in &files_to_delete {
            if file.exists() {
                match std::fs::remove_file(file) {
                    Ok(_) => {
                        deleted_count += 1;
                        println!("Deleted original file: {:?}", file);
                    }
                    Err(e) => {
                        eprintln!("Failed to delete file {:?}: {}", file, e);
                    }
                }
            }
        }
        println!("Deleted {} original files after import", deleted_count);
    }

    println!("Import complete: {} nodes imported, {} skipped, {} edges created, {} frames created, {} duplicates removed{}",
             nodes.len(), skipped, edge_count, frame_count, duplicates_removed,
             if should_delete { format!(", {} files deleted", deleted_count) } else { String::new() });

    Ok(nodes)
}

// ============================================================================
// Workspace Commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub vault_path: Option<String>,
}

#[tauri::command]
pub async fn create_workspace(input: CreateWorkspaceInput) -> Result<database::workspaces::Workspace, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let workspace = database::workspaces::Workspace {
        id: input.id,
        name: input.name,
        color: input.color,
        vault_path: input.vault_path,
        created_at: now,
        updated_at: now,
    };

    database::workspaces::create(pool, &workspace)
        .await
        .map_err(|e| e.to_string())?;

    Ok(workspace)
}

#[tauri::command]
pub async fn get_workspaces() -> Result<Vec<database::workspaces::Workspace>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_workspace(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Read file content from disk (for on-demand sync)
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Refresh all nodes in a workspace from their source files
#[tauri::command]
pub async fn refresh_workspace(workspace_id: Option<String>) -> Result<u32, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get all nodes in workspace
    let nodes = database::nodes::get_all(pool).await.map_err(|e| e.to_string())?;

    let mut updated = 0u32;

    for node in nodes {
        // Skip nodes not in this workspace
        if node.workspace_id != workspace_id {
            continue;
        }

        // Skip nodes without a file path
        let file_path = match &node.file_path {
            Some(p) if !p.is_empty() => p,
            _ => continue,
        };

        // Try to read the file
        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue, // File doesn't exist or can't be read
        };

        // Compute new checksum
        let new_checksum = crate::checksum::compute_string(&content);

        // Skip if content hasn't changed
        if node.checksum.as_ref() == Some(&new_checksum) {
            continue;
        }

        // Update the node
        if let Err(e) = database::nodes::update_content(pool, &node.id, &content).await {
            eprintln!("Failed to update node {}: {}", node.id, e);
            continue;
        }

        updated += 1;
    }

    Ok(updated)
}

// ============================================================================
// HTTP Commands (for LLM API calls)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct HttpRequestInput {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Make an HTTP request from Rust (bypasses CORS)
#[tauri::command]
pub async fn http_request(input: HttpRequestInput) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();

    let timeout = std::time::Duration::from_millis(input.timeout_ms.unwrap_or(60000));

    let mut request = match input.method.to_uppercase().as_str() {
        "GET" => client.get(&input.url),
        "POST" => client.post(&input.url),
        "PUT" => client.put(&input.url),
        "DELETE" => client.delete(&input.url),
        "PATCH" => client.patch(&input.url),
        _ => return Err(format!("Unsupported HTTP method: {}", input.method)),
    };

    request = request.timeout(timeout);

    for (key, value) in input.headers {
        request = request.header(&key, &value);
    }

    if let Some(body) = input.body {
        request = request.body(body);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
}

// ============================================================================
// PDF Commands
// ============================================================================

#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {}", e))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    Ok(text)
}

#[tauri::command]
pub async fn extract_pdf_annotations(path: String) -> Result<Vec<crate::pdf::PdfAnnotation>, String> {
    let path = std::path::Path::new(&path);
    crate::pdf::extract_annotations(path)
}

// ============================================================================
// File Lock Commands
// ============================================================================

/// Check if a file can be locked for editing
/// Returns true if file is available, false if locked by another process
#[tauri::command]
pub async fn check_file_available(path: String) -> Result<bool, String> {
    let path = std::path::Path::new(&path);
    if !path.exists() {
        return Ok(true); // Non-existent files are "available"
    }

    match FileLock::exclusive(path) {
        Ok(_lock) => Ok(true), // Lock acquired and immediately released
        Err(crate::watcher::WatcherError::FileLocked) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Acquire an exclusive lock on a file for editing
/// Returns node_id if successful, error if file is locked
#[tauri::command]
pub async fn acquire_edit_lock(
    node_id: String,
    locks_state: State<'_, LocksState>,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get the node to find its file path
    let node = database::nodes::get_by_id(pool, &node_id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Node not found".to_string())?;

    let file_path = match &node.file_path {
        Some(p) if !p.is_empty() => p.clone(),
        _ => return Ok(()), // No file to lock
    };

    let path = std::path::Path::new(&file_path);
    if !path.exists() {
        return Ok(()); // File doesn't exist yet
    }

    // Try to acquire exclusive lock
    let lock = FileLock::exclusive(path).map_err(|e| match e {
        crate::watcher::WatcherError::FileLocked => {
            "File is being edited in another application".to_string()
        }
        other => other.to_string(),
    })?;

    // Store lock
    let mut locks = locks_state.0.lock().unwrap();
    locks.insert(node_id, lock);

    Ok(())
}

/// Release an edit lock on a file
#[tauri::command]
pub async fn release_edit_lock(
    node_id: String,
    locks_state: State<'_, LocksState>,
) -> Result<(), String> {
    let mut locks = locks_state.0.lock().unwrap();
    locks.remove(&node_id); // Lock is released on drop
    Ok(())
}

/// Get list of currently locked node IDs
#[tauri::command]
pub async fn get_locked_nodes(
    locks_state: State<'_, LocksState>,
) -> Result<Vec<String>, String> {
    let locks = locks_state.0.lock().unwrap();
    Ok(locks.keys().cloned().collect())
}

// ============================================================================
// Storyline Commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateStorylineInput {
    pub title: String,
    pub description: Option<String>,
    pub color: Option<String>,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_storyline(input: CreateStorylineInput) -> Result<Storyline, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let storyline = Storyline {
        id: uuid::Uuid::new_v4().to_string(),
        title: input.title,
        description: input.description,
        color: input.color,
        workspace_id: input.workspace_id,
        created_at: now,
        updated_at: now,
    };

    database::storylines::create(pool, &storyline)
        .await
        .map_err(|e| e.to_string())?;

    Ok(storyline)
}

#[tauri::command]
pub async fn get_storylines(workspace_id: Option<String>) -> Result<Vec<Storyline>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::get_by_workspace(pool, workspace_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_storyline(id: String) -> Result<Option<Storyline>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_storyline(id: String, title: String, description: Option<String>, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::update(pool, &id, &title, description.as_deref(), color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_storyline(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_node_to_storyline(storyline_id: String, node_id: String, position: Option<i32>) -> Result<StorylineNode, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::add_node(pool, &storyline_id, &node_id, position)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_node_from_storyline(storyline_id: String, node_id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::remove_node(pool, &storyline_id, &node_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_storyline_nodes(storyline_id: String, node_ids: Vec<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::reorder_nodes(pool, &storyline_id, &node_ids)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_storyline_nodes(storyline_id: String) -> Result<Vec<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::get_nodes_with_data(pool, &storyline_id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Web Search Commands
// ============================================================================

#[derive(Debug, serde::Serialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub content: String,
}

/// Search the web using Tavily API
/// Requires a Tavily API key (free tier: 1000 credits/month, no credit card)
/// Get your key at: https://tavily.com/
#[tauri::command]
pub async fn web_search(query: String, api_key: Option<String>) -> Result<Vec<SearchResult>, String> {
    let api_key = api_key.filter(|k| !k.is_empty())
        .ok_or_else(|| "No search API key configured. Get a free Tavily API key at https://tavily.com/ and add it in Settings.".to_string())?;

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "api_key": api_key,
        "query": query,
        "max_results": 5,
        "include_answer": false
    });

    let response = client.post("https://api.tavily.com/search")
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;

    if response.status() == 401 || response.status() == 403 {
        return Err("Invalid Tavily API key. Check your key in Settings.".to_string());
    }

    if response.status() == 429 {
        return Err("Tavily rate limit exceeded. Try again later.".to_string());
    }

    if !response.status().is_success() {
        return Err(format!("Search returned status: {}", response.status()));
    }

    let json: serde_json::Value = response.json().await
        .map_err(|e| format!("Failed to parse search results: {}", e))?;

    let mut results: Vec<SearchResult> = Vec::new();

    if let Some(search_results) = json.get("results").and_then(|r| r.as_array()) {
        for item in search_results.iter().take(5) {
            let title = item.get("title").and_then(|t| t.as_str()).unwrap_or("").to_string();
            let url = item.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string();
            let content = item.get("content").and_then(|c| c.as_str()).unwrap_or("").to_string();

            if !title.is_empty() && !url.is_empty() {
                results.push(SearchResult { title, url, content });
            }
        }
    }

    if results.is_empty() {
        return Err("No search results found".to_string());
    }

    Ok(results)
}

/// Fetch and extract content from a URL (handles JavaScript via Jina Reader)
#[tauri::command]
pub async fn fetch_url(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;

    // Use Jina Reader to fetch and extract content (handles JS rendering)
    // This service renders the page and returns clean markdown
    let jina_url = format!("https://r.jina.ai/{}", url);

    let response = client.get(&jina_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .header("Accept", "text/plain")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        // Fallback to direct fetch if Jina fails
        return fetch_url_direct(&client, &url).await;
    }

    let content = response.text().await
        .map_err(|e| format!("Failed to read content: {}", e))?;

    Ok(content)
}

/// Direct fetch fallback (for when Jina is unavailable)
async fn fetch_url_direct(client: &reqwest::Client, url: &str) -> Result<String, String> {
    let response = client.get(url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .send()
        .await
        .map_err(|e| format!("Failed to fetch URL: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("URL returned status: {}", response.status()));
    }

    let html = response.text().await
        .map_err(|e| format!("Failed to read content: {}", e))?;

    // Basic HTML to text conversion
    // Remove script and style tags first
    let script_re = regex::Regex::new(r"(?is)<script[^>]*>.*?</script>").unwrap();
    let style_re = regex::Regex::new(r"(?is)<style[^>]*>.*?</style>").unwrap();
    let tag_re = regex::Regex::new(r"<[^>]+>").unwrap();
    let whitespace_re = regex::Regex::new(r"\s+").unwrap();

    let text = script_re.replace_all(&html, "");
    let text = style_re.replace_all(&text, "");
    let text = tag_re.replace_all(&text, " ");
    let text = html_escape::decode_html_entities(&text);
    let text = whitespace_re.replace_all(&text, " ");
    let text = text.trim().to_string();

    Ok(text)
}

// ============================================================================
// Theme Commands
// ============================================================================

#[tauri::command]
pub async fn get_themes() -> Result<Vec<Theme>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_theme(name: String) -> Result<Option<Theme>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::get_by_name(pool, &name)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateThemeInput {
    pub name: String,
    pub display_name: String,
    pub yaml_content: String,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_theme(input: CreateThemeInput) -> Result<Theme, String> {
    // Validate YAML before saving
    theme_module::parse_yaml(&input.yaml_content)
        .map_err(|e| format!("Invalid theme YAML: {}", e))?;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Check if name already exists
    if database::themes::get_by_name(pool, &input.name).await.map_err(|e| e.to_string())?.is_some() {
        return Err(format!("Theme with name '{}' already exists", input.name));
    }

    let now = chrono::Utc::now().timestamp();
    let theme = Theme {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name,
        display_name: input.display_name,
        yaml_content: input.yaml_content,
        is_builtin: 0,
        workspace_id: input.workspace_id,
        created_at: now,
        updated_at: now,
    };

    database::themes::create(pool, &theme)
        .await
        .map_err(|e| e.to_string())?;

    Ok(theme)
}

#[derive(Debug, Deserialize)]
pub struct UpdateThemeInput {
    pub id: String,
    pub yaml_content: String,
    pub display_name: String,
}

#[tauri::command]
pub async fn update_theme(input: UpdateThemeInput) -> Result<(), String> {
    // Validate YAML before saving
    theme_module::parse_yaml(&input.yaml_content)
        .map_err(|e| format!("Invalid theme YAML: {}", e))?;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Check if theme exists and is not builtin
    let existing = database::themes::get_by_id(pool, &input.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Theme not found".to_string())?;

    if existing.is_builtin == 1 {
        return Err("Cannot modify built-in themes".to_string());
    }

    database::themes::update(pool, &input.id, &input.yaml_content, &input.display_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_theme(id: String) -> Result<bool, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_theme_yaml(yaml_content: String) -> Result<bool, String> {
    match theme_module::parse_yaml(&yaml_content) {
        Ok(_) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

// ============================================================================
// Frame Commands
// ============================================================================

#[tauri::command]
pub async fn get_frames() -> Result<Vec<Frame>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFrameInput {
    pub id: String,
    pub title: String,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub width: f64,
    pub height: f64,
    pub color: Option<String>,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_frame(input: CreateFrameInput) -> Result<Frame, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    let frame = Frame {
        id: input.id,
        title: input.title,
        canvas_x: input.canvas_x,
        canvas_y: input.canvas_y,
        width: input.width,
        height: input.height,
        color: input.color,
        workspace_id: input.workspace_id,
        created_at: now,
        updated_at: now,
    };

    database::frames::create(pool, &frame)
        .await
        .map_err(|e| e.to_string())?;

    Ok(frame)
}

#[tauri::command]
pub async fn update_frame_position(id: String, x: f64, y: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::update_position(pool, &id, x, y)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_frame_size(id: String, width: f64, height: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::update_size(pool, &id, width, height)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_frame_title(id: String, title: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::update_title(pool, &id, &title)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_frame_color(id: String, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::update_color(pool, &id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_frame(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Ontology Import Commands
// ============================================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOntologyInput {
    pub file_path: String,
    pub workspace_id: Option<String>,
    #[serde(default = "default_true")]
    pub create_class_nodes: bool,
    #[serde(default)]
    pub create_individual_nodes: bool,
    #[serde(default)]
    pub layout: crate::ontology::OntologyLayout,
}

fn default_true() -> bool { true }

#[tauri::command]
pub async fn import_ontology(
    input: ImportOntologyInput,
) -> Result<crate::ontology::OntologyImportResult, String> {
    use crate::ontology::{parse_ontology, transform_to_nodus, transformer::TransformOptions, types::OntologyData};
    use std::path::Path;

    let path = Path::new(&input.file_path);

    if !path.exists() {
        return Err("Ontology file/directory does not exist".to_string());
    }

    // Parse the ontology - either a single file or all files in a directory
    let ontology_data = if path.is_dir() {
        // Parse all ontology files in the directory
        let mut combined = OntologyData {
            individuals: Vec::new(),
            object_properties: Vec::new(),
            classes: Vec::new(),
            subclass_relations: Vec::new(),
            property_definitions: Vec::new(),
        };

        let extensions = ["ttl", "rdf", "owl", "jsonld"];
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_path = entry.path();

            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                if extensions.contains(&ext) {
                    println!("Parsing ontology file: {:?}", file_path);
                    match parse_ontology(&file_path) {
                        Ok(data) => {
                            combined.individuals.extend(data.individuals);
                            combined.object_properties.extend(data.object_properties);
                            combined.classes.extend(data.classes);
                            combined.subclass_relations.extend(data.subclass_relations);
                            combined.property_definitions.extend(data.property_definitions);
                        }
                        Err(e) => {
                            eprintln!("Warning: Failed to parse {:?}: {}", file_path, e);
                        }
                    }
                }
            }
        }

        if combined.individuals.is_empty() && combined.classes.is_empty() {
            return Err("No ontology data found in directory".to_string());
        }

        combined
    } else {
        // Parse single file
        parse_ontology(path).map_err(|e| format!("Failed to parse ontology: {}", e))?
    };

    let total_entities = ontology_data.classes.len() + ontology_data.individuals.len();
    println!(
        "Parsed ontology: {} individuals, {} object properties, {} classes ({} total)",
        ontology_data.individuals.len(),
        ontology_data.object_properties.len(),
        ontology_data.classes.len(),
        total_entities
    );

    // Force grid layout for large ontologies (hierarchical is too slow)
    let layout = if total_entities > 500 {
        println!("Large ontology detected ({} entities), forcing grid layout", total_entities);
        crate::ontology::OntologyLayout::Grid
    } else {
        input.layout
    };

    // Transform to nodes and edges
    let options = TransformOptions {
        create_class_nodes: input.create_class_nodes,
        create_individual_nodes: input.create_individual_nodes,
        workspace_id: input.workspace_id,
        layout,
        ..Default::default()
    };

    let result = transform_to_nodus(&ontology_data, &options);

    // Save nodes to database
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let mut node_ids = Vec::with_capacity(result.nodes.len());

    for node in &result.nodes {
        database::nodes::create(pool, node)
            .await
            .map_err(|e| format!("Failed to create node: {}", e))?;
        node_ids.push(node.id.clone());
    }

    // Save edges to database
    for edge in &result.edges {
        database::edges::create(pool, edge)
            .await
            .map_err(|e| format!("Failed to create edge: {}", e))?;
    }

    println!(
        "Import complete: {} nodes created, {} edges created, {} class nodes",
        result.nodes.len(),
        result.edges.len(),
        result.class_nodes_created
    );

    Ok(crate::ontology::OntologyImportResult {
        nodes_created: result.nodes.len(),
        edges_created: result.edges.len(),
        class_nodes_created: result.class_nodes_created,
        node_ids,
    })
}

// ============================================================================
// Zotero Commands
// ============================================================================

/// Detect the Zotero data directory path
#[tauri::command]
pub async fn detect_zotero_path() -> Result<Option<String>, String> {
    Ok(crate::zotero::detect_zotero_path().map(|p| p.to_string_lossy().to_string()))
}

/// List all collections in the Zotero library
#[tauri::command]
pub async fn list_zotero_collections(
    zotero_path: String,
) -> Result<Vec<crate::zotero::ZoteroCollection>, String> {
    let path = PathBuf::from(zotero_path);
    crate::zotero::get_collections(&path).await
}

/// Get items in a Zotero collection
#[tauri::command]
pub async fn get_zotero_collection_items(
    zotero_path: String,
    collection_key: String,
) -> Result<Vec<crate::zotero::ZoteroItem>, String> {
    let path = PathBuf::from(zotero_path);
    crate::zotero::get_collection_items(&path, &collection_key).await
}
