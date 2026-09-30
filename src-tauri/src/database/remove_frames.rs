//! One-time removal of frames (docs/design/remove-frames.md).
//!
//! A frame recorded membership by a stored `frame_id`, so resizing or moving
//! it let the box on the canvas and the membership drift apart. Each titled
//! frame's grouping is kept as a tag on its member nodes; then every
//! `frame_id` is cleared and the frames table is emptied. Positions and files
//! are not touched.
//!
//! The empty table stays. `nodes.frame_id` has a foreign key to it, and
//! SQLite checks that key on every node insert even when the value is NULL, so
//! without the table no node could be written. Removing the key means
//! rebuilding the nodes table with foreign keys off, which risks cascading
//! deletes into edges and storylines for no gain beyond an empty table.

use super::{DatabaseError, DbPool};

/// The hashtag length limit, as in `src/lib/contentParser.ts`
const MAX_TAG_LENGTH: usize = 50;

/// Convert a frame title into a tag the hashtag rule reads back whole.
///
/// The same rule as `toTag` in `src/lib/contentParser.ts`: lowercased, German
/// letters transliterated, every other character outside `a-z0-9_-` a
/// hyphen, hyphen runs collapsed, leading `-`/`_` and trailing `-` removed,
/// cut to 50 characters. Empty when nothing usable is left.
pub fn frame_title_to_tag(title: &str) -> String {
    let mut tag = String::new();
    for c in title.to_lowercase().chars() {
        match c {
            'ä' => tag.push_str("ae"),
            'ö' => tag.push_str("oe"),
            'ü' => tag.push_str("ue"),
            'ß' => tag.push_str("ss"),
            'a'..='z' | '0'..='9' | '_' | '-' => tag.push(c),
            _ => tag.push('-'),
        }
    }
    let mut collapsed = String::new();
    for c in tag.chars() {
        if !(c == '-' && collapsed.ends_with('-')) {
            collapsed.push(c);
        }
    }
    let trimmed = collapsed
        .trim_start_matches(['-', '_'])
        .trim_end_matches('-');
    trimmed
        .chars()
        .take(MAX_TAG_LENGTH)
        .collect::<String>()
        .trim_end_matches('-')
        .to_string()
}

