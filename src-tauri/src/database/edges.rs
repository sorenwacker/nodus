//! Edge CRUD operations

use super::{DatabaseError, DbPool};
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
    create_many(pool, std::slice::from_ref(edge)).await
}

/// Insert a batch of edges in a single transaction; on any failure nothing is inserted
pub async fn create_many(pool: &DbPool, edges: &[Edge]) -> Result<(), DatabaseError> {
    let mut tx = pool.begin().await?;
    for edge in edges {
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
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn update_directed(pool: &DbPool, id: &str, directed: bool) -> Result<(), DatabaseError> {
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

pub async fn update_label(
    pool: &DbPool,
    id: &str,
    label: Option<&str>,
) -> Result<(), DatabaseError> {
    sqlx::query("UPDATE edges SET label = ? WHERE id = ?")
        .bind(label)
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

pub async fn get_edges_from_node(pool: &DbPool, node_id: &str) -> Result<Vec<Edge>, DatabaseError> {
    let edges = sqlx::query_as::<_, Edge>("SELECT * FROM edges WHERE source_node_id = ?")
        .bind(node_id)
        .fetch_all(pool)
        .await?;
    Ok(edges)
}

/// Remove duplicate edges, keeping the oldest edge for each
/// (source, target, link_type) group. Edges of different link_types between
/// the same node pair are legitimate (the schema allows them for ontology
/// imports) and are never removed.
pub async fn deduplicate(pool: &DbPool) -> Result<u64, DatabaseError> {
    let result = sqlx::query(
        r#"
        DELETE FROM edges
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (
                    PARTITION BY source_node_id, target_node_id, link_type
                    ORDER BY created_at, id
                ) AS row_num
                FROM edges
            )
            WHERE row_num = 1
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
