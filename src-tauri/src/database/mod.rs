//! Database module for Nodus
//!
//! Uses LibSQL (SQLite fork) for local-first storage.
//! Stores metadata and canvas positions only - text content stays in .md files.

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use thiserror::Error;

pub mod edges;
pub mod models;
pub mod nodes;

// Re-export submodules for backward compatibility
pub use models::frames;
pub use models::storylines;
pub use models::themes;
pub use models::workspaces;

#[derive(Error, Debug)]
pub enum DatabaseError {
    #[error("SQLx error: {0}")]
    Sqlx(#[from] sqlx::Error),
    #[error("Migration error: {0}")]
    Migration(String),
    #[error("Path error: {0}")]
    Path(String),
}

pub type DbPool = Pool<Sqlite>;

static DB_POOL: OnceLock<DbPool> = OnceLock::new();

/// Initialize the database connection and run migrations
pub async fn initialize(app: &AppHandle) -> Result<(), DatabaseError> {
    let app_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| DatabaseError::Path(e.to_string()))?;

    std::fs::create_dir_all(&app_dir).map_err(|e| DatabaseError::Path(e.to_string()))?;

    let db_path = app_dir.join("nodus.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Run migrations
    run_migrations(&pool).await?;

    DB_POOL
        .set(pool)
        .map_err(|_| DatabaseError::Migration("Database already initialized".into()))?;

    Ok(())
}

/// Get database pool
pub fn get_pool() -> Result<&'static DbPool, DatabaseError> {
    DB_POOL
        .get()
        .ok_or_else(|| DatabaseError::Migration("Database not initialized".into()))
}

/// Run database migrations
async fn run_migrations(pool: &DbPool) -> Result<(), DatabaseError> {
    // Create tables
    sqlx::query(include_str!("../../migrations/001_init.sql"))
        .execute(pool)
        .await?;

    // Storylines migration
    sqlx::query(include_str!("../../migrations/002_storylines.sql"))
        .execute(pool)
        .await?;

    // Add color column to storylines (ignore if already exists)
    let _ = sqlx::query(include_str!("../../migrations/003_storyline_color.sql"))
        .execute(pool)
        .await;

    // Add color column to edges (ignore if already exists)
    let _ = sqlx::query(include_str!("../../migrations/004_edge_color.sql"))
        .execute(pool)
        .await;

    // Add storyline_id column to edges (ignore if already exists)
    let _ = sqlx::query(include_str!("../../migrations/005_edge_storyline.sql"))
        .execute(pool)
        .await;

    // Themes table
    sqlx::query(include_str!("../../migrations/006_themes.sql"))
        .execute(pool)
        .await?;

    // Seed built-in themes
    themes::seed_builtin_themes(pool).await?;

    // Frames table
    sqlx::query(include_str!("../../migrations/007_frames.sql"))
        .execute(pool)
        .await?;

    // Allow multiple edges with different link_types between same nodes
    let _ = sqlx::query(include_str!("../../migrations/008_edge_multi_type.sql"))
        .execute(pool)
        .await;

    // Add sync_enabled to workspaces
    let _ = sqlx::query(include_str!("../../migrations/009_workspace_sync.sql"))
        .execute(pool)
        .await;

    // Add directed column to edges - check first, then add if missing
    let has_directed: bool = sqlx::query_scalar::<_, i32>(
        "SELECT COUNT(*) FROM pragma_table_info('edges') WHERE name = 'directed'",
    )
    .fetch_one(pool)
    .await
    .map(|count| count > 0)
    .unwrap_or(false);

    if !has_directed {
        let _ = sqlx::query("ALTER TABLE edges ADD COLUMN directed INTEGER NOT NULL DEFAULT 1")
            .execute(pool)
            .await;
    }

    // Add folder_path column to frames for folder-frame sync
    let _ = sqlx::query(include_str!("../../migrations/010_frame_folder_path.sql"))
        .execute(pool)
        .await;

    // Add parent_frame_id column for nested frames support
    let _ = sqlx::query(include_str!("../../migrations/011_frame_parent.sql"))
        .execute(pool)
        .await;

    Ok(())
}
