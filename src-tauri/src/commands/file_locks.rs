//! File lock commands for managing edit locks

use crate::database;
use crate::watcher::FileLock;
use tauri::State;

use super::LocksState;

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

    // Probing a lock reveals whether a path exists and whether another process
    // holds it, so the path must be one the user chose
    // (PRODUCT_DESIGN.md > Validating caller-supplied paths)
    super::validate_path_in_workspace(path).await?;

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
    acquire_edit_lock_impl(pool, &locks_state.0, &node_id).await
}

pub(crate) async fn acquire_edit_lock_impl(
    pool: &database::DbPool,
    locks: &std::sync::Mutex<std::collections::HashMap<String, FileLock>>,
    node_id: &str,
) -> Result<(), String> {
    let node_id = node_id.to_string();

    // A lock this session already holds is not another application holding it:
    // taking it again would refuse the user their own editor
    // (PRODUCT_DESIGN.md > File Locking Workflow)
    if locks.lock().unwrap().contains_key(&node_id) {
        return Ok(());
    }

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
    let mut held = locks.lock().unwrap();
    held.insert(node_id, lock);

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
pub async fn get_locked_nodes(locks_state: State<'_, LocksState>) -> Result<Vec<String>, String> {
    let locks = locks_state.0.lock().unwrap();
    Ok(locks.keys().cloned().collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::DbPool;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::collections::HashMap;
    use std::sync::Mutex;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    /// Nodus is not another application: a second request for a lock this
    /// session already holds succeeds (PRODUCT_DESIGN.md > File Locking Workflow).
    #[tokio::test]
    async fn takes_a_lock_it_already_holds_without_complaint() {
        let pool = memory_pool().await;
        let dir = tempfile::tempdir().expect("temp dir");
        let file = dir.path().join("Alpha.md");
        std::fs::write(&file, "a note").expect("write note");
        sqlx::query("INSERT INTO nodes (id, title, file_path, created_at, updated_at) VALUES ('n1', 'Alpha', ?, 0, 0)")
            .bind(file.to_string_lossy().to_string())
            .execute(&pool)
            .await
            .expect("insert node");
        let locks: Mutex<HashMap<String, FileLock>> = Mutex::new(HashMap::new());

        acquire_edit_lock_impl(&pool, &locks, "n1")
            .await
            .expect("first lock");
        let second = acquire_edit_lock_impl(&pool, &locks, "n1").await;

        assert!(
            second.is_ok(),
            "the user's own editor is refused: {:?}",
            second
        );
        assert_eq!(locks.lock().unwrap().len(), 1);
    }
}
