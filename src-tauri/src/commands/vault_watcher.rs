//! Vault watcher commands for file synchronization

use crate::database::{self, nodes::Node};
use crate::import_helpers;
use crate::layout_config;
use crate::watcher::{FileChangeEvent, VaultWatcher};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

use super::{
    nodes::{build_title_to_id_map, sync_wikilinks_for_node, sync_wikilinks_for_node_with_map},
    should_exclude_file, WatcherState,
};

// ============================================================================
// Vault Watcher Commands
// ============================================================================

#[tauri::command]
pub async fn watch_vault(
    path: String,
    app_handle: AppHandle,
    watcher_state: State<'_, WatcherState>,
) -> Result<(), String> {
    let path_clone = path.clone();
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    println!("[Watcher] Starting vault watcher for: {}", path_clone);

    let mut watcher = VaultWatcher::new(path, move |event: FileChangeEvent| {
        println!(
            "[Watcher] File change detected: {:?} - {:?}",
            event.change_type, event.path
        );
        if let Err(e) = app_handle.emit("vault-file-changed", &event) {
            eprintln!("Failed to emit file change event: {}", e);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher.start().map_err(|e| e.to_string())?;
    println!("[Watcher] Vault watcher started successfully");

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

/// Sync missing files - create nodes for vault files that don't have nodes yet
#[tauri::command]
pub async fn sync_missing_files(
    workspace_id: String,
    vault_path: String,
) -> Result<Vec<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let vault_path = std::path::Path::new(&vault_path);

    if !vault_path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    // First, restore any soft-deleted nodes whose files still exist
    let restored = database::nodes::restore_if_file_exists(pool, &workspace_id)
        .await
        .map_err(|e| e.to_string())?;
    if restored > 0 {
        println!(
            "[SyncMissing] Restored {} soft-deleted nodes with existing files",
            restored
        );
    }

    // Get all existing file paths for this workspace
    let existing_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    let existing_paths: std::collections::HashSet<String> = existing_nodes
        .iter()
        .filter(|n| n.workspace_id.as_deref() == Some(&workspace_id))
        .filter_map(|n| n.file_path.clone())
        .collect();

    println!(
        "[SyncMissing] Found {} existing nodes with file paths",
        existing_paths.len()
    );

    // Scan vault for all .md files
    let mut created_nodes = Vec::new();
    let mut node_count = existing_nodes
        .iter()
        .filter(|n| n.workspace_id.as_deref() == Some(&workspace_id))
        .count();

    for entry in walkdir::WalkDir::new(vault_path)
        .into_iter()
        .filter_entry(|e| {
            // Skip hidden files and directories
            !e.file_name().to_string_lossy().starts_with('.')
        })
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "md") {
            continue;
        }

        // Skip excluded files (CLAUDE.md, README.md, hidden files)
        if should_exclude_file(path) {
            continue;
        }

        let path_str = path.to_string_lossy().to_string();
        if existing_paths.contains(&path_str) {
            continue; // Already has a node
        }

        println!("[SyncMissing] Creating node for: {}", path_str);

        // Read file content
        let content = match std::fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[SyncMissing] Failed to read {}: {}", path_str, e);
                continue;
            }
        };

        // Extract title from filename
        let title = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Untitled")
            .to_string();

        // Compute checksum
        let checksum = crate::checksum::compute_string(&content);

        // Position in grid
        let x = (node_count % 5) as f64 * 250.0 + 100.0;
        let y = (node_count / 5) as f64 * 200.0 + 100.0;
        node_count += 1;

        let now = chrono::Utc::now().timestamp();
        let node_id = uuid::Uuid::new_v4().to_string();

        let node = Node {
            id: node_id.clone(),
            title,
            file_path: Some(path_str),
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
            workspace_id: Some(workspace_id.clone()),
            checksum: Some(checksum),
            created_at: now,
            updated_at: now,
            deleted_at: None,
        };

        if let Err(e) = database::nodes::create(pool, &node).await {
            eprintln!("[SyncMissing] Failed to create node: {}", e);
            continue;
        }

        // Create edges for wikilinks
        let links = import_helpers::extract_wikilinks(&content);
        let _ = sync_wikilinks_for_node(pool, &node_id, &links).await;

        created_nodes.push(node);
    }

    println!("[SyncMissing] Created {} new nodes", created_nodes.len());
    Ok(created_nodes)
}

