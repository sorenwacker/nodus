//! Node CRUD operations

use super::{DatabaseError, DbPool};
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

/// Get all soft-deleted nodes for a workspace
pub async fn get_deleted(pool: &DbPool, workspace_id: &str) -> Result<Vec<Node>, DatabaseError> {
    let nodes = sqlx::query_as::<_, Node>(
        "SELECT * FROM nodes WHERE deleted_at IS NOT NULL AND workspace_id = ? ORDER BY deleted_at DESC",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;
    Ok(nodes)
}

/// Restore nodes whose files still exist on disk
pub async fn restore_if_file_exists(
    pool: &DbPool,
    workspace_id: &str,
) -> Result<usize, DatabaseError> {
    // Get all deleted nodes with file paths
    let deleted_nodes = sqlx::query_as::<_, Node>(
        "SELECT * FROM nodes WHERE deleted_at IS NOT NULL AND workspace_id = ? AND file_path IS NOT NULL",
    )
    .bind(workspace_id)
    .fetch_all(pool)
    .await?;

    let mut restored = 0;
    for node in deleted_nodes {
        if let Some(ref path) = node.file_path {
            if std::path::Path::new(path).exists() {
                sqlx::query("UPDATE nodes SET deleted_at = NULL WHERE id = ?")
                    .bind(&node.id)
                    .execute(pool)
                    .await?;
                restored += 1;
            }
        }
    }
    Ok(restored)
}

pub async fn get_by_id(pool: &DbPool, id: &str) -> Result<Option<Node>, DatabaseError> {
    let node = sqlx::query_as::<_, Node>("SELECT * FROM nodes WHERE id = ? AND deleted_at IS NULL")
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

pub async fn update_position(pool: &DbPool, id: &str, x: f64, y: f64) -> Result<(), DatabaseError> {
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
pub async fn get_many_by_ids(pool: &DbPool, ids: &[String]) -> Result<Vec<Node>, DatabaseError> {
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

pub async fn update_content(pool: &DbPool, id: &str, content: &str) -> Result<(), DatabaseError> {
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
    sqlx::query("UPDATE nodes SET markdown_content = ?, checksum = ?, updated_at = ? WHERE id = ?")
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

pub async fn update_tags(pool: &DbPool, id: &str, tags: &[String]) -> Result<(), DatabaseError> {
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
