//! Frame commands for managing visual grouping containers

use crate::database::{self, frames::Frame};
use serde::Deserialize;

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
    pub parent_frame_id: Option<String>,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub width: f64,
    pub height: f64,
    pub color: Option<String>,
    pub workspace_id: Option<String>,
    pub folder_path: Option<String>,
}

#[tauri::command]
pub async fn create_frame(input: CreateFrameInput) -> Result<Frame, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().timestamp_millis();

    let frame = Frame {
        id: input.id,
        title: input.title,
        parent_frame_id: input.parent_frame_id,
        canvas_x: input.canvas_x,
        canvas_y: input.canvas_y,
        width: input.width,
        height: input.height,
        color: input.color,
        workspace_id: input.workspace_id,
        folder_path: input.folder_path,
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
pub async fn update_frame_parent(
    id: String,
    parent_frame_id: Option<String>,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::frames::update_parent(pool, &id, parent_frame_id.as_deref())
        .await
        .map_err(|e| e.to_string())
}

/// Assign a node to a frame (or remove from frame if frameId is None)
#[tauri::command]
pub async fn assign_node_to_frame(node_id: String, frame_id: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_frame_id(pool, &node_id, frame_id.as_deref())
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
