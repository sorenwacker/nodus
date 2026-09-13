//! Vault watcher commands for file synchronization

use crate::database::{self, nodes::Node};
use crate::import_helpers;
use crate::layout_config;
use crate::watcher::{FileChangeEvent, VaultWatcher};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, State};

use super::{
    wikilinks,
    wikilinks::{build_title_to_id_map, sync_wikilinks_for_node, sync_wikilinks_for_node_with_map},
    WatcherState,
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
    sync_missing_files_impl(pool, &workspace_id, &vault_path).await
}

/// Create nodes for the vault's files that have none yet.
pub(crate) async fn sync_missing_files_impl(
    pool: &database::DbPool,
    workspace_id: &str,
    vault_path: &str,
) -> Result<Vec<Node>, String> {
    let workspace_id = workspace_id.to_string();
    let vault_path = std::path::Path::new(vault_path);

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

    for path in crate::import_helpers::markdown_files_in_vault(std::path::Path::new(vault_path)) {
        let path = path.as_path();
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

        // Create edges for wikilinks. The hash records what was synced, so it
        // is written only once the sync has succeeded: a node whose sync failed
        // is left for the next pass (PRODUCT_DESIGN.md > Importing a vault)
        let links = import_helpers::extract_wikilinks(&content);
        match sync_wikilinks_for_node(pool, &node_id, &links).await {
            Ok(_) => {
                if let Some(hash) = node.checksum.as_deref() {
                    wikilinks::set_synced_hash(pool, &node_id, hash).await;
                }
            }
            Err(e) => eprintln!(
                "[SyncMissing] Failed to sync wikilinks for {}: {}",
                node.title, e
            ),
        }

        // Links elsewhere that dangled until this file's node existed
        if let Err(e) = wikilinks::resolve_pending_links_to(pool, &node).await {
            eprintln!("[SyncMissing] pending link resolution failed: {}", e);
        }

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
    link_nodes_to_files_impl(pool, &workspace_id, &vault_path).await
}

/// Link nodes that have no file, or whose file is gone, to a file of the same
/// name in the vault.
pub(crate) async fn link_nodes_to_files_impl(
    pool: &database::DbPool,
    workspace_id: &str,
    vault_path: &str,
) -> Result<i32, String> {
    let workspace_id = workspace_id.to_string();
    let vault_path_obj = std::path::Path::new(vault_path);

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

    for path in crate::import_helpers::markdown_files_in_vault(vault_path_obj) {
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
            // The content and its checksum come from one read, so the node
            // holds what the file holds and the next refresh does not take a
            // stale node for a settled one (PRODUCT_DESIGN.md > Importing a vault)
            let content = match std::fs::read_to_string(file_path) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[LinkNodes] Failed to read {}: {}", file_path, e);
                    continue;
                }
            };
            let checksum = crate::checksum::compute_string(&content);

            if let Err(e) =
                database::nodes::link_to_file(pool, &node.id, file_path, &content, &checksum).await
            {
                eprintln!(
                    "[LinkNodes] Failed to link {} to its file: {}",
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
) -> Result<ImportResult, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    import_vault_impl(pool, &path, workspace_id, delete_originals.unwrap_or(false)).await
}

/// A file the import could not take, and why.
#[derive(Debug, serde::Serialize)]
pub struct SkippedFile {
    pub path: String,
    pub reason: String,
}

/// What an import took, and what it left behind.
#[derive(Debug, serde::Serialize)]
pub struct ImportResult {
    pub nodes: Vec<Node>,
    pub skipped: Vec<SkippedFile>,
}

pub(crate) async fn import_vault_impl(
    pool: &database::DbPool,
    path: &str,
    workspace_id: Option<String>,
    should_delete: bool,
) -> Result<ImportResult, String> {
    let path = PathBuf::from(path);

    println!(
        "Importing vault from: {:?}, workspace_id: {:?}, delete_originals: {}",
        path, workspace_id, should_delete
    );

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let mut nodes = Vec::new();
    let mut title_to_id: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    let mut node_links: Vec<(String, Vec<String>)> = Vec::new();
    let mut skipped = 0;
    // A file the import cannot take is left behind and named, rather than
    // stopping the import (PRODUCT_DESIGN.md > Importing a vault)
    let mut skipped_files: Vec<SkippedFile> = Vec::new();

    // Track folders and their frames
    // Key: relative folder path, Value: (frame_id, frame_x, frame_y)
    let mut folder_frames: std::collections::HashMap<String, (String, f64, f64)> =
        std::collections::HashMap::new();

    // First pass: collect all files and create frames for folders
    let now = chrono::Utc::now().timestamp_millis();
    let (collected_files, folder_counts) = import_helpers::collect_markdown_files(&path);
    let files_to_import: Vec<(PathBuf, String)> = collected_files
        .into_iter()
        .map(|f| (f.path, f.folder))
        .collect();

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
        let content = match std::fs::read_to_string(&file_path) {
            Ok(content) => content,
            Err(e) => {
                eprintln!("Skipping {}: {}", file_path_str, e);
                skipped_files.push(SkippedFile {
                    path: file_path_str.clone(),
                    reason: e.to_string(),
                });
                continue;
            }
        };

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

        if let Err(e) = database::nodes::create(pool, &node).await {
            eprintln!("Skipping {}: {}", file_path_str, e);
            skipped_files.push(SkippedFile {
                path: file_path_str.clone(),
                reason: e.to_string(),
            });
            continue;
        }

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

    // Wikilinks are resolved by the sync's resolver, so a link the import
    // cannot resolve is remembered and becomes an edge when its note is
    // created later (PRODUCT_DESIGN.md > Syncing wikilink edges)
    let title_to_id = build_title_to_id_map(&nodes);
    let mut edge_count = 0;
    for (source_id, links) in node_links {
        match sync_wikilinks_for_node_with_map(pool, &source_id, &links, &title_to_id).await {
            Ok((created, _removed)) => edge_count += created,
            Err(e) => eprintln!("Failed to sync wikilinks for {}: {}", source_id, e),
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

    Ok(ImportResult {
        nodes,
        skipped: skipped_files,
    })
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
        } else {
            wikilinks::set_synced_hash(pool, &node.id, &new_checksum).await;
        }

        updated += 1;
    }

    println!("[RefreshWorkspace] Updated {} nodes", updated);
    Ok(updated)
}

#[cfg(test)]
mod tests {
    /// The import resolves wikilinks the way the sync does
    /// (PRODUCT_DESIGN.md > Syncing wikilink edges).
    ///
    /// Three ways the import's own pass differs: a link into a nested folder,
    /// a link that resolves to no note at all, and a pair already connected by
    /// another edge.
    #[tokio::test]
    async fn imports_a_link_into_a_nested_folder() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir_all(vault.path().join("area/concepts")).expect("folders");
        // The shared map keys a note by its own folder and filename, so this
        // link names it the way the sync would resolve it
        std::fs::write(vault.path().join("Alpha.md"), "sees [[concepts/beta]]").expect("write");
        std::fs::write(vault.path().join("area/concepts/beta.md"), "body").expect("write");

        super::import_vault_impl(
            &pool,
            vault.path().to_str().unwrap(),
            Some("w1".into()),
            false,
        )
        .await
        .expect("import");

        let edges: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM edges WHERE link_type = 'wikilink'")
                .fetch_one(&pool)
                .await
                .expect("count edges");
        assert_eq!(edges, 1, "the link becomes an edge");
    }

    /// A link naming no note is remembered, so the edge appears when that note
    /// is created later.
    #[tokio::test]
    async fn remembers_a_link_whose_note_does_not_exist_yet() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::write(vault.path().join("Alpha.md"), "sees [[Gamma]]").expect("write");

        super::import_vault_impl(
            &pool,
            vault.path().to_str().unwrap(),
            Some("w1".into()),
            false,
        )
        .await
        .expect("import");

        let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pending_wikilinks")
            .fetch_one(&pool)
            .await
            .expect("count pending");
        assert_eq!(pending, 1, "the unresolved link is remembered");
    }

    #[tokio::test]
    async fn imports_wikilinks_through_the_shared_resolver() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::create_dir_all(vault.path().join("concepts")).expect("folder");
        // The link names the note by folder and filename, while the note's
        // title differs from its filename
        std::fs::write(vault.path().join("Alpha.md"), "sees [[concepts/beta]]").expect("write");
        std::fs::write(vault.path().join("concepts/beta.md"), "# Beta Note\n\nbody")
            .expect("write");

        super::import_vault_impl(
            &pool,
            vault.path().to_str().unwrap(),
            Some("w1".into()),
            false,
        )
        .await
        .expect("import");

        let edges: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM edges WHERE link_type = 'wikilink'")
                .fetch_one(&pool)
                .await
                .expect("count edges");
        assert_eq!(edges, 1, "the link becomes an edge");

        let pending: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM pending_wikilinks")
            .fetch_one(&pool)
            .await
            .expect("count pending");
        assert_eq!(pending, 0, "nothing is left waiting for a note that exists");
    }
    /// A file the import cannot take does not stop it: the rest arrives, and
    /// the one left behind is named (PRODUCT_DESIGN.md > Importing a vault).
    #[tokio::test]
    async fn imports_the_rest_and_names_the_file_it_could_not_read() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::write(vault.path().join("Good.md"), "a readable note").expect("write note");
        // Not valid UTF-8, so reading it as text fails
        std::fs::write(vault.path().join("Broken.md"), [0xff, 0xfe, 0x00]).expect("write bytes");

        let result = super::import_vault_impl(
            &pool,
            vault.path().to_str().unwrap(),
            Some("w1".to_string()),
            false,
        )
        .await
        .expect("the import finishes");

        assert_eq!(
            result
                .nodes
                .iter()
                .map(|n| n.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Good"]
        );
        assert_eq!(result.skipped.len(), 1, "the unreadable file is reported");
        assert!(result.skipped[0].path.ends_with("Broken.md"));
        assert!(!result.skipped[0].reason.is_empty());
    }
    use crate::database::{self, DbPool};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        sqlx::query(
            "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('w1', 'W', 0, 0)",
        )
        .execute(&pool)
        .await
        .expect("insert workspace");
        pool
    }

    /// A vault holding one note that links to another.
    fn vault_with_a_linking_note() -> tempfile::TempDir {
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::write(vault.path().join("Alpha.md"), "sees [[Beta]]").expect("write note");
        vault
    }

    async fn synced_hash(pool: &DbPool, title: &str) -> Option<String> {
        sqlx::query_scalar::<_, Option<String>>(
            "SELECT wikilink_synced_hash FROM nodes WHERE title = ?",
        )
        .bind(title)
        .fetch_one(pool)
        .await
        .expect("node row")
    }

    async fn node_row(
        pool: &DbPool,
        title: &str,
    ) -> (Option<String>, Option<String>, Option<String>) {
        sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
            "SELECT file_path, checksum, markdown_content FROM nodes WHERE title = ?",
        )
        .bind(title)
        .fetch_one(pool)
        .await
        .expect("node row")
    }

    /// A node linked to its file holds what the file holds: the content and
    /// the checksum come from one read (PRODUCT_DESIGN.md > Importing a vault).
    #[tokio::test]
    async fn links_a_node_to_its_file_with_the_content_that_file_holds() {
        let pool = memory_pool().await;
        let vault = tempfile::tempdir().expect("temp dir");
        std::fs::write(vault.path().join("Alpha.md"), "what the file says").expect("write note");
        sqlx::query(
            "INSERT INTO nodes (id, title, markdown_content, workspace_id, created_at, updated_at) \
             VALUES ('n1', 'Alpha', 'what the node used to say', 'w1', 0, 0)",
        )
        .execute(&pool)
        .await
        .expect("insert node");

        let linked = super::link_nodes_to_files_impl(&pool, "w1", vault.path().to_str().unwrap())
            .await
            .expect("link");

        assert_eq!(linked, 1);
        let (file_path, checksum, content) = node_row(&pool, "Alpha").await;
        assert!(file_path.is_some_and(|p| p.ends_with("Alpha.md")));
        assert_eq!(
            checksum,
            Some(crate::checksum::compute_string("what the file says"))
        );
        assert_eq!(content, Some("what the file says".to_string()));
    }

    #[tokio::test]
    async fn records_the_synced_hash_once_the_sync_has_succeeded() {
        let pool = memory_pool().await;
        let vault = vault_with_a_linking_note();

        let created = super::sync_missing_files_impl(&pool, "w1", vault.path().to_str().unwrap())
            .await
            .expect("sync");

        assert_eq!(created.len(), 1);
        assert_eq!(
            synced_hash(&pool, "Alpha").await,
            Some(crate::checksum::compute_string("sees [[Beta]]"))
        );
    }

    /// A node whose wikilink sync failed is left for the next pass, not marked
    /// done (PRODUCT_DESIGN.md > Importing a vault).
    #[tokio::test]
    async fn records_no_synced_hash_when_the_sync_failed() {
        let pool = memory_pool().await;
        let vault = vault_with_a_linking_note();
        // The sync reads a node's edges first, so this makes it fail
        sqlx::query("DROP TABLE edges")
            .execute(&pool)
            .await
            .expect("drop edges");

        let created = super::sync_missing_files_impl(&pool, "w1", vault.path().to_str().unwrap())
            .await
            .expect("sync");

        assert_eq!(created.len(), 1, "the note still becomes a node");
        assert_eq!(synced_hash(&pool, "Alpha").await, None);
    }
}
