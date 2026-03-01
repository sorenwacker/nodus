//! Tauri commands for frontend communication
//!
//! All commands are async and return Results for proper error handling.

use crate::database::{self, edges::Edge, nodes::Node};
use crate::watcher::{FileLock, VaultWatcher};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::State;

/// Global watcher state
pub struct WatcherState(pub Mutex<Option<VaultWatcher>>);

/// Global file locks state
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
    pub node_type: String,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub tags: Option<Vec<String>>,
    pub workspace_id: Option<String>,
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
        node_type: input.node_type,
        canvas_x: input.canvas_x,
        canvas_y: input.canvas_y,
        width: input.width.unwrap_or(200.0),
        height: input.height.unwrap_or(120.0),
        z_index: 0,
        frame_id: None,
        color_theme: None,
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
    database::nodes::soft_delete(pool, &id)
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

// ============================================================================
// Vault Watcher Commands
// ============================================================================

#[tauri::command]
pub async fn watch_vault(
    path: String,
    watcher_state: State<'_, WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let mut watcher = VaultWatcher::new(path, |event| {
        println!("File change detected: {:?}", event);
        // TODO: Emit Tauri event to frontend
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

#[tauri::command]
pub async fn import_vault(path: String) -> Result<Vec<Node>, String> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();

    // Walk directory and import .md files
    for entry in walkdir::WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "md") {
            // Read file content
            let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;

            // Extract title from filename
            let title = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();

            // Compute checksum
            let checksum = crate::checksum::compute_string(&content);

            // Create node (position will be set by auto-layout)
            let now = chrono::Utc::now().timestamp();
            let node = Node {
                id: uuid::Uuid::new_v4().to_string(),
                title,
                file_path: Some(file_path.to_string_lossy().to_string()),
                markdown_content: Some(content),
                node_type: "note".to_string(),
                canvas_x: 0.0, // Will be set by d3-force
                canvas_y: 0.0,
                width: 200.0,
                height: 120.0,
                z_index: 0,
                frame_id: None,
                color_theme: None,
                is_collapsed: false,
                tags: None,
                workspace_id: None,
                checksum: Some(checksum),
                created_at: now,
                updated_at: now,
                deleted_at: None,
            };

            database::nodes::create(pool, &node)
                .await
                .map_err(|e| e.to_string())?;

            nodes.push(node);
        }
    }

    Ok(nodes)
}
