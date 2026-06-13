//! Edge commands for managing graph connections

use crate::database::{self, edges::Edge};
use crate::import_helpers;
use serde::Deserialize;

use super::update_node_content;

// ============================================================================
// Edge Commands
// ============================================================================

#[tauri::command]
pub async fn get_edges(workspace_id: Option<String>) -> Result<Vec<Edge>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    match workspace_id {
        Some(ref ws_id) => database::edges::get_by_workspace(pool, Some(ws_id))
            .await
            .map_err(|e| e.to_string()),
        None => database::edges::get_by_workspace(pool, None)
            .await
            .map_err(|e| e.to_string()),
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeInput {
    pub source_node_id: String,
    pub target_node_id: String,
    pub label: Option<String>,
    pub link_type: Option<String>,
    pub color: Option<String>,
    pub storyline_id: Option<String>,
    pub directed: Option<bool>,
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
        directed: input.directed.unwrap_or(true),
    };

    database::edges::create(pool, &edge)
        .await
        .map_err(|e| e.to_string())?;

    Ok(edge)
}

#[tauri::command]
pub async fn update_edge_directed(id: String, directed: bool) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_directed(pool, &id, directed)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_edge(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get the edge first to check if it's a wikilink
    let edge = database::edges::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(edge) = edge {
        // If this is a wikilink edge, transform the wikilinks in source node to plain text
        if edge.link_type == "wikilink" {
            // Get source and target nodes
            let source = database::nodes::get_by_id(pool, &edge.source_node_id)
                .await
                .map_err(|e| e.to_string())?;
            let target = database::nodes::get_by_id(pool, &edge.target_node_id)
                .await
                .map_err(|e| e.to_string())?;

            if let (Some(source), Some(target)) = (source, target) {
                if let Some(content) = &source.markdown_content {
                    // Transform wikilinks to target into plain text
                    let new_content =
                        import_helpers::remove_wikilinks_to_target(content, &target.title);

                    if new_content != *content {
                        // Update content in database and file
                        update_node_content(source.id.clone(), new_content)
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    }

    // Delete the edge
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
pub async fn update_edge_label(id: String, label: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_label(pool, &id, label.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_edge_storyline(
    id: String,
    storyline_id: Option<String>,
    color: Option<String>,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_storyline_and_color(
        pool,
        &id,
        storyline_id.as_deref(),
        color.as_deref(),
    )
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

/// Merge bidirectional wikilink edges into single undirected edges
#[tauri::command]
pub async fn merge_bidirectional_edges() -> Result<u64, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let removed = database::edges::merge_bidirectional_wikilinks(pool)
        .await
        .map_err(|e| e.to_string())?;
    println!("Merged {} bidirectional edges", removed);
    Ok(removed)
}

/// Clean up orphan edges (edges pointing to non-existent nodes)
#[tauri::command]
pub async fn cleanup_orphan_edges() -> Result<u64, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let removed = database::edges::cleanup_orphans(pool)
        .await
        .map_err(|e| e.to_string())?;
    println!("Removed {} orphan edges", removed);
    Ok(removed)
}

/// Get all edges (for debugging)
#[tauri::command]
pub async fn debug_get_all_edges() -> Result<Vec<database::edges::Edge>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}
