//! Storyline commands for managing narrative paths through the graph

use crate::database::{
    self,
    nodes::Node,
    storylines::{Storyline, StorylineNode},
};
use serde::Deserialize;

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
pub async fn update_storyline(
    id: String,
    title: String,
    description: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
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
pub async fn add_node_to_storyline(
    storyline_id: String,
    node_id: String,
    position: Option<i32>,
) -> Result<StorylineNode, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::add_node(pool, &storyline_id, &node_id, position)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn remove_node_from_storyline(
    storyline_id: String,
    node_id: String,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::storylines::remove_node(pool, &storyline_id, &node_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reorder_storyline_nodes(
    storyline_id: String,
    node_ids: Vec<String>,
) -> Result<(), String> {
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
