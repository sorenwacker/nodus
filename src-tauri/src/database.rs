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

    // Storylines migration
    sqlx::query(include_str!("../migrations/002_storylines.sql"))
        .execute(pool)
        .await?;

    // Add color column to storylines (ignore if already exists)
    let _ = sqlx::query(include_str!("../migrations/003_storyline_color.sql"))
        .execute(pool)
        .await;

    // Add color column to edges (ignore if already exists)
    let _ = sqlx::query(include_str!("../migrations/004_edge_color.sql"))
        .execute(pool)
        .await;

    // Add storyline_id column to edges (ignore if already exists)
    let _ = sqlx::query(include_str!("../migrations/005_edge_storyline.sql"))
        .execute(pool)
        .await;

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
        pub color: Option<String>,
        pub storyline_id: Option<String>,
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
            INSERT INTO edges (id, source_node_id, target_node_id, label, link_type, weight, color, storyline_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&edge.id)
        .bind(&edge.source_node_id)
        .bind(&edge.target_node_id)
        .bind(&edge.label)
        .bind(&edge.link_type)
        .bind(edge.weight)
        .bind(&edge.color)
        .bind(&edge.storyline_id)
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

    pub async fn update_color(pool: &DbPool, id: &str, color: Option<&str>) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE edges SET color = ? WHERE id = ?")
            .bind(color)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_storyline_and_color(pool: &DbPool, id: &str, storyline_id: Option<&str>, color: Option<&str>) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE edges SET storyline_id = ?, color = ? WHERE id = ?")
            .bind(storyline_id)
            .bind(color)
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

// Storyline CRUD operations
pub mod storylines {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Storyline {
        pub id: String,
        pub title: String,
        pub description: Option<String>,
        pub color: Option<String>,
        pub workspace_id: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct StorylineNode {
        pub id: String,
        pub storyline_id: String,
        pub node_id: String,
        pub sequence_order: i32,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Storyline>, DatabaseError> {
        let storylines = sqlx::query_as::<_, Storyline>(
            "SELECT * FROM storylines ORDER BY created_at"
        )
        .fetch_all(pool)
        .await?;
        Ok(storylines)
    }

    pub async fn get_by_workspace(pool: &DbPool, workspace_id: Option<&str>) -> Result<Vec<Storyline>, DatabaseError> {
        let storylines = match workspace_id {
            Some(id) => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id = ? ORDER BY created_at"
                )
                .bind(id)
                .fetch_all(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id IS NULL ORDER BY created_at"
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(storylines)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Storyline>, DatabaseError> {
        let storyline = sqlx::query_as::<_, Storyline>(
            "SELECT * FROM storylines WHERE id = ?"
        )
        .bind(id)
        .fetch_optional(pool)
        .await?;
        Ok(storyline)
    }

    pub async fn create(pool: &DbPool, storyline: &Storyline) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO storylines (id, title, description, color, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&storyline.id)
        .bind(&storyline.title)
        .bind(&storyline.description)
        .bind(&storyline.color)
        .bind(&storyline.workspace_id)
        .bind(storyline.created_at)
        .bind(storyline.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update(pool: &DbPool, id: &str, title: &str, description: Option<&str>, color: Option<&str>) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "UPDATE storylines SET title = ?, description = ?, color = ?, updated_at = ? WHERE id = ?"
        )
        .bind(title)
        .bind(description)
        .bind(color)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM storylines WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // Storyline nodes management

    pub async fn get_nodes(pool: &DbPool, storyline_id: &str) -> Result<Vec<StorylineNode>, DatabaseError> {
        let nodes = sqlx::query_as::<_, StorylineNode>(
            "SELECT * FROM storyline_nodes WHERE storyline_id = ? ORDER BY sequence_order"
        )
        .bind(storyline_id)
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }

    pub async fn add_node(pool: &DbPool, storyline_id: &str, node_id: &str, position: Option<i32>) -> Result<StorylineNode, DatabaseError> {
        // Get the current max sequence_order
        let max_order: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(sequence_order) FROM storyline_nodes WHERE storyline_id = ?"
        )
        .bind(storyline_id)
        .fetch_one(pool)
        .await?;

        let sequence_order = position.unwrap_or_else(|| max_order.unwrap_or(-1) + 1);

        // If inserting at a specific position, shift existing nodes
        if position.is_some() {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = sequence_order + 1 WHERE storyline_id = ? AND sequence_order >= ?"
            )
            .bind(storyline_id)
            .bind(sequence_order)
            .execute(pool)
            .await?;
        }

        let id = uuid::Uuid::new_v4().to_string();
        let storyline_node = StorylineNode {
            id: id.clone(),
            storyline_id: storyline_id.to_string(),
            node_id: node_id.to_string(),
            sequence_order,
        };

        // Use INSERT OR IGNORE to skip if node already exists in storyline
        let result = sqlx::query(
            r#"
            INSERT OR IGNORE INTO storyline_nodes (id, storyline_id, node_id, sequence_order)
            VALUES (?, ?, ?, ?)
            "#
        )
        .bind(&storyline_node.id)
        .bind(&storyline_node.storyline_id)
        .bind(&storyline_node.node_id)
        .bind(storyline_node.sequence_order)
        .execute(pool)
        .await?;

        // If no rows were inserted, the node already exists - fetch and return existing
        if result.rows_affected() == 0 {
            let existing = sqlx::query_as::<_, StorylineNode>(
                "SELECT * FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?"
            )
            .bind(storyline_id)
            .bind(node_id)
            .fetch_one(pool)
            .await?;
            return Ok(existing);
        }

        Ok(storyline_node)
    }

    pub async fn remove_node(pool: &DbPool, storyline_id: &str, node_id: &str) -> Result<(), DatabaseError> {
        // Get the sequence_order of the node being removed
        let order: Option<i32> = sqlx::query_scalar(
            "SELECT sequence_order FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?"
        )
        .bind(storyline_id)
        .bind(node_id)
        .fetch_optional(pool)
        .await?;

        // Delete the node
        sqlx::query("DELETE FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?")
            .bind(storyline_id)
            .bind(node_id)
            .execute(pool)
            .await?;

        // Shift remaining nodes to fill the gap
        if let Some(removed_order) = order {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = sequence_order - 1 WHERE storyline_id = ? AND sequence_order > ?"
            )
            .bind(storyline_id)
            .bind(removed_order)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    pub async fn reorder_nodes(pool: &DbPool, storyline_id: &str, node_ids: &[String]) -> Result<(), DatabaseError> {
        // Update sequence_order for each node based on its position in the array
        for (order, node_id) in node_ids.iter().enumerate() {
            sqlx::query(
                "UPDATE storyline_nodes SET sequence_order = ? WHERE storyline_id = ? AND node_id = ?"
            )
            .bind(order as i32)
            .bind(storyline_id)
            .bind(node_id)
            .execute(pool)
            .await?;
        }
        Ok(())
    }

    /// Get full node data for a storyline, ordered by sequence
    pub async fn get_nodes_with_data(pool: &DbPool, storyline_id: &str) -> Result<Vec<super::nodes::Node>, DatabaseError> {
        let nodes = sqlx::query_as::<_, super::nodes::Node>(
            r#"
            SELECT n.* FROM nodes n
            INNER JOIN storyline_nodes sn ON n.id = sn.node_id
            WHERE sn.storyline_id = ? AND n.deleted_at IS NULL
            ORDER BY sn.sequence_order
            "#
        )
        .bind(storyline_id)
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }
}
