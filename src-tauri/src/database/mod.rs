//! Database module for Nodus
//!
//! Uses LibSQL (SQLite fork) for local-first storage.
//! Stores metadata, canvas positions, and content for canvas-only nodes.
//! Content of file-backed nodes stays in their .md files; for those nodes
//! `markdown_content` is only a cache of the file contents.

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

/// Run an ALTER TABLE ... ADD COLUMN migration, tolerating only the error
/// raised when the column already exists. Any other failure propagates.
async fn run_add_column_migration(pool: &DbPool, sql: &str) -> Result<(), DatabaseError> {
    if let Err(e) = sqlx::query(sql).execute(pool).await {
        if e.to_string().contains("duplicate column name") {
            return Ok(());
        }
        return Err(e.into());
    }
    Ok(())
}

/// True if the edges table's unique constraint covers (source, target, link_type),
/// i.e. migration 008 has been applied (or the table was created with 001 in its
/// current form).
async fn edges_has_multi_type_constraint(pool: &DbPool) -> Result<bool, DatabaseError> {
    let unique_indexes: Vec<String> =
        sqlx::query_scalar("SELECT name FROM pragma_index_list('edges') WHERE \"unique\" = 1")
            .fetch_all(pool)
            .await?;
    for index in unique_indexes {
        let columns: Vec<String> =
            sqlx::query_scalar("SELECT name FROM pragma_index_info(?) ORDER BY seqno")
                .bind(&index)
                .fetch_all(pool)
                .await?;
        if columns == ["source_node_id", "target_node_id", "link_type"] {
            return Ok(true);
        }
    }
    Ok(false)
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

    // Add color column to storylines
    run_add_column_migration(
        pool,
        include_str!("../../migrations/003_storyline_color.sql"),
    )
    .await?;

    // Add color column to edges
    run_add_column_migration(pool, include_str!("../../migrations/004_edge_color.sql")).await?;

    // Add storyline_id column to edges
    run_add_column_migration(
        pool,
        include_str!("../../migrations/005_edge_storyline.sql"),
    )
    .await?;

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

    // Add directed column to edges before the 008 rebuild so its values survive
    run_add_column_migration(
        pool,
        "ALTER TABLE edges ADD COLUMN directed INTEGER NOT NULL DEFAULT 1",
    )
    .await?;

    // Rebuild the edges table so the unique constraint covers link_type,
    // allowing multiple edges with different link_types between the same nodes.
    // SQLite cannot alter constraints in place; the guard must live in Rust
    // because RAISE() is only valid inside triggers.
    if !edges_has_multi_type_constraint(pool).await? {
        let mut tx = pool.begin().await?;
        // A leftover edges_new means a previous rebuild was interrupted
        sqlx::query("DROP TABLE IF EXISTS edges_new")
            .execute(&mut *tx)
            .await?;
        sqlx::query(include_str!("../../migrations/008_edge_multi_type.sql"))
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }

    // Add sync_enabled to workspaces
    run_add_column_migration(
        pool,
        include_str!("../../migrations/009_workspace_sync.sql"),
    )
    .await?;

    // Add folder_path column to frames for folder-frame sync
    run_add_column_migration(
        pool,
        include_str!("../../migrations/010_frame_folder_path.sql"),
    )
    .await?;

    // Add parent_frame_id column for nested frames support
    run_add_column_migration(pool, include_str!("../../migrations/011_frame_parent.sql")).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::edges::Edge;

    async fn memory_pool() -> DbPool {
        // A single connection is required: each connection to `sqlite::memory:`
        // gets its own private database.
        SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool")
    }

    async fn insert_node(pool: &DbPool, id: &str) {
        sqlx::query("INSERT INTO nodes (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)")
            .bind(id)
            .bind(id)
            .execute(pool)
            .await
            .expect("insert node");
    }

    fn edge(id: &str, source: &str, target: &str, link_type: &str, created_at: i64) -> Edge {
        Edge {
            id: id.to_string(),
            source_node_id: source.to_string(),
            target_node_id: target.to_string(),
            label: None,
            link_type: link_type.to_string(),
            weight: 1.0,
            color: None,
            storyline_id: None,
            created_at,
            directed: true,
        }
    }

    #[tokio::test]
    async fn run_migrations_is_idempotent() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.expect("first run");
        run_migrations(&pool).await.expect("second run");
    }

    #[tokio::test]
    async fn migration_008_upgrades_legacy_edges_table() {
        let pool = memory_pool().await;

        // Simulate a database created before the 3-column unique constraint:
        // a nodes table with the columns 001's indexes reference, plus an
        // edges table with the old 2-column constraint.
        sqlx::query(
            "CREATE TABLE nodes (id TEXT PRIMARY KEY, title TEXT NOT NULL,
             file_path TEXT UNIQUE, node_type TEXT NOT NULL DEFAULT 'note',
             workspace_id TEXT, deleted_at INTEGER,
             created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
        )
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "CREATE TABLE edges (
                id TEXT PRIMARY KEY,
                source_node_id TEXT NOT NULL,
                target_node_id TEXT NOT NULL,
                label TEXT,
                link_type TEXT NOT NULL DEFAULT 'related',
                weight REAL NOT NULL DEFAULT 1.0,
                created_at INTEGER NOT NULL,
                UNIQUE(source_node_id, target_node_id)
            )",
        )
        .execute(&pool)
        .await
        .unwrap();
        insert_node(&pool, "a").await;
        insert_node(&pool, "b").await;
        sqlx::query(
            "INSERT INTO edges (id, source_node_id, target_node_id, link_type, created_at)
             VALUES ('e1', 'a', 'b', 'related', 1)",
        )
        .execute(&pool)
        .await
        .unwrap();

        run_migrations(&pool)
            .await
            .expect("migrations on legacy schema");

        // The legacy row survived the table rebuild
        let all = edges::get_all(&pool).await.unwrap();
        assert_eq!(all.len(), 1, "legacy edge must survive migration");

        // A second link_type between the same pair is now allowed
        edges::create(&pool, &edge("e2", "a", "b", "cites", 2))
            .await
            .expect("second link_type between same node pair must be allowed");

        // A duplicate of the same link_type is still rejected
        assert!(
            edges::create(&pool, &edge("e3", "a", "b", "cites", 3))
                .await
                .is_err(),
            "same link_type between same pair must still violate the constraint"
        );
    }

    #[tokio::test]
    async fn deduplicate_preserves_distinct_link_types() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.unwrap();
        insert_node(&pool, "a").await;
        insert_node(&pool, "b").await;

        edges::create(&pool, &edge("e1", "a", "b", "related", 1))
            .await
            .unwrap();
        edges::create(&pool, &edge("e2", "a", "b", "cites", 2))
            .await
            .unwrap();
        edges::create(&pool, &edge("e3", "a", "b", "supports", 3))
            .await
            .unwrap();

        let removed = edges::deduplicate(&pool).await.unwrap();
        assert_eq!(removed, 0, "distinct link_types are not duplicates");
        assert_eq!(edges::get_all(&pool).await.unwrap().len(), 3);
    }

    #[tokio::test]
    async fn storyline_add_node_inserts_at_position() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.unwrap();
        for id in ["n1", "n2", "n3", "n4"] {
            insert_node(&pool, id).await;
        }
        let storyline = storylines::Storyline {
            id: "s1".into(),
            title: "s1".into(),
            description: None,
            color: None,
            workspace_id: None,
            created_at: 0,
            updated_at: 0,
        };
        storylines::create(&pool, &storyline).await.unwrap();

        for id in ["n1", "n2", "n3"] {
            storylines::add_node(&pool, "s1", id, None).await.unwrap();
        }

        // Inserting at the front must shift n1..n3 without violating
        // UNIQUE(storyline_id, sequence_order)
        let inserted = storylines::add_node(&pool, "s1", "n4", Some(0))
            .await
            .expect("positional insert must not violate the unique constraint");
        assert_eq!(inserted.sequence_order, 0);

        let ordered: Vec<String> = storylines::get_nodes_with_data(&pool, "s1")
            .await
            .unwrap()
            .into_iter()
            .map(|n| n.id)
            .collect();
        assert_eq!(ordered, ["n4", "n1", "n2", "n3"]);
    }

    #[tokio::test]
    async fn storyline_add_node_duplicate_returns_existing_without_reordering() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.unwrap();
        insert_node(&pool, "n1").await;
        insert_node(&pool, "n2").await;
        let storyline = storylines::Storyline {
            id: "s1".into(),
            title: "s1".into(),
            description: None,
            color: None,
            workspace_id: None,
            created_at: 0,
            updated_at: 0,
        };
        storylines::create(&pool, &storyline).await.unwrap();
        storylines::add_node(&pool, "s1", "n1", None).await.unwrap();
        storylines::add_node(&pool, "s1", "n2", None).await.unwrap();

        // Re-adding n1 at any position must return the existing membership
        // and leave the ordering untouched
        let existing = storylines::add_node(&pool, "s1", "n1", Some(0))
            .await
            .expect("duplicate add must not fail");
        assert_eq!(existing.sequence_order, 0);

        let ordered: Vec<String> = storylines::get_nodes_with_data(&pool, "s1")
            .await
            .unwrap()
            .into_iter()
            .map(|n| n.id)
            .collect();
        assert_eq!(ordered, ["n1", "n2"]);
    }

    #[tokio::test]
    async fn create_many_edges_rolls_back_on_error() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.unwrap();
        insert_node(&pool, "a").await;
        insert_node(&pool, "b").await;

        let batch = vec![
            edge("e1", "a", "b", "related", 1),
            edge("e2", "a", "b", "cites", 2),
            // Violates UNIQUE(source, target, link_type) against e1
            edge("e3", "a", "b", "related", 3),
        ];
        assert!(edges::create_many(&pool, &batch).await.is_err());
        assert_eq!(
            edges::get_all(&pool).await.unwrap().len(),
            0,
            "failed batch insert must not leave partial data"
        );
    }

    #[tokio::test]
    async fn create_many_nodes_rolls_back_on_error() {
        let pool = memory_pool().await;
        run_migrations(&pool).await.unwrap();

        let node = |id: &str| nodes::Node {
            id: id.to_string(),
            title: id.to_string(),
            file_path: None,
            markdown_content: None,
            node_type: "note".into(),
            canvas_x: 0.0,
            canvas_y: 0.0,
            width: 200.0,
            height: 120.0,
            z_index: 0,
            frame_id: None,
            color_theme: None,
            is_collapsed: false,
            tags: None,
            workspace_id: None,
            checksum: None,
            created_at: 0,
            updated_at: 0,
            deleted_at: None,
        };
        let batch = vec![node("a"), node("b"), node("a")];
        assert!(nodes::create_many(&pool, &batch).await.is_err());
        assert_eq!(
            nodes::get_all(&pool).await.unwrap().len(),
            0,
            "failed batch insert must not leave partial data"
        );
    }
}
