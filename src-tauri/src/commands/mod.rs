//! Tauri commands for frontend communication
//!
//! All commands are async and return Results for proper error handling.

mod edges;
mod file_locks;
mod frames;
mod http;
mod nodes;
mod ontology;
mod pdf;
mod storylines;
mod themes;
mod vault_watcher;
mod web_search;
mod workspaces;

use crate::database;
use crate::watcher::FileLock;
use std::sync::Mutex;

// Re-export all commands
pub use edges::*;
pub use file_locks::*;
pub use frames::*;
pub use http::*;
pub use nodes::*;
pub use ontology::*;
pub use pdf::*;
pub use storylines::*;
pub use themes::*;
pub use vault_watcher::*;
pub use web_search::*;
pub use workspaces::*;

/// Global watcher state
pub struct WatcherState(pub Mutex<Option<crate::watcher::VaultWatcher>>);

/// Global file locks state for tracking active edit locks
pub struct LocksState(pub Mutex<std::collections::HashMap<String, FileLock>>);

/// Check if a markdown file should be excluded from import/sync
/// Excludes: hidden files (starting with .), CLAUDE.md, README.md
pub(crate) fn should_exclude_file(path: &std::path::Path) -> bool {
    if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
        // Exclude hidden files
        if filename.starts_with('.') {
            return true;
        }
        // Exclude special files
        let excluded = ["CLAUDE.md", "README.md"];
        if excluded.iter().any(|&e| filename.eq_ignore_ascii_case(e)) {
            return true;
        }
    }
    false
}

/// Validate that a file path is within a workspace vault
/// Returns an error if the path is outside all workspace vaults (security check)
pub(crate) async fn validate_path_in_workspace(path: &std::path::Path) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let workspaces = database::workspaces::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Canonicalize the requested path
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;

    // Check if path is within any workspace vault
    for workspace in &workspaces {
        if let Some(vault_path) = &workspace.vault_path {
            if let Ok(canonical_vault) = std::path::Path::new(vault_path).canonicalize() {
                if canonical_path.starts_with(&canonical_vault) {
                    return Ok(());
                }
            }
        }
    }

    Err("Access denied: path is not within any workspace vault".to_string())
}

/// Default value helper for serde
pub(crate) fn default_true() -> bool {
    true
}
