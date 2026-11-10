//! Earlier versions of a node's title and content
//! (docs/content/PRODUCT_DESIGN.md > Node history).
//!
//! A version is the state a write replaced, kept by the write itself: every
//! content and title update in `database::nodes` records here before it
//! overwrites the row, so no writer can forget. The current state is the node
//! row; restoring a version is an ordinary write, which keeps what it replaces.

use super::{DatabaseError, DbPool};
use serde::Serialize;

/// A write from Nodus itself: the editor, the agent, undo, a restore.
pub const SOURCE_APP: &str = "app";
/// A change picked up from the node's file in the vault.
pub const SOURCE_FILE: &str = "file";
/// An earlier version made current again. Its own source, so the state a
/// restore replaces is kept even minutes after the edit that made it.
pub const SOURCE_RESTORE: &str = "restore";

/// Writes from the same source within this many seconds of the last kept
/// version extend it rather than adding one. Autosave fires every second
/// while typing; a version per keystroke would bury the ones worth returning
/// to. Ten minutes keeps a version per stretch of work.
pub const COALESCE_WINDOW_SECS: i64 = 10 * 60;

/// Versions kept per node; beyond this the oldest go.
pub const MAX_VERSIONS_PER_NODE: i64 = 100;

/// The source a frontend write names, or [`SOURCE_APP`] when it names none or
/// one the history does not know.
pub fn history_source(named: Option<&str>) -> &'static str {
    match named {
        Some(SOURCE_RESTORE) => SOURCE_RESTORE,
        _ => SOURCE_APP,
    }
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct NodeVersion {
    pub id: i64,
    pub node_id: String,
    pub title: String,
    pub markdown_content: Option<String>,
    pub source: String,
    pub saved_at: i64,
}

#[derive(sqlx::FromRow)]
struct Current {
    title: String,
    markdown_content: Option<String>,
}

/// What a write is about to change. `None` leaves a field as it is.
#[derive(Debug, Clone, Copy, Default)]
pub struct Change<'a> {
    pub title: Option<&'a str>,
    pub content: Option<&'a str>,
}

/// Keep the version `change` is about to replace. Nothing is kept when the
/// node is unknown, when the write changes nothing, when the state is already
/// the latest version, or when the latest version is from the same source and
/// younger than [`COALESCE_WINDOW_SECS`]. Returns whether a version was added.
pub async fn record_before_write(
    pool: &DbPool,
    node_id: &str,
    source: &str,
    change: Change<'_>,
) -> Result<bool, DatabaseError> {
    record_before_write_at(
        pool,
        node_id,
        source,
        change,
        chrono::Utc::now().timestamp(),
    )
    .await
}

