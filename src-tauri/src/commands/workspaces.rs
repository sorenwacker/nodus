//! Workspace commands for managing workspaces

use crate::database::{self, workspaces::Workspace};
use serde::{Deserialize, Serialize};

use super::validate_path_in_workspace;

// ============================================================================
// Workspace Commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
}

#[tauri::command]
pub async fn create_workspace(input: CreateWorkspaceInput) -> Result<Workspace, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let workspace = Workspace {
        id: input.id,
        name: input.name,
        color: input.color,
        // The vault is chosen in the workspace editor, which stores it there
        // (PRODUCT_DESIGN.md > Workspace settings)
        vault_path: None,
        sync_enabled: false,
        created_at: now,
        updated_at: now,
    };

    database::workspaces::create(pool, &workspace)
        .await
        .map_err(|e| e.to_string())?;

    Ok(workspace)
}

#[tauri::command]
pub async fn set_workspace_sync(id: String, sync_enabled: bool) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::update_sync_enabled(pool, &id, sync_enabled)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_workspace_vault_path(
    id: String,
    vault_path: Option<String>,
) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::update_vault_path(pool, &id, vault_path.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rename_workspace(id: String, new_name: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::rename(pool, &id, &new_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspace(id: String) -> Result<Option<Workspace>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_workspaces() -> Result<Vec<Workspace>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

/// Delete a workspace, and with `delete_files` permanently delete its nodes'
/// files, as the delete dialog warns.
///
/// Returns the files that could not be deleted. The workspace is deleted
/// regardless; the caller tells the user which files remain on disk
/// (PRODUCT_DESIGN.md > Workspace settings).
#[tauri::command]
pub async fn delete_workspace(
    id: String,
    delete_files: Option<bool>,
) -> Result<Vec<String>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let mut failed = Vec::new();
    if delete_files.unwrap_or(false) {
        let paths = database::nodes::file_paths_in_workspace(pool, &id)
            .await
            .map_err(|e| e.to_string())?;
        failed = remove_node_files(&paths);
    }

    database::workspaces::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(failed)
}

/// Remove each file, returning the paths that exist but could not be removed.
/// A path with no file behind it is not a failure: it is already gone.
fn remove_node_files(paths: &[String]) -> Vec<String> {
    paths
        .iter()
        .filter(|path| {
            let path = std::path::Path::new(path);
            path.exists() && std::fs::remove_file(path).is_err()
        })
        .cloned()
        .collect()
}

/// Read file content from disk (for on-demand sync)
/// Only allows reading files within workspace vaults (security)
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let path_ref = std::path::Path::new(&path);
    validate_path_in_workspace(path_ref).await?;
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// A file's content and the checksum of the very bytes that produced it.
#[derive(Debug, Serialize)]
pub struct FileRead {
    pub content: String,
    pub checksum: String,
}

/// Read a file and checksum the same bytes.
///
/// Reading the content and taking the checksum from a watcher event describes
/// two different moments: a write landing between them records a checksum for
/// content the node does not hold, and the node then looks reconciled while it
/// is not (PRODUCT_DESIGN.md > Reading a file and its checksum together).
///
/// The checksum is taken over the raw bytes, as the watcher takes it, so the
/// two are comparable for a file that is not valid UTF-8 as well.
#[tauri::command]
pub async fn read_file_with_checksum(path: String) -> Result<FileRead, String> {
    let path_ref = std::path::Path::new(&path);
    validate_path_in_workspace(path_ref).await?;
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read {}: {}", path, e))?;
    Ok(FileRead {
        checksum: crate::checksum::compute_bytes(&bytes),
        content: String::from_utf8_lossy(&bytes).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checksums_the_bytes_it_returns() {
        let dir = std::env::temp_dir().join(format!("nodus-read-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("note.md");
        std::fs::write(&file, "one\ntwo\n").unwrap();

        let bytes = std::fs::read(&file).unwrap();
        let read = FileRead {
            checksum: crate::checksum::compute_bytes(&bytes),
            content: String::from_utf8_lossy(&bytes).into_owned(),
        };

        // The same value the watcher reports for that file, so a node storing
        // this checksum is not seen as changed by the next event
        assert_eq!(read.checksum, crate::checksum::compute_file(&file).unwrap());
        assert_eq!(read.content, "one\ntwo\n");

        std::fs::remove_dir_all(&dir).ok();
    }

    /// A file that cannot be removed is reported, never only logged
    /// (PRODUCT_DESIGN.md > Workspace settings).
    #[cfg(unix)]
    #[test]
    fn reports_the_files_it_could_not_remove() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let removable = dir.path().join("gone.md");
        std::fs::write(&removable, "a").unwrap();
        let locked_dir = dir.path().join("locked");
        std::fs::create_dir(&locked_dir).unwrap();
        let stuck = locked_dir.join("stuck.md");
        std::fs::write(&stuck, "b").unwrap();
        std::fs::set_permissions(&locked_dir, std::fs::Permissions::from_mode(0o555)).unwrap();
        let missing = dir.path().join("never-existed.md");

        let paths: Vec<String> = [&removable, &stuck, &missing]
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect();
        let failed = remove_node_files(&paths);

        std::fs::set_permissions(&locked_dir, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(!removable.exists());
        assert_eq!(failed, vec![stuck.to_string_lossy().to_string()]);
    }
}
