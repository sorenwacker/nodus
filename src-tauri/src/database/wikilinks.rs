//! The bookkeeping behind wikilink syncing: which links are still waiting for
//! a note to exist, and the content each node's links were last synced at.

use super::{DatabaseError, DbPool};
use std::collections::HashMap;

/// Record the content hash a node's wikilinks were last synced at, so a full
/// pass can skip it while the content is unchanged.
pub async fn set_synced_hash(
    pool: &DbPool,
    node_id: &str,
    hash: &str,
) -> Result<(), DatabaseError> {
    sqlx::query("UPDATE nodes SET wikilink_synced_hash = ? WHERE id = ?")
        .bind(hash)
        .bind(node_id)
        .execute(pool)
        .await?;
    Ok(())
}

/// The last-synced hash of every node that has one.
pub async fn synced_hashes(pool: &DbPool) -> Result<HashMap<String, String>, DatabaseError> {
    let rows: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, wikilink_synced_hash FROM nodes WHERE wikilink_synced_hash IS NOT NULL",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .filter_map(|(id, hash)| hash.map(|h| (id, h)))
        .collect())
}

/// Replace the links a node is waiting on with the keys it cannot resolve now.
pub async fn replace_pending_links(
    pool: &DbPool,
    source_id: &str,
    target_keys: &[String],
) -> Result<(), DatabaseError> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM pending_wikilinks WHERE source_node_id = ?")
        .bind(source_id)
        .execute(&mut *tx)
        .await?;
    for key in target_keys {
        sqlx::query(
            "INSERT OR IGNORE INTO pending_wikilinks (source_node_id, target_key) VALUES (?, ?)",
        )
        .bind(source_id)
        .bind(key)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

/// The nodes whose links are waiting for a note reachable under `target_key`.
pub async fn sources_waiting_for(
    pool: &DbPool,
    target_key: &str,
) -> Result<Vec<String>, DatabaseError> {
    let rows: Vec<(String,)> = sqlx::query_as(
        "SELECT DISTINCT source_node_id FROM pending_wikilinks WHERE target_key = ?",
    )
    .bind(target_key)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|(id,)| id).collect())
}