/// [`record_before_write`] with the clock passed in, for tests.
pub async fn record_before_write_at(
    pool: &DbPool,
    node_id: &str,
    source: &str,
    change: Change<'_>,
    now: i64,
) -> Result<bool, DatabaseError> {
    let Some(current) =
        sqlx::query_as::<_, Current>("SELECT title, markdown_content FROM nodes WHERE id = ?")
            .bind(node_id)
            .fetch_optional(pool)
            .await?
    else {
        return Ok(false);
    };

    let title_changes = change.title.is_some_and(|t| t != current.title);
    let content_changes = change
        .content
        .is_some_and(|c| Some(c) != current.markdown_content.as_deref());
    if !title_changes && !content_changes {
        return Ok(false);
    }

    if let Some(latest) = latest(pool, node_id).await? {
        let already_kept =
            latest.title == current.title && latest.markdown_content == current.markdown_content;
        let same_stretch = latest.source == source && now - latest.saved_at < COALESCE_WINDOW_SECS;
        if already_kept || same_stretch {
            return Ok(false);
        }
    }

    sqlx::query(
        "INSERT INTO node_history (node_id, title, markdown_content, source, saved_at) \
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(node_id)
    .bind(&current.title)
    .bind(&current.markdown_content)
    .bind(source)
    .bind(now)
    .execute(pool)
    .await?;

    sqlx::query(
        "DELETE FROM node_history WHERE node_id = ? AND id NOT IN \
         (SELECT id FROM node_history WHERE node_id = ? ORDER BY saved_at DESC, id DESC LIMIT ?)",
    )
    .bind(node_id)
    .bind(node_id)
    .bind(MAX_VERSIONS_PER_NODE)
    .execute(pool)
    .await?;

    Ok(true)
}

async fn latest(pool: &DbPool, node_id: &str) -> Result<Option<NodeVersion>, DatabaseError> {
    Ok(sqlx::query_as::<_, NodeVersion>(
        "SELECT id, node_id, title, markdown_content, source, saved_at FROM node_history \
         WHERE node_id = ? ORDER BY saved_at DESC, id DESC LIMIT 1",
    )
    .bind(node_id)
    .fetch_optional(pool)
    .await?)
}

/// Every kept version of a node, newest first.
pub async fn list(pool: &DbPool, node_id: &str) -> Result<Vec<NodeVersion>, DatabaseError> {
    Ok(sqlx::query_as::<_, NodeVersion>(
        "SELECT id, node_id, title, markdown_content, source, saved_at FROM node_history \
         WHERE node_id = ? ORDER BY saved_at DESC, id DESC",
    )
    .bind(node_id)
    .fetch_all(pool)
    .await?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{self, nodes};
    use sqlx::sqlite::SqlitePoolOptions;

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    async fn insert_note(pool: &DbPool, id: &str, title: &str, content: &str) {
        sqlx::query(
            "INSERT INTO nodes (id, title, markdown_content, node_type, canvas_x, canvas_y, \
             width, height, z_index, is_collapsed, created_at, updated_at) \
             VALUES (?, ?, ?, 'note', 0, 0, 200, 120, 0, 0, 0, 0)",
        )
        .bind(id)
        .bind(title)
        .bind(content)
        .execute(pool)
        .await
        .expect("insert note");
    }

    fn content(c: &str) -> Change<'_> {
        Change {
            title: None,
            content: Some(c),
        }
    }

    #[tokio::test]
    async fn a_change_keeps_the_version_it_replaces() {
        let pool = memory_pool().await;
        insert_note(&pool, "n", "Draft", "first text").await;

        assert!(
            record_before_write_at(&pool, "n", SOURCE_APP, content("second"), 1_000)
                .await
                .unwrap()
        );

        let versions = list(&pool, "n").await.unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].title, "Draft");
        assert_eq!(versions[0].markdown_content.as_deref(), Some("first text"));
        assert_eq!(versions[0].source, SOURCE_APP);
        assert_eq!(versions[0].saved_at, 1_000);
    }

    #[tokio::test]
    async fn a_write_that_changes_nothing_keeps_nothing() {
        let pool = memory_pool().await;
        insert_note(&pool, "n", "Draft", "same").await;

        let same = Change {
            title: Some("Draft"),
            content: Some("same"),
        };
        assert!(!record_before_write_at(&pool, "n", SOURCE_APP, same, 1_000)
            .await
            .unwrap());
        assert!(
            !record_before_write_at(&pool, "missing", SOURCE_APP, content("x"), 1_000)
                .await
                .unwrap()
        );
        assert!(list(&pool, "n").await.unwrap().is_empty());
    }

    #[tokio::test]
    async fn writes_in_one_stretch_share_a_version_but_a_pause_or_another_source_starts_a_new_one()
    {
        let pool = memory_pool().await;
        insert_note(&pool, "n", "Draft", "v0").await;

        assert!(
            record_before_write_at(&pool, "n", SOURCE_APP, content("v1"), 0)
                .await
                .unwrap()
        );
        nodes::update_content(&pool, "n", "v1", SOURCE_APP)
            .await
            .unwrap();

        // A second later, still the same stretch: v1 is not kept
        assert!(
            !record_before_write_at(&pool, "n", SOURCE_APP, content("v2"), 1)
                .await
                .unwrap()
        );
        sqlx::query("UPDATE nodes SET markdown_content = 'v2' WHERE id = 'n'")
            .execute(&pool)
            .await
            .unwrap();

        // The file changing underneath is another source: v2 is kept at once
        assert!(
            record_before_write_at(&pool, "n", SOURCE_FILE, content("v3"), 2)
                .await
                .unwrap()
        );
        sqlx::query("UPDATE nodes SET markdown_content = 'v3' WHERE id = 'n'")
            .execute(&pool)
            .await
            .unwrap();

        // After the window has passed, the next write keeps v3
        let later = 2 + COALESCE_WINDOW_SECS;
        assert!(
            record_before_write_at(&pool, "n", SOURCE_FILE, content("v4"), later)
                .await
                .unwrap()
        );

        let kept: Vec<Option<String>> = list(&pool, "n")
            .await
            .unwrap()
            .into_iter()
            .map(|v| v.markdown_content)
            .collect();
        assert_eq!(
            kept,
            vec![Some("v3".into()), Some("v2".into()), Some("v0".into())]
        );
    }

    #[tokio::test]
    async fn only_the_newest_versions_are_kept() {
        let pool = memory_pool().await;
        insert_note(&pool, "n", "Draft", "v0").await;

        for i in 0..(MAX_VERSIONS_PER_NODE + 5) {
            let next = format!("v{}", i + 1);
            let now = i * (COALESCE_WINDOW_SECS + 1);
            assert!(
                record_before_write_at(&pool, "n", SOURCE_APP, content(&next), now)
                    .await
                    .unwrap()
            );
            sqlx::query("UPDATE nodes SET markdown_content = ? WHERE id = 'n'")
                .bind(&next)
                .execute(&pool)
                .await
                .unwrap();
        }

        let versions = list(&pool, "n").await.unwrap();
        assert_eq!(versions.len() as i64, MAX_VERSIONS_PER_NODE);
        assert_eq!(versions[0].markdown_content.as_deref(), Some("v104"));
        assert_eq!(
            versions.last().unwrap().markdown_content.as_deref(),
            Some("v5")
        );
    }

    #[test]
    fn only_a_restore_may_name_itself() {
        assert_eq!(history_source(Some("restore")), SOURCE_RESTORE);
        assert_eq!(history_source(Some("file")), SOURCE_APP);
        assert_eq!(history_source(None), SOURCE_APP);
    }

    #[tokio::test]
    async fn the_node_writers_record_without_being_asked() {
        let pool = memory_pool().await;
        insert_note(&pool, "n", "Draft", "text").await;

        nodes::update_title(&pool, "n", "Final", SOURCE_APP)
            .await
            .unwrap();
        let versions = list(&pool, "n").await.unwrap();
        assert_eq!(versions.len(), 1);
        assert_eq!(versions[0].title, "Draft");

        // Same stretch: the content write extends the kept version
        nodes::update_content(&pool, "n", "more text", SOURCE_APP)
            .await
            .unwrap();
        assert_eq!(list(&pool, "n").await.unwrap().len(), 1);

        // The file changing is another source
        nodes::update_content_and_checksum(&pool, "n", "from disk", "abc", SOURCE_FILE)
            .await
            .unwrap();
        let versions = list(&pool, "n").await.unwrap();
        assert_eq!(versions.len(), 2);
        assert_eq!(versions[0].title, "Final");
        assert_eq!(versions[0].markdown_content.as_deref(), Some("more text"));
        // The source names the write that replaced this version
        assert_eq!(versions[0].source, SOURCE_FILE);
    }
}
