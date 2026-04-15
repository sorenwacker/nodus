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

    // Themes table
    sqlx::query(include_str!("../migrations/006_themes.sql"))
        .execute(pool)
        .await?;

    // Seed built-in themes
    themes::seed_builtin_themes(pool).await?;

    // Frames table
    sqlx::query(include_str!("../migrations/007_frames.sql"))
        .execute(pool)
        .await?;

    // Allow multiple edges with different link_types between same nodes
    let _ = sqlx::query(include_str!("../migrations/008_edge_multi_type.sql"))
        .execute(pool)
        .await;

    // Add sync_enabled to workspaces
    let _ = sqlx::query(include_str!("../migrations/009_workspace_sync.sql"))
        .execute(pool)
        .await;

    // Add directed column to edges - check first, then add if missing
    let has_directed: bool = sqlx::query_scalar::<_, i32>(
        "SELECT COUNT(*) FROM pragma_table_info('edges') WHERE name = 'directed'"
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
            "SELECT * FROM nodes WHERE deleted_at IS NULL ORDER BY z_index, created_at",
        )
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Node>, DatabaseError> {
        let node =
            sqlx::query_as::<_, Node>("SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL")
                .bind(id)
                .fetch_optional(pool)
                .await?;
        Ok(node)
    }

    pub async fn get_by_file_path(
        pool: &DbPool,
        file_path: &str,
    ) -> Result<Option<Node>, DatabaseError> {
        let node = sqlx::query_as::<_, Node>("SELECT * FROM nodes WHERE file_path = ?")
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
            "#,
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

    /// Batch soft delete multiple nodes in a single transaction
    pub async fn soft_delete_many(pool: &DbPool, ids: &[String]) -> Result<(), DatabaseError> {
        if ids.is_empty() {
            return Ok(());
        }
        let now = chrono::Utc::now().timestamp();
        // Build placeholders for IN clause
        let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
        let query = format!(
            "UPDATE nodes SET deleted_at = ? WHERE id IN ({})",
            placeholders.join(", ")
        );
        let mut q = sqlx::query(&query).bind(now);
        for id in ids {
            q = q.bind(id);
        }
        q.execute(pool).await?;
        Ok(())
    }

    /// Get multiple nodes by IDs (for batch operations)
    pub async fn get_many_by_ids(
        pool: &DbPool,
        ids: &[String],
    ) -> Result<Vec<Node>, DatabaseError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: Vec<&str> = ids.iter().map(|_| "?").collect();
        let query = format!(
            "SELECT * FROM nodes WHERE id IN ({}) AND deleted_at IS NULL",
            placeholders.join(", ")
        );
        let mut q = sqlx::query_as::<_, Node>(&query);
        for id in ids {
            q = q.bind(id);
        }
        let nodes = q.fetch_all(pool).await?;
        Ok(nodes)
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

    pub async fn update_file_path(
        pool: &DbPool,
        id: &str,
        file_path: &str,
        checksum: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET file_path = ?, checksum = ?, updated_at = ? WHERE id = ?")
            .bind(file_path)
            .bind(checksum)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_title(pool: &DbPool, id: &str, title: &str) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET title = ?, updated_at = ? WHERE id = ?")
            .bind(title)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_file_path_only(
        pool: &DbPool,
        id: &str,
        file_path: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET file_path = ?, checksum = NULL, updated_at = ? WHERE id = ?")
            .bind(file_path)
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
            "UPDATE nodes SET markdown_content = ?, checksum = ?, updated_at = ? WHERE id = ?",
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

    pub async fn update_workspace(
        pool: &DbPool,
        id: &str,
        workspace_id: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET workspace_id = ?, updated_at = ? WHERE id = ?")
            .bind(workspace_id)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_tags(
        pool: &DbPool,
        id: &str,
        tags: &[String],
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        let tags_json =
            serde_json::to_string(tags).map_err(|e| DatabaseError::Migration(e.to_string()))?;
        sqlx::query("UPDATE nodes SET tags = ?, updated_at = ? WHERE id = ?")
            .bind(&tags_json)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn update_frame_id(
        pool: &DbPool,
        id: &str,
        frame_id: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE nodes SET frame_id = ?, updated_at = ? WHERE id = ?")
            .bind(frame_id)
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
        pub directed: bool,
    }

    /// Get edges filtered by workspace (both source and target nodes must be in workspace)
    pub async fn get_by_workspace(
        pool: &DbPool,
        workspace_id: Option<&str>,
    ) -> Result<Vec<Edge>, DatabaseError> {
        let edges = match workspace_id {
            Some(ws_id) => {
                sqlx::query_as::<_, Edge>(
                    r#"
                    SELECT DISTINCT e.* FROM edges e
                    INNER JOIN nodes n1 ON e.source_node_id = n1.id
                    INNER JOIN nodes n2 ON e.target_node_id = n2.id
                    WHERE n1.workspace_id = ? AND n2.workspace_id = ?
                    "#,
                )
                .bind(ws_id)
                .bind(ws_id)
                .fetch_all(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Edge>(
                    r#"
                    SELECT DISTINCT e.* FROM edges e
                    INNER JOIN nodes n1 ON e.source_node_id = n1.id
                    INNER JOIN nodes n2 ON e.target_node_id = n2.id
                    WHERE n1.workspace_id IS NULL AND n2.workspace_id IS NULL
                    "#,
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(edges)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Edge>, DatabaseError> {
        let edge = sqlx::query_as::<_, Edge>("SELECT * FROM edges WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(edge)
    }

    pub async fn create(pool: &DbPool, edge: &Edge) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO edges (id, source_node_id, target_node_id, label, link_type, weight, color, storyline_id, created_at, directed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        .bind(edge.directed)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_directed(
        pool: &DbPool,
        id: &str,
        directed: bool,
    ) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE edges SET directed = ? WHERE id = ?")
            .bind(directed)
            .bind(id)
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

    pub async fn update_color(
        pool: &DbPool,
        id: &str,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE edges SET color = ? WHERE id = ?")
            .bind(color)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_storyline_and_color(
        pool: &DbPool,
        id: &str,
        storyline_id: Option<&str>,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
        sqlx::query("UPDATE edges SET storyline_id = ?, color = ? WHERE id = ?")
            .bind(storyline_id)
            .bind(color)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_edges_from_node(
        pool: &DbPool,
        node_id: &str,
    ) -> Result<Vec<Edge>, DatabaseError> {
        let edges = sqlx::query_as::<_, Edge>("SELECT * FROM edges WHERE source_node_id = ?")
            .bind(node_id)
            .fetch_all(pool)
            .await?;
        Ok(edges)
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
            "#,
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Merge bidirectional wikilink edges (A->B and B->A) into single undirected edges
    /// Returns count of edges removed
    pub async fn merge_bidirectional_wikilinks(pool: &DbPool) -> Result<u64, DatabaseError> {
        // Find pairs where both A->B and B->A exist as wikilinks
        // Keep the one with smaller id, set it to undirected, delete the other
        let result = sqlx::query(
            r#"
            UPDATE edges
            SET directed = 0
            WHERE link_type = 'wikilink'
            AND id IN (
                SELECT e1.id
                FROM edges e1
                INNER JOIN edges e2
                    ON e1.source_node_id = e2.target_node_id
                    AND e1.target_node_id = e2.source_node_id
                    AND e1.link_type = 'wikilink'
                    AND e2.link_type = 'wikilink'
                WHERE e1.id < e2.id
            )
            "#,
        )
        .execute(pool)
        .await?;

        let _updated = result.rows_affected();

        // Now delete the reverse edges (the ones with larger id)
        let delete_result = sqlx::query(
            r#"
            DELETE FROM edges
            WHERE link_type = 'wikilink'
            AND id IN (
                SELECT e2.id
                FROM edges e1
                INNER JOIN edges e2
                    ON e1.source_node_id = e2.target_node_id
                    AND e1.target_node_id = e2.source_node_id
                    AND e1.link_type = 'wikilink'
                    AND e2.link_type = 'wikilink'
                WHERE e1.id < e2.id
                AND e1.directed = 0
            )
            "#,
        )
        .execute(pool)
        .await?;

        Ok(delete_result.rows_affected())
    }

    /// Remove orphan edges (edges pointing to non-existent nodes)
    pub async fn cleanup_orphans(pool: &DbPool) -> Result<u64, DatabaseError> {
        let result = sqlx::query(
            r#"
            DELETE FROM edges
            WHERE source_node_id NOT IN (SELECT id FROM nodes)
               OR target_node_id NOT IN (SELECT id FROM nodes)
            "#,
        )
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    /// Get all edges (for debugging)
    pub async fn get_all(pool: &DbPool) -> Result<Vec<Edge>, DatabaseError> {
        let edges = sqlx::query_as::<_, Edge>("SELECT * FROM edges")
            .fetch_all(pool)
            .await?;
        Ok(edges)
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
        pub sync_enabled: bool,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Workspace>, DatabaseError> {
        let workspaces =
            sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces ORDER BY created_at")
                .fetch_all(pool)
                .await?;
        Ok(workspaces)
    }

    pub async fn create(pool: &DbPool, workspace: &Workspace) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO workspaces (id, name, color, vault_path, sync_enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&workspace.id)
        .bind(&workspace.name)
        .bind(&workspace.color)
        .bind(&workspace.vault_path)
        .bind(workspace.sync_enabled)
        .bind(workspace.created_at)
        .bind(workspace.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update_sync_enabled(
        pool: &DbPool,
        id: &str,
        sync_enabled: bool,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE workspaces SET sync_enabled = ?, updated_at = ? WHERE id = ?")
            .bind(sync_enabled)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_vault_path(
        pool: &DbPool,
        id: &str,
        vault_path: Option<&str>,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE workspaces SET vault_path = ?, updated_at = ? WHERE id = ?")
            .bind(vault_path)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Workspace>, DatabaseError> {
        let workspace = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(workspace)
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        // Delete edges connected to nodes in this workspace
        sqlx::query(
            "DELETE FROM edges WHERE source_node_id IN (SELECT id FROM nodes WHERE workspace_id = ?)
             OR target_node_id IN (SELECT id FROM nodes WHERE workspace_id = ?)"
        )
            .bind(id)
            .bind(id)
            .execute(pool)
            .await?;

        // Delete all nodes in this workspace (cuts link to Obsidian vault)
        sqlx::query("DELETE FROM nodes WHERE workspace_id = ?")
            .bind(id)
            .execute(pool)
            .await?;

        // Delete storylines in this workspace
        sqlx::query("DELETE FROM storylines WHERE workspace_id = ?")
            .bind(id)
            .execute(pool)
            .await?;

        // Delete frames in this workspace
        sqlx::query("DELETE FROM frames WHERE workspace_id = ?")
            .bind(id)
            .execute(pool)
            .await?;

        // Finally delete the workspace
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

    pub async fn get_by_workspace(
        pool: &DbPool,
        workspace_id: Option<&str>,
    ) -> Result<Vec<Storyline>, DatabaseError> {
        let storylines = match workspace_id {
            Some(id) => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id = ? ORDER BY created_at",
                )
                .bind(id)
                .fetch_all(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Storyline>(
                    "SELECT * FROM storylines WHERE workspace_id IS NULL ORDER BY created_at",
                )
                .fetch_all(pool)
                .await?
            }
        };
        Ok(storylines)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Storyline>, DatabaseError> {
        let storyline = sqlx::query_as::<_, Storyline>("SELECT * FROM storylines WHERE id = ?")
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

    pub async fn update(
        pool: &DbPool,
        id: &str,
        title: &str,
        description: Option<&str>,
        color: Option<&str>,
    ) -> Result<(), DatabaseError> {
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

    pub async fn add_node(
        pool: &DbPool,
        storyline_id: &str,
        node_id: &str,
        position: Option<i32>,
    ) -> Result<StorylineNode, DatabaseError> {
        // Get the current max sequence_order
        let max_order: Option<i32> = sqlx::query_scalar(
            "SELECT MAX(sequence_order) FROM storyline_nodes WHERE storyline_id = ?",
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
            "#,
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
                "SELECT * FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?",
            )
            .bind(storyline_id)
            .bind(node_id)
            .fetch_one(pool)
            .await?;
            return Ok(existing);
        }

        Ok(storyline_node)
    }

    pub async fn remove_node(
        pool: &DbPool,
        storyline_id: &str,
        node_id: &str,
    ) -> Result<(), DatabaseError> {
        // Get the sequence_order of the node being removed
        let order: Option<i32> = sqlx::query_scalar(
            "SELECT sequence_order FROM storyline_nodes WHERE storyline_id = ? AND node_id = ?",
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

    pub async fn reorder_nodes(
        pool: &DbPool,
        storyline_id: &str,
        node_ids: &[String],
    ) -> Result<(), DatabaseError> {
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
    pub async fn get_nodes_with_data(
        pool: &DbPool,
        storyline_id: &str,
    ) -> Result<Vec<super::nodes::Node>, DatabaseError> {
        let nodes = sqlx::query_as::<_, super::nodes::Node>(
            r#"
            SELECT n.* FROM nodes n
            INNER JOIN storyline_nodes sn ON n.id = sn.node_id
            WHERE sn.storyline_id = ? AND n.deleted_at IS NULL
            ORDER BY sn.sequence_order
            "#,
        )
        .bind(storyline_id)
        .fetch_all(pool)
        .await?;
        Ok(nodes)
    }
}

// Theme CRUD operations
pub mod themes {
    use super::*;
    use crate::themes as theme_module;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Theme {
        pub id: String,
        pub name: String,
        pub display_name: String,
        pub yaml_content: String,
        pub is_builtin: i32,
        pub workspace_id: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Theme>, DatabaseError> {
        let themes =
            sqlx::query_as::<_, Theme>("SELECT * FROM themes ORDER BY is_builtin DESC, name")
                .fetch_all(pool)
                .await?;
        Ok(themes)
    }

    pub async fn get_by_name(pool: &DbPool, name: &str) -> Result<Option<Theme>, DatabaseError> {
        let theme = sqlx::query_as::<_, Theme>("SELECT * FROM themes WHERE name = ?")
            .bind(name)
            .fetch_optional(pool)
            .await?;
        Ok(theme)
    }

    pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Theme>, DatabaseError> {
        let theme = sqlx::query_as::<_, Theme>("SELECT * FROM themes WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(theme)
    }

    pub async fn create(pool: &DbPool, theme: &Theme) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO themes (id, name, display_name, yaml_content, is_builtin, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&theme.id)
        .bind(&theme.name)
        .bind(&theme.display_name)
        .bind(&theme.yaml_content)
        .bind(theme.is_builtin)
        .bind(&theme.workspace_id)
        .bind(theme.created_at)
        .bind(theme.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn update(
        pool: &DbPool,
        id: &str,
        yaml_content: &str,
        display_name: &str,
    ) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "UPDATE themes SET yaml_content = ?, display_name = ?, updated_at = ? WHERE id = ? AND is_builtin = 0"
        )
        .bind(yaml_content)
        .bind(display_name)
        .bind(now)
        .bind(id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<bool, DatabaseError> {
        // Only allow deleting non-builtin themes
        let result = sqlx::query("DELETE FROM themes WHERE id = ? AND is_builtin = 0")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected() > 0)
    }

    /// Seed built-in themes from YAML files
    pub async fn seed_builtin_themes(pool: &DbPool) -> Result<(), DatabaseError> {
        let builtin_themes = theme_module::load_builtin_themes();
        let now = chrono::Utc::now().timestamp();

        for (name, theme_yaml) in builtin_themes {
            // Serialize to YAML for storage
            let yaml_content = serde_yaml::to_string(&theme_yaml)
                .map_err(|e| DatabaseError::Migration(e.to_string()))?;

            // Check if theme already exists
            let existing = get_by_name(pool, &name).await?;
            if let Some(existing_theme) = existing {
                // Update existing builtin theme with latest YAML
                if existing_theme.is_builtin == 1 {
                    sqlx::query(
                        "UPDATE themes SET yaml_content = ?, display_name = ?, updated_at = ? WHERE id = ?"
                    )
                    .bind(&yaml_content)
                    .bind(&theme_yaml.display_name)
                    .bind(now)
                    .bind(&existing_theme.id)
                    .execute(pool)
                    .await?;
                }
                continue;
            }

            let theme = Theme {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                display_name: theme_yaml.display_name,
                yaml_content,
                is_builtin: 1,
                workspace_id: None,
                created_at: now,
                updated_at: now,
            };

            create(pool, &theme).await?;
        }

        Ok(())
    }
}

// Frame CRUD operations
pub mod frames {
    use super::*;
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Frame {
        pub id: String,
        pub title: String,
        pub canvas_x: f64,
        pub canvas_y: f64,
        pub width: f64,
        pub height: f64,
        pub color: Option<String>,
        pub workspace_id: Option<String>,
        pub created_at: i64,
        pub updated_at: i64,
    }

    pub async fn get_all(pool: &DbPool) -> Result<Vec<Frame>, DatabaseError> {
        let frames = sqlx::query_as::<_, Frame>("SELECT * FROM frames ORDER BY created_at")
            .fetch_all(pool)
            .await?;
        Ok(frames)
    }

    pub async fn create(pool: &DbPool, frame: &Frame) -> Result<(), DatabaseError> {
        sqlx::query(
            r#"
            INSERT INTO frames (id, title, canvas_x, canvas_y, width, height, color, workspace_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#
        )
        .bind(&frame.id)
        .bind(&frame.title)
        .bind(frame.canvas_x)
        .bind(frame.canvas_y)
        .bind(frame.width)
        .bind(frame.height)
        .bind(&frame.color)
        .bind(&frame.workspace_id)
        .bind(frame.created_at)
        .bind(frame.updated_at)
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
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET canvas_x = ?, canvas_y = ?, updated_at = ? WHERE id = ?")
            .bind(x)
            .bind(y)
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
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET width = ?, height = ?, updated_at = ? WHERE id = ?")
            .bind(width)
            .bind(height)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn update_title(pool: &DbPool, id: &str, title: &str) -> Result<(), DatabaseError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET title = ?, updated_at = ? WHERE id = ?")
            .bind(title)
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
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query("UPDATE frames SET color = ?, updated_at = ? WHERE id = ?")
            .bind(color)
            .bind(now)
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &DbPool, id: &str) -> Result<(), DatabaseError> {
        sqlx::query("DELETE FROM frames WHERE id = ?")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_by_title_and_workspace(
        pool: &DbPool,
        title: &str,
        workspace_id: Option<&str>,
    ) -> Result<Option<Frame>, DatabaseError> {
        let frame = match workspace_id {
            Some(ws_id) => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE title = ? AND workspace_id = ?",
                )
                .bind(title)
                .bind(ws_id)
                .fetch_optional(pool)
                .await?
            }
            None => {
                sqlx::query_as::<_, Frame>(
                    "SELECT * FROM frames WHERE title = ? AND workspace_id IS NULL",
                )
                .bind(title)
                .fetch_optional(pool)
                .await?
            }
        };
        Ok(frame)
    }
}
