//! Theme commands for managing custom themes

use crate::database::{self, themes::Theme};
use crate::themes as theme_module;
use serde::Deserialize;

// ============================================================================
// Theme Commands
// ============================================================================

#[tauri::command]
pub async fn get_themes() -> Result<Vec<Theme>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_theme(name: String) -> Result<Option<Theme>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::get_by_name(pool, &name)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateThemeInput {
    pub name: String,
    pub display_name: String,
    pub yaml_content: String,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_theme(input: CreateThemeInput) -> Result<Theme, String> {
    // Validate YAML before saving
    theme_module::parse_yaml(&input.yaml_content)
        .map_err(|e| format!("Invalid theme YAML: {}", e))?;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Check if name already exists
    if database::themes::get_by_name(pool, &input.name)
        .await
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(format!("Theme with name '{}' already exists", input.name));
    }

    let now = chrono::Utc::now().timestamp();
    let theme = Theme {
        id: uuid::Uuid::new_v4().to_string(),
        name: input.name,
        display_name: input.display_name,
        yaml_content: input.yaml_content,
        is_builtin: 0,
        workspace_id: input.workspace_id,
        created_at: now,
        updated_at: now,
    };

    database::themes::create(pool, &theme)
        .await
        .map_err(|e| e.to_string())?;

    Ok(theme)
}

#[derive(Debug, Deserialize)]
pub struct UpdateThemeInput {
    pub id: String,
    pub yaml_content: String,
    pub display_name: String,
}

#[tauri::command]
pub async fn update_theme(input: UpdateThemeInput) -> Result<(), String> {
    // Validate YAML before saving
    theme_module::parse_yaml(&input.yaml_content)
        .map_err(|e| format!("Invalid theme YAML: {}", e))?;

    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Check if theme exists and is not builtin
    let existing = database::themes::get_by_id(pool, &input.id)
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Theme not found".to_string())?;

    if existing.is_builtin == 1 {
        return Err("Cannot modify built-in themes".to_string());
    }

    database::themes::update(pool, &input.id, &input.yaml_content, &input.display_name)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_theme(id: String) -> Result<bool, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::themes::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn validate_theme_yaml(yaml_content: String) -> Result<bool, String> {
    match theme_module::parse_yaml(&yaml_content) {
        Ok(_) => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}
