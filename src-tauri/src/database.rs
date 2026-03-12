//! Database module for Nodus
//!
//! Uses LibSQL (SQLite fork) for local-first storage.
//! Stores metadata and canvas positions only - text content stays in .md files.

use sqlx::{sqlite::SqlitePoolOptions, Pool, Sqlite};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};
use thiserror::Error;

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

    std::fs::create_dir_all(&app_dir)
        .map_err(|e| DatabaseError::Path(e.to_string()))?;

    let db_path = app_dir.join("nodus.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    // Run migrations
    run_migrations(&pool).await?;

    DB_POOL.set(pool).map_err(|_| {
        DatabaseError::Migration("Database already initialized".into())
    })?;

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
    sqlx::query(include_str!("../migrations/001_init.sql"))
        .execute(pool)
        .await?;

    Ok(())
}

// Node CRUD operations
pub mod nodes {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Node {
        pub id: String,
        pub title: String,
        pub file_path: Option<String>,
        pub markdown_content: Option<String>,
        pub node_type: String,
        pub canvas_x: f64,
        pub canvas_y: f64,
        pub width: f64,
        pub height: f64,
        pub z_index: i32,
        pub frame_id: Option<String>,
        pub color_theme: Option<String>,
        pub is_collapsed: bool,
        pub tags: Option<String>,
        pub workspace_id: Option<String>,
        pub checksum: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
        pub deleted_at: Option<i64>,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Node>, DatabaseError> {
        let nodes = sqlx::query_as::<_, Node>(
            "SELECT * FROM nodes WHERE deleted_at IS NULL ORDER BY z_index, created_at"
        )
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Node>, DatabaseError> {
        let node = sqlx::query_as::<_, Node>(
            "SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(node)
    }

    pub async fn get_by_file_path(pool: &DbPool, file_path: &str) -> Result<Option<Node>, DatabaseError> {
        let node = sqlx::query_as::<_, Node>(
            "SELECT * FROM nodes WHERE file_path = ?"
        )
        .bind(file_path)
        .fetch_optional(pool)
        .await?;
        Ok(node)
    }

    /// Hard delete a node (completely remove from database)
    pub async fn hard_delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM nodes WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn create(pool: &DbPool, node: &Node) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO nodes (id, title, file_path, markdown_content, node_type,
                canvas_x, canvas_y, width, height, z_index, frame_id,
                color_theme, is_collapsed, tags, workspace_id, checksum,
                created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&node.id)
        .bind(&node.title)
        .bind(&node.file_path)
        .bind(&node.markdown_content)
        .bind(&node.node_type)
        .bind(node.canvas_x)
        .bind(node.canvas_y)
        .bind(node.width)
        .bind(node.height)
        .bind(node.z_index)
        .bind(&node.frame_id)
        .bind(&node.color_theme)
        .bind(node.is_collapsed)
        .bind(&node.tags)
        .bind(&node.workspace_id)
        .bind(&node.checksum)
        .bind(node.created_at)
        .bind(node.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_position(
        pool: &DbPool,
        id: &str,
        x: f64,
        y: f64,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET canvas_x = ?, canvas_y = ?, updated_at = ? WHERE id = ?")
            .bind(x)
            .bind(y)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn soft_delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET deleted_at = ? WHERE id = ?")
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn restore(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE nodes SET deleted_at = NULL WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_content(
        pool: &DbPool,
        id: &str,
        content: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET markdown_content = ?, updated_at = ? WHERE id = ?")
            .bind(content)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_title(
        pool: &DbPool,
        id: &str,
        title: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?")
            .bind(title)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_size(
        pool: &DbPool,
        id: &str,
        width: f64,
        height: f64,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET width = ?, height = ?, updated_at = ? WHERE id = ?")
            .bind(width)
            .bind(height)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_content_and_checksum(
        pool: &DbPool,
        id: &str,
        content: &str,
        checksum: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "UPDATE nodes SET markdown_content = ?, checksum = ?, updated_at = ? WHERE id = ?"
        )
        .bind(content)
        .bind(checksum)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_color(
        pool: &DbPool,
        id: &str,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET color_theme = ?, updated_at = ? WHERE id = ?")
            .bind(color)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}

// Edge CRUD operations
pub mod edges {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Edge {
        pub id: String,
        pub source_node_id: String,
        pub target_node_id: String,
        pub label: Option<String>,
        pub link_type: String,
        pub weight: f64,
        pub created_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Edge>, DatabaseError> {
        let edges = sqlx::query_as::<_, Edge>("SELECT * FROM edges")
            .fetch_all(pool)
            .await?;
        Ok(edges)
    }

    pub async fn create(pool: &DbPool, edge: &Edge) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO edges (id, source_node_id, target_node_id, label, link_type, weight, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&edge.id)
        .bind(&edge.source_node_id)
        .bind(&edge.target_node_id)
        .bind(&edge.label)
        .bind(&edge.link_type)
        .bind(edge.weight)
        .bind(edge.created_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM edges WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    /// Remove duplicate edges, keeping only the first one for each source-target pair
    pub async fn deduplicate(pool: &DbPool) -> Result<u64, DatabaseError> {
        let result = sqlx::query(
            r#"
            DELETE FROM edges
            WHERE id NOT IN (
                SELECT MIN(id)
                FROM edges
                GROUP BY source_node_id, target_node_id
            )
            "#
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }
}

// Workspace CRUD operations
pub mod workspaces {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Workspace {
        pub id: String,
        pub name: String,
        pub color: Option<String>,
        pub vault_path: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Workspace>, DatabaseError> {
        let workspaces = sqlx::query_as::<_, Workspace>(
            "SELECT * FROM workspaces ORDER BY created_at"
        )
        .fetch_all(pool)
        .await?;
        Ok(workspaces)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Workspace>, DatabaseError> {
        let workspace = sqlx::query_as::<_, Workspace>(
            "SELECT * FROM workspaces WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(workspace)
    }

    pub async fn create(pool: &DbPool, workspace: &Workspace) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO workspaces (id, name, color, vault_path, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.color)
        .bind(&workspace.vault_path)
        .bind(workspace.created_at)
        .bind(workspace.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM workspaces WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