/// Convert titled frames to tags, clear `frame_id`, empty the frames table.
///
/// Returns the number of frames removed and of nodes that gained a tag; both
/// are zero once the table is empty, so running again changes nothing.
pub async fn run(pool: &DbPool) -> Result<(usize, usize), DatabaseError> {
    let mut tx = pool.begin().await?;

    let frames: Vec<(String, Option<String>)> = sqlx::query_as("SELECT id, title FROM frames")
        .fetch_all(&mut *tx)
        .await?;
    if frames.is_empty() {
        return Ok((0, 0));
    }
    let mut tagged = 0;
    for (frame_id, title) in &frames {
        let tag = frame_title_to_tag(title.as_deref().unwrap_or(""));
        if tag.is_empty() {
            continue;
        }
        let members: Vec<(String, Option<String>)> =
            sqlx::query_as("SELECT id, tags FROM nodes WHERE frame_id = ?")
                .bind(frame_id)
                .fetch_all(&mut *tx)
                .await?;
        for (node_id, raw) in members {
            // Malformed tags read as none, as tagSync.ts reads them
            let mut tags: Vec<String> = raw
                .as_deref()
                .and_then(|t| serde_json::from_str(t).ok())
                .unwrap_or_default();
            if tags.contains(&tag) {
                continue;
            }
            tags.push(tag.clone());
            let json = serde_json::to_string(&tags)
                .map_err(|e| DatabaseError::Migration(format!("tags of {node_id}: {e}")))?;
            sqlx::query("UPDATE nodes SET tags = ? WHERE id = ?")
                .bind(json)
                .bind(&node_id)
                .execute(&mut *tx)
                .await?;
            tagged += 1;
        }
    }

    sqlx::query("UPDATE nodes SET frame_id = NULL WHERE frame_id IS NOT NULL")
        .execute(&mut *tx)
        .await?;
    // Children before parents: parent_frame_id references frames(id)
    sqlx::query("UPDATE frames SET parent_frame_id = NULL")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM frames").execute(&mut *tx).await?;
    tx.commit().await?;

    Ok((frames.len(), tagged))
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool_with_frames() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        crate::database::run_migrations(&pool)
            .await
            .expect("migrations");
        for (id, title) in [
            ("f1", Some("Definitions (Art. 3)")),
            ("f2", Some("Kapitel 1-30")),
            ("f3", None),
        ] {
            sqlx::query(
                "INSERT INTO frames (id, title, created_at, updated_at) VALUES (?, ?, 0, 0)",
            )
            .bind(id)
            .bind(title)
            .execute(&pool)
            .await
            .expect("frame");
        }
        for (id, frame, tags) in [
            ("n1", Some("f1"), Some(r#"["law"]"#)),
            ("n2", Some("f1"), None),
            ("n3", Some("f2"), Some(r#"["kapitel-1-30"]"#)),
            ("n4", Some("f3"), None),
            ("n5", None, Some(r#"["loose"]"#)),
        ] {
            sqlx::query(
                "INSERT INTO nodes (id, title, frame_id, tags, canvas_x, canvas_y, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 1.5, 2.5, 0, 0)",
            )
            .bind(id)
            .bind(id)
            .bind(frame)
            .bind(tags)
            .execute(&pool)
            .await
            .expect("node");
        }
        pool
    }

    async fn tags_of(pool: &DbPool, id: &str) -> Vec<String> {
        let raw: Option<String> = sqlx::query_scalar("SELECT tags FROM nodes WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("tags");
        raw.map(|t| serde_json::from_str(&t).expect("json"))
            .unwrap_or_default()
    }

    #[test]
    fn converts_titles_like_the_frontend() {
        // The cases of src/__tests__/tag-from-title.test.ts
        for (title, tag) in [
            ("Demo Project", "demo-project"),
            ("Definitions (Art. 3)", "definitions-art-3"),
            ("Kapitel 1-30", "kapitel-1-30"),
            ("Befunde Konsistenzprüfung", "befunde-konsistenzpruefung"),
            ("Straße der Größe", "strasse-der-groesse"),
            ("  --Figuren--  ", "figuren"),
            ("snake_case stays", "snake_case-stays"),
            ("(( ))", ""),
        ] {
            assert_eq!(frame_title_to_tag(title), tag, "{title}");
        }
        let long = frame_title_to_tag("Befunde Konsistenzprüfung 260901 (H und M behoben 260902)");
        assert!(long.len() <= 50 && !long.ends_with('-'), "{long}");
    }

    #[tokio::test]
    async fn keeps_each_grouping_as_a_tag() {
        let pool = pool_with_frames().await;

        let (frames, tagged) = run(&pool).await.expect("migration");

        assert_eq!(frames, 3);
        // n3 already carried its frame's tag; n4's frame had no title
        assert_eq!(tagged, 2);
        assert_eq!(tags_of(&pool, "n1").await, ["law", "definitions-art-3"]);
        assert_eq!(tags_of(&pool, "n2").await, ["definitions-art-3"]);
        assert_eq!(tags_of(&pool, "n3").await, ["kapitel-1-30"]);
        assert!(tags_of(&pool, "n4").await.is_empty());
        assert_eq!(tags_of(&pool, "n5").await, ["loose"]);
    }

    #[tokio::test]
    async fn clears_membership_and_empties_the_table() {
        let pool = pool_with_frames().await;

        run(&pool).await.expect("migration");

        let members: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM nodes WHERE frame_id IS NOT NULL")
                .fetch_one(&pool)
                .await
                .expect("count");
        assert_eq!(members, 0);
        let frames: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM frames")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(frames, 0);
    }

    #[tokio::test]
    async fn leaves_positions_alone() {
        let pool = pool_with_frames().await;

        run(&pool).await.expect("migration");

        let moved: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM nodes WHERE canvas_x != 1.5 OR canvas_y != 2.5",
        )
        .fetch_one(&pool)
        .await
        .expect("count");
        assert_eq!(moved, 0);
    }

    #[tokio::test]
    async fn nodes_stay_writable_afterwards() {
        // nodes.frame_id keeps its foreign key to the frames table, and SQLite
        // checks it on every insert: dropping the table made every node
        // insert fail with "no such table: main.frames"
        let pool = pool_with_frames().await;
        run(&pool).await.expect("migration");

        sqlx::query(
            "INSERT INTO nodes (id, title, created_at, updated_at) VALUES ('n6', 'n6', 0, 0)",
        )
        .execute(&pool)
        .await
        .expect("insert");
        sqlx::query("UPDATE nodes SET title = 'renamed' WHERE id = 'n1'")
            .execute(&pool)
            .await
            .expect("update");
        sqlx::query("DELETE FROM nodes WHERE id = 'n2'")
            .execute(&pool)
            .await
            .expect("delete");
    }

    #[tokio::test]
    async fn changes_nothing_when_run_again() {
        let pool = pool_with_frames().await;
        run(&pool).await.expect("first run");

        assert_eq!(run(&pool).await.expect("second run"), (0, 0));
        assert_eq!(tags_of(&pool, "n1").await, ["law", "definitions-art-3"]);
    }
}
