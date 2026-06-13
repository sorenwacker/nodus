//! Workspace commands for managing workspaces

use crate::database::{self, workspaces::Workspace};
use serde::Deserialize;

use super::validate_path_in_workspace;

// ============================================================================
// Workspace Commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub vault_path: Option<String>,
}

#[tauri::command]
pub async fn create_workspace(input: CreateWorkspaceInput) -> Result<Workspace, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let workspace = Workspace {
        id: input.id,
        name: input.name,
        color: input.color,
        vault_path: input.vault_path,
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

#[tauri::command]
pub async fn delete_workspace(id: String, delete_files: Option<bool>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // If delete_files is true, delete all files associated with nodes in this workspace
    if delete_files.unwrap_or(false) {
        let nodes = database::nodes::get_all(pool)
            .await
            .map_err(|e| e.to_string())?;
        let mut deleted_count = 0;

        for node in nodes {
            if node.workspace_id.as_deref() == Some(&id) {
                if let Some(file_path) = &node.file_path {
                    let path = std::path::Path::new(file_path);
                    if path.exists() {
                        match std::fs::remove_file(path) {
                            Ok(_) => {
                                deleted_count += 1;
                                println!("Deleted file: {:?}", path);
                            }
                            Err(e) => {
                                eprintln!("Failed to delete {:?}: {}", path, e);
                            }
                        }
                    }
                }
            }
        }

        if deleted_count > 0 {
            println!("Deleted {} files from workspace {}", deleted_count, id);
        }
    }

    database::workspaces::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Read file content from disk (for on-demand sync)
/// Only allows reading files within workspace vaults (security)
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    let path_ref = std::path::Path::new(&path);
    validate_path_in_workspace(path_ref).await?;
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}
