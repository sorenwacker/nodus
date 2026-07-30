//! Trusted MCP clients: token hashes issued on user approval, so a known
//! client reconnects without re-prompting. Only the SHA-256 hash of a token
//! is stored; the token itself lives with the client.

use super::{DatabaseError, DbPool};

/// Store a newly issued token hash for an approved client
pub async fn trust(pool: &DbPool, token_hash: &str, label: &str) -> Result<(), DatabaseError> {
    let now = chrono::Utc::now().timestamp();
    sqlx::query(
        "INSERT OR REPLACE INTO mcp_trusted_clients (token_hash, label, created_at, last_used_at)
         VALUES (?, ?, ?, ?)",
    )
    .bind(token_hash)
    .bind(label)
    .bind(now)
    .bind(now)
    .execute(pool)
    .await?;
    Ok(())
}

/// Check a presented token hash; a match refreshes last_used_at
pub async fn verify(pool: &DbPool, token_hash: &str) -> Result<bool, DatabaseError> {
    let now = chrono::Utc::now().timestamp();
    let result =
        sqlx::query("UPDATE mcp_trusted_clients SET last_used_at = ? WHERE token_hash = ?")
            .bind(now)
            .bind(token_hash)
            .execute(pool)
            .await?;
    Ok(result.rows_affected() > 0)
}

/// Revoke all trusted clients; returns how many were forgotten
pub async fn clear(pool: &DbPool) -> Result<u64, DatabaseError> {
    let result = sqlx::query("DELETE FROM mcp_trusted_clients")
        .execute(pool)
        .await?;
    Ok(result.rows_affected())
}

/// Number of trusted clients
pub async fn count(pool: &DbPool) -> Result<i64, DatabaseError> {
    let row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM mcp_trusted_clients")
        .fetch_one(pool)
        .await?;
    Ok(row.0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        crate::database::run_migrations(&pool)
            .await
            .expect("migrations");
        pool
    }

    #[tokio::test]
    async fn trusted_hash_verifies_and_unknown_does_not() {
        let pool = memory_pool().await;
        trust(&pool, "hash-a", "claude").await.unwrap();

        assert!(verify(&pool, "hash-a").await.unwrap());
        assert!(!verify(&pool, "hash-b").await.unwrap());
        assert_eq!(count(&pool).await.unwrap(), 1);
    }

    #[tokio::test]
    async fn clear_revokes_all_trust() {
        let pool = memory_pool().await;
        trust(&pool, "hash-a", "one").await.unwrap();
        trust(&pool, "hash-b", "two").await.unwrap();

        assert_eq!(clear(&pool).await.unwrap(), 2);
        assert!(!verify(&pool, "hash-a").await.unwrap());
        assert_eq!(count(&pool).await.unwrap(), 0);
    }
}
