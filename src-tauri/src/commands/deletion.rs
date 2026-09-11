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
    delete_node_impl(pool, &id).await
}

/// Delete one node: move its file to the vault trash, then mark the row deleted.
pub(crate) async fn delete_node_impl(pool: &database::DbPool, id: &str) -> Result<(), String> {
    // A record that cannot be read has no file path to move, and deleting its
    // row would leave the file for the watcher to read back
    // (PRODUCT_DESIGN.md > Deleting nodes with files). A missing row has no
    // file either and is deleted, as the batch delete does.
    let node = database::nodes::get_by_id(pool, id)
        .await
        .map_err(|e| format!("Could not read node {id}: {e}"))?;
    if let Some(file_path) = node.as_ref().and_then(|n| n.file_path.as_deref()) {
        super::trash::move_to_trash(std::path::Path::new(file_path))?;
    }

    database::nodes::soft_delete(pool, id)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::DbPool;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    async fn deleted_at(pool: &DbPool, id: &str) -> Option<i64> {
        sqlx::query_scalar::<_, Option<i64>>("SELECT deleted_at FROM nodes WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("node row")
    }

    /// A record that cannot be read has no file path to move, and deleting its
    /// row would leave the file for the watcher to read back
    /// (PRODUCT_DESIGN.md > Deleting nodes with files).
    #[tokio::test]
    async fn keeps_a_node_whose_record_cannot_be_read() {
        let pool = memory_pool().await;
        // A position that cannot be read back as a number: the lookup fails
        // while the row is still there to be deleted
        sqlx::query(
            "INSERT INTO nodes (id, title, canvas_x, created_at, updated_at) \
             VALUES ('bad', 'Bad', 'not-a-number', 0, 0)",
        )
        .execute(&pool)
        .await
        .expect("insert node");
        assert!(
            database::nodes::get_by_id(&pool, "bad").await.is_err(),
            "precondition: the record cannot be read"
        );

        let result = delete_node_impl(&pool, "bad").await;

        assert!(result.is_err(), "a node that cannot be read is not deleted");
        assert_eq!(deleted_at(&pool, "bad").await, None);
    }

    #[tokio::test]
    async fn deletes_a_node_without_a_file() {
        let pool = memory_pool().await;
        sqlx::query(
            "INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('ok', 'Ok', 0, 0)",
        )
        .execute(&pool)
        .await
        .expect("insert node");

        delete_node_impl(&pool, "ok").await.expect("deleted");

        assert!(deleted_at(&pool, "ok").await.is_some());
    }
}
