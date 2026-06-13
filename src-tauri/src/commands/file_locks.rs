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
    let mut locks = locks_state.0.lock().unwrap();
    locks.insert(node_id, lock);

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
