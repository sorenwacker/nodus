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

/// Which node contents must lose a wikilink when this edge is deleted.
///
/// A merged wikilink edge is undirected because both files link to each other,
/// so it stands for two wikilinks. Cleaning only the source left the other
/// file's link in place and the next sync recreated the edge - the user
/// deleted it and it came back
/// (PRODUCT_DESIGN.md > Deleting a merged wikilink edge).
fn wikilink_cleanup_pairs<'a>(
    edge: &database::edges::Edge,
    source: &'a database::nodes::Node,
    target: &'a database::nodes::Node,
) -> Vec<(&'a database::nodes::Node, &'a str)> {
    let mut pairs = vec![(source, target.title.as_str())];
    if !edge.directed {
        pairs.push((target, source.title.as_str()));
    }
    pairs
}

#[tauri::command]
pub async fn delete_edge(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get the edge first to check if it's a wikilink
    let edge = database::edges::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(edge) = edge {
        // A wikilink edge exists because a file links to another. Deleting the
        // edge has to remove that link, or the next sync recreates it.
        if edge.link_type == "wikilink" {
            let source = database::nodes::get_by_id(pool, &edge.source_node_id)
                .await
                .map_err(|e| e.to_string())?;
            let target = database::nodes::get_by_id(pool, &edge.target_node_id)
                .await
                .map_err(|e| e.to_string())?;

            if let (Some(source), Some(target)) = (source, target) {
                for (node, other_title) in wikilink_cleanup_pairs(&edge, &source, &target) {
                    let Some(content) = &node.markdown_content else {
                        continue;
                    };
                    let new_content =
                        import_helpers::remove_wikilinks_to_target(content, other_title);
                    if new_content != *content {
                        update_node_content(node.id.clone(), new_content)
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
pub async fn update_edge_link_type(id: String, link_type: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::update_link_type(pool, &id, &link_type)
        .await
        .map_err(|e| {
            // The unique constraint covers (source, target, link_type)
            if e.to_string().contains("UNIQUE") {
                "An edge of that type already connects these nodes".to_string()
            } else {
                e.to_string()
            }
        })
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

#[cfg(test)]
mod tests {
    use super::*;

    fn node(id: &str, title: &str) -> database::nodes::Node {
        database::nodes::Node {
            id: id.to_string(),
            title: title.to_string(),
            file_path: None,
            markdown_content: Some(String::new()),
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
            workspace_id: None,
            checksum: None,
            created_at: 0,
            updated_at: 0,
            deleted_at: None,
        }
    }

    fn edge(directed: bool) -> database::edges::Edge {
        database::edges::Edge {
            id: "e1".to_string(),
            source_node_id: "a".to_string(),
            target_node_id: "b".to_string(),
            label: None,
            link_type: "wikilink".to_string(),
            weight: 1.0,
            color: None,
            storyline_id: None,
            created_at: 0,
            directed,
        }
    }

    #[test]
    fn a_merged_edge_is_cleaned_on_both_sides() {
        // Both files link to each other; leaving one link lets the next sync
        // recreate the edge
        let a = node("a", "Alpha");
        let b = node("b", "Beta");

        let pairs = wikilink_cleanup_pairs(&edge(false), &a, &b);

        assert_eq!(pairs.len(), 2);
        assert_eq!(pairs[0].0.id, "a");
        assert_eq!(pairs[0].1, "Beta");
        assert_eq!(pairs[1].0.id, "b");
        assert_eq!(pairs[1].1, "Alpha");
    }

    #[test]
    fn a_directed_edge_is_cleaned_at_its_source_only() {
        let a = node("a", "Alpha");
        let b = node("b", "Beta");

        let pairs = wikilink_cleanup_pairs(&edge(true), &a, &b);

        assert_eq!(pairs.len(), 1);
        assert_eq!(pairs[0].0.id, "a");
    }
}
