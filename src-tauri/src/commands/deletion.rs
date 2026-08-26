//! Deleting nodes and putting them back
//!
//! A delete moves the node's file to the vault trash and marks the row deleted,
//! so nothing is destroyed and the action can be undone. A node is deleted only
//! once its file has moved: leaving the file in the vault lets the watcher read
//! it back, and the node returns
//! (PRODUCT_DESIGN.md > Deleting nodes with files).

use crate::database;
use crate::database::nodes::Node;

#[tauri::command]
pub async fn delete_node(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get the node first to check for file_path
    if let Ok(Some(node)) = database::nodes::get_by_id(pool, &id).await {
        if let Some(file_path) = &node.file_path {
            super::trash::move_to_trash(std::path::Path::new(file_path))?;
        }
    }

    database::nodes::soft_delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Batch delete multiple nodes efficiently
#[tauri::command]
pub async fn delete_nodes(ids: Vec<String>) -> Result<Vec<String>, String> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get all nodes with file_paths in one query
    let nodes = database::nodes::get_many_by_ids(pool, &ids)
        .await
        .map_err(|e| e.to_string())?;

    // A node is deleted only once its file is in the trash. Deleting the row
    // while the file stays in the vault leaves the watcher to read it back and
    // the node returns (PRODUCT_DESIGN.md > Deleting nodes with files)
    let (deletable, failures) = super::trash::partition_by_trash_move(&nodes);

    // Ids with no matching node row have no file to move
    let known: std::collections::HashSet<&str> = nodes.iter().map(|n| n.id.as_str()).collect();
    let mut to_delete = deletable;
    to_delete.extend(
        ids.iter()
            .filter(|id| !known.contains(id.as_str()))
            .cloned(),
    );

    if to_delete.is_empty() {
        return Err(format!(
            "No nodes deleted. Could not move to trash: {}",
            failures.join("; ")
        ));
    }

    // Batch soft delete the nodes whose files were moved
    database::nodes::soft_delete_many(pool, &to_delete)
        .await
        .map_err(|e| e.to_string())?;

    if failures.is_empty() {
        Ok(to_delete)
    } else {
        // Say what was and was not done, rather than reporting a clean success
        Err(format!(
            "Deleted {} of {} nodes. Could not move to trash: {}",
            to_delete.len(),
            ids.len(),
            failures.join("; ")
        ))
    }
}

#[tauri::command]
pub async fn restore_node(node: Node) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Restore file from trash if it exists
    if let Some(file_path) = &node.file_path {
        let path = std::path::Path::new(file_path);
        // The node arrives from the caller, so its file path is not yet the
        // user's choice, and the rename below would honour whatever it names
        // (PRODUCT_DESIGN.md > Validating caller-supplied paths)
        if let Some(parent) = path.parent() {
            super::validate_target_dir_in_workspace(parent).await?;
        }
        super::trash::restore_from_trash(path)?;
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