/// Link existing nodes to files by matching title to filename.
/// This is for nodes that were created before file sync was implemented.
/// Also re-links nodes whose file_path no longer exists.
#[tauri::command]
pub async fn link_nodes_to_files(workspace_id: String, vault_path: String) -> Result<i32, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let vault_path_obj = std::path::Path::new(&vault_path);

    if !vault_path_obj.exists() {
        return Err("Vault path does not exist".to_string());
    }

    // Get all nodes in workspace
    let all_nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    let workspace_nodes: Vec<_> = all_nodes
        .iter()
        .filter(|n| n.workspace_id.as_deref() == Some(&workspace_id))
        .collect();

    // Find nodes that need linking:
    // 1. No file_path set
    // 2. file_path set but file doesn't exist
    let nodes_to_link: Vec<_> = workspace_nodes
        .iter()
        .filter(|n| {
            match &n.file_path {
                None => true,                                       // No path set
                Some(path) => !std::path::Path::new(path).exists(), // Path doesn't exist
            }
        })
        .copied()
        .collect();

    println!(
        "[LinkNodes] Workspace has {} total nodes, {} need linking (no path or path invalid)",
        workspace_nodes.len(),
        nodes_to_link.len()
    );

    // Debug: show nodes that need linking
    for node in nodes_to_link.iter().take(10) {
        println!(
            "[LinkNodes] Need link: '{}' -> current path: {:?}",
            node.title, node.file_path
        );
    }

    // Build a map of filename (without extension) -> file path
    let mut filename_to_path: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();

    for entry in walkdir::WalkDir::new(vault_path_obj)
        .into_iter()
        .filter_entry(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if path.extension().is_none_or(|ext| ext != "md") {
            continue;
        }

        // Skip excluded files (CLAUDE.md, README.md, hidden files)
        if should_exclude_file(path) {
            continue;
        }

        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            let normalized = stem.to_lowercase();
            filename_to_path.insert(normalized, path.to_string_lossy().to_string());
        }
    }

    println!(
        "[LinkNodes] Found {} md files in vault",
        filename_to_path.len()
    );

    // Match nodes to files
    let mut linked_count = 0;
    let mut not_found_count = 0;
    for node in nodes_to_link {
        let title_normalized = node.title.to_lowercase();
        if let Some(file_path) = filename_to_path.get(&title_normalized) {
            // Compute checksum
            let checksum = match crate::checksum::compute_file(std::path::Path::new(file_path)) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!(
                        "[LinkNodes] Failed to compute checksum for {}: {}",
                        file_path, e
                    );
                    continue;
                }
            };

            // Update node with file_path and checksum (single call)
            if let Err(e) =
                database::nodes::update_file_path(pool, &node.id, file_path, &checksum).await
            {
                eprintln!(
                    "[LinkNodes] Failed to update file_path for {}: {}",
                    node.title, e
                );
                continue;
            }

            println!("[LinkNodes] Linked '{}' -> {}", node.title, file_path);
            linked_count += 1;
        } else {
            not_found_count += 1;
            if not_found_count <= 5 {
                println!(
                    "[LinkNodes] No file found for node: '{}' (looking for '{}.md')",
                    node.title, title_normalized
                );
            }
        }
    }

    println!(
        "[LinkNodes] Linked {} nodes, {} not found",
        linked_count, not_found_count
    );
    Ok(linked_count)
}

