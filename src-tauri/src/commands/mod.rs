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

/// Fetch the canonicalized vault paths of all workspaces
async fn workspace_vaults() -> Result<Vec<std::path::PathBuf>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let workspaces = database::workspaces::get_all(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(workspaces
        .iter()
        .filter_map(|w| w.vault_path.as_deref())
        .filter_map(|p| std::path::Path::new(p).canonicalize().ok())
        .collect())
}

/// Check that an existing path is inside one of the given vaults after
/// canonicalization (resolves symlinks and `..`)
pub(crate) fn path_is_within_vaults(
    path: &std::path::Path,
    vaults: &[std::path::PathBuf],
) -> Result<(), String> {
    let canonical_path = path
        .canonicalize()
        .map_err(|e| format!("Invalid path: {}", e))?;
    if vaults.iter().any(|v| canonical_path.starts_with(v)) {
        Ok(())
    } else {
        Err("Access denied: path is not within any workspace vault".to_string())
    }
}

/// Check that a directory that may not exist yet will be inside one of the
/// given vaults. Rejects relative paths and `..` components, then validates
/// the nearest existing ancestor.
pub(crate) fn future_dir_is_within_vaults(
    path: &std::path::Path,
    vaults: &[std::path::PathBuf],
) -> Result<(), String> {
    use std::path::Component;
    if !path.is_absolute() {
        return Err("Access denied: target folder must be an absolute path".to_string());
    }
    if path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("Access denied: target folder must not contain '..'".to_string());
    }
    let mut existing = path;
    while !existing.exists() {
        existing = existing
            .parent()
            .ok_or_else(|| "Invalid target folder".to_string())?;
    }
    path_is_within_vaults(existing, vaults)
}

/// Validate that a file path is within a workspace vault
/// Returns an error if the path is outside all workspace vaults (security check)
pub(crate) async fn validate_path_in_workspace(path: &std::path::Path) -> Result<(), String> {
    path_is_within_vaults(path, &workspace_vaults().await?)
}

/// Validate that a target directory (which may not exist yet) is within a
/// workspace vault. Must be called before any filesystem operation that
/// creates, moves, or deletes files at a caller-supplied location.
pub(crate) async fn validate_target_dir_in_workspace(path: &std::path::Path) -> Result<(), String> {
    future_dir_is_within_vaults(path, &workspace_vaults().await?)
}

/// Default value helper for serde
pub(crate) fn default_true() -> bool {
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_inside_vault_is_allowed() {
        let vault = tempfile::tempdir().unwrap();
        let inside = vault.path().join("note.md");
        std::fs::write(&inside, "x").unwrap();
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(path_is_within_vaults(&inside, &vaults).is_ok());
    }

    #[test]
    fn path_outside_vault_is_denied() {
        let vault = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let outside = other.path().join("note.md");
        std::fs::write(&outside, "x").unwrap();
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(path_is_within_vaults(&outside, &vaults).is_err());
    }

    #[test]
    fn traversal_out_of_vault_is_denied() {
        let vault = tempfile::tempdir().unwrap();
        let escape = vault.path().join("sub").join("..").join("..");
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(future_dir_is_within_vaults(&escape, &vaults).is_err());
    }

    #[test]
    fn nonexistent_target_inside_vault_is_allowed() {
        let vault = tempfile::tempdir().unwrap();
        let target = vault.path().join("new").join("deep").join("folder");
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(future_dir_is_within_vaults(&target, &vaults).is_ok());
    }

    #[test]
    fn nonexistent_target_outside_vault_is_denied() {
        let vault = tempfile::tempdir().unwrap();
        let other = tempfile::tempdir().unwrap();
        let target = other.path().join("new-folder");
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(future_dir_is_within_vaults(&target, &vaults).is_err());
    }

    #[test]
    fn relative_target_is_denied() {
        let vault = tempfile::tempdir().unwrap();
        let vaults = vec![vault.path().canonicalize().unwrap()];
        assert!(
            future_dir_is_within_vaults(std::path::Path::new("relative/dir"), &vaults).is_err()
        );
    }
}