#[tauri::command]
pub async fn import_vault(
    path: String,
    workspace_id: Option<String>,
    delete_originals: Option<bool>,
) -> Result<Vec<Node>, String> {
    let path = PathBuf::from(&path);
    let should_delete = delete_originals.unwrap_or(false);

    println!(
        "Importing vault from: {:?}, workspace_id: {:?}, delete_originals: {}",
        path, workspace_id, should_delete
    );

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    let mut title_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut node_links: Vec<(String, Vec<String>)> = Vec::new();
    let mut skipped = 0;

    // Track folders and their frames
    // Key: relative folder path, Value: (frame_id, frame_x, frame_y)
    let mut folder_frames: std::collections::HashMap<String, (String, f64, f64)> =
        std::collections::HashMap::new();
    // Track folder file counts separately
    let mut folder_file_counts: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();

    // First pass: collect all files and create frames for folders
    let now = chrono::Utc::now().timestamp_millis();
    let (collected_files, folder_counts) = import_helpers::collect_markdown_files(&path);
    let files_to_import: Vec<(PathBuf, String)> = collected_files
        .into_iter()
        .map(|f| (f.path, f.folder))
        .collect();

    // Store folder file counts
    for (folder, count) in &folder_counts {
        folder_file_counts.insert(folder.clone(), *count);
    }

    // Create frames for non-root folders with multiple files
    let mut frame_count = 0;
    for (folder, count) in folder_counts {
        // Skip root folder (empty string) and single-file folders
        if folder.is_empty() || count < 2 {
            continue;
        }

        // Check if frame already exists
        let frame_title = folder.split('/').next_back().unwrap_or(&folder);
        if let Ok(Some(existing)) =
            database::frames::get_by_title_and_workspace(pool, frame_title, workspace_id.as_deref())
                .await
        {
            // Use existing frame's position
            folder_frames.insert(folder, (existing.id, existing.canvas_x, existing.canvas_y));
            continue;
        }

        // Create new frame with size based on node count
        let frame_id = uuid::Uuid::new_v4().to_string();
        let frame_x = (frame_count % layout_config::FRAME_COLS) as f64
            * layout_config::FRAME_SPACING
            + layout_config::FRAME_ORIGIN;
        let frame_y = (frame_count / layout_config::FRAME_COLS) as f64
            * layout_config::FRAME_SPACING
            + layout_config::FRAME_ORIGIN;
        let (frame_width, frame_height) = layout_config::calculate_frame_size(count);

        let frame = database::frames::Frame {
            id: frame_id.clone(),
            title: frame_title.to_string(),
            parent_frame_id: None,
            canvas_x: frame_x,
            canvas_y: frame_y,
            width: frame_width,
            height: frame_height,
            color: None,
            workspace_id: workspace_id.clone(),
            folder_path: Some(folder.clone()),
            created_at: now,
            updated_at: now,
        };

        if database::frames::create(pool, &frame).await.is_ok() {
            // Store frame position for node placement
            folder_frames.insert(folder, (frame_id, frame_x, frame_y));
            frame_count += 1;
        }
    }

    // Second pass: import files and assign to frames
    let mut folder_node_counts: std::collections::HashMap<String, usize> =
        std::collections::HashMap::new();
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
        let links = import_helpers::extract_wikilinks(&content);

        // Compute checksum
        let checksum = crate::checksum::compute_string(&content);

        // Get frame info for this folder (frame_id, frame_x, frame_y)
        let frame_info = folder_frames.get(&folder).cloned();
        let frame_id = frame_info.as_ref().map(|(fid, _, _)| fid.clone());

        // Calculate position within frame or on canvas
        let node_idx = folder_node_counts.entry(folder.clone()).or_insert(0);
        let (initial_x, initial_y) = if let Some((_, frame_x, frame_y)) = frame_info {
            // Position within frame using stored frame position
            let x = frame_x
                + layout_config::FRAME_NODE_X_OFFSET
                + (*node_idx % layout_config::FRAME_NODE_COLS) as f64
                    * layout_config::FRAME_NODE_SPACING;
            let y = frame_y
                + layout_config::FRAME_NODE_Y_OFFSET
                + (*node_idx / layout_config::FRAME_NODE_COLS) as f64
                    * layout_config::FRAME_NODE_ROW_HEIGHT;
            (x, y)
        } else {
            // Root folder nodes - grid layout
            let idx = nodes.len();
            let x = (idx % layout_config::ROOT_NODE_COLS) as f64 * layout_config::ROOT_NODE_SPACING
                + layout_config::ROOT_NODE_ORIGIN;
            let y = (idx / layout_config::ROOT_NODE_COLS) as f64 * layout_config::ROOT_NODE_SPACING
                + layout_config::ROOT_NODE_ORIGIN;
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
            width: layout_config::NODE_WIDTH,
            height: layout_config::NODE_HEIGHT,
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

        // Map both filename and relative path for wikilink resolution
        // e.g., "note" and "subfolder/note" both map to the same node
        title_to_id.insert(title.to_lowercase(), node_id.clone());
        if !folder.is_empty() {
            let path_key = format!("{}/{}", folder, title).to_lowercase();
            title_to_id.insert(path_key, node_id.clone());
        }
        node_links.push((node_id, links));
        nodes.push(node);
    }

    // Create edges for wikilinks (deduplicated)
    let now = chrono::Utc::now().timestamp();
    let mut edge_count = 0;
    let mut seen_edges: std::collections::HashSet<(String, String)> =
        std::collections::HashSet::new();

    for (source_id, links) in node_links {
        let unique_links: std::collections::HashSet<String> = links
            .into_iter()
            .map(|l| {
                // Strip section anchors (e.g., "Note#Section" -> "Note")
                let without_anchor = l.split('#').next().unwrap_or(&l);
                without_anchor.to_lowercase()
            })
            .collect();

        for link in unique_links {
            // Try exact match first, then fall back to filename-only match
            // This handles [[note]], [[folder/note]], and [[note#section]] style links
            let target_id = title_to_id
                .get(&link)
                .or_else(|| {
                    // Extract filename from path (e.g., "folder/note" -> "note")
                    link.rsplit('/')
                        .next()
                        .and_then(|name| title_to_id.get(name))
                })
                .cloned();

            if let Some(target_id) = target_id {
                if source_id != target_id {
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
                        directed: true,
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

/// Refresh all nodes in a workspace from their source files
#[tauri::command]
pub async fn refresh_workspace(workspace_id: Option<String>) -> Result<u32, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get all nodes in workspace
    let nodes = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Build title map ONCE for wikilink resolution (performance)
    let title_to_id = build_title_to_id_map(&nodes);

    let mut updated = 0u32;

    for node in &nodes {
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

        // Update the node content AND checksum
        if let Err(e) =
            database::nodes::update_content_and_checksum(pool, &node.id, &content, &new_checksum)
                .await
        {
            eprintln!("Failed to update node {}: {}", node.id, e);
            continue;
        }

        // Sync wikilinks for this node to create/remove edges
        let links = import_helpers::extract_wikilinks(&content);
        if let Err(e) = sync_wikilinks_for_node_with_map(pool, &node.id, &links, &title_to_id).await
        {
            eprintln!("Failed to sync wikilinks for node {}: {}", node.id, e);
        }

        updated += 1;
    }

    println!("[RefreshWorkspace] Updated {} nodes", updated);
    Ok(updated)
}
