//! Papers fetched from Semantic Scholar become citation nodes
//! (docs/content/PRODUCT_DESIGN.md > Zotero takes citation nodes).
//!
//! "Fetch Citations" and "Fetch References" created the papers they found
//! without a node type, so they were stored as notes. They are told apart from
//! notes the user wrote by `semantic_scholar_id` in their frontmatter, a field
//! only the Semantic Scholar import writes. Only the type changes: content,
//! position and timestamps are left as they are.

use super::{DatabaseError, DbPool};

/// The frontmatter field that marks a paper fetched from Semantic Scholar
const FETCHED_MARKER: &str = "semantic_scholar_id:";

/// True when the content opens with a frontmatter block that carries the marker.
///
/// The body is not searched: a note that quotes the field in its text is a note.
pub fn is_fetched_paper(content: &str) -> bool {
    let mut lines = content.lines().map(str::trim_end);
    if lines.next() != Some("---") {
        return false;
    }
    for line in lines {
        if line == "---" {
            return false;
        }
        if line.starts_with(FETCHED_MARKER) {
            return true;
        }
    }
    false
}

/// Turn every fetched paper stored as a note into a citation node.
///
/// Returns the number of nodes converted; zero once none is left, so running
/// again changes nothing.
pub async fn run(pool: &DbPool) -> Result<usize, DatabaseError> {
    // A nodes table that predates the content column holds no fetched papers
    let has_content: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM pragma_table_info('nodes') WHERE name = 'markdown_content'",
    )
    .fetch_one(pool)
    .await?;
    if has_content == 0 {
        return Ok(0);
    }

    let candidates: Vec<(String, String)> = sqlx::query_as(
        "SELECT id, markdown_content FROM nodes
         WHERE node_type = 'note' AND markdown_content LIKE '---%semantic_scholar_id:%'",
    )
    .fetch_all(pool)
    .await?;

    let fetched: Vec<&String> = candidates
        .iter()
        .filter(|(_, content)| is_fetched_paper(content))
        .map(|(id, _)| id)
        .collect();
    if fetched.is_empty() {
        return Ok(0);
    }

    let mut tx = pool.begin().await?;
    for id in &fetched {
        sqlx::query("UPDATE nodes SET node_type = 'citation' WHERE id = ?")
            .bind(id.as_str())
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(fetched.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    const FETCHED: &str = "---\ndoi: 10.1000/example\nsemantic_scholar_id: abc123\ndate: 2012\n---\n\n# A fetched paper\n";
    const FETCHED_WITHOUT_DOI: &str =
        "---\nsemantic_scholar_id: abc123\n---\n\n# A fetched paper\n";
    const WRITTEN: &str = "---\ndate: 2024-01-01\n---\n\nA note that mentions semantic_scholar_id: abc123 in its text.\n";
    const PLAIN: &str = "# A note\n\nsemantic_scholar_id: abc123\n";

    async fn pool_with_nodes() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        crate::database::run_migrations(&pool)
            .await
            .expect("migrations");
        for (id, node_type, content, deleted_at) in [
            ("fetched", "note", Some(FETCHED), None),
            ("fetched-no-doi", "note", Some(FETCHED_WITHOUT_DOI), None),
            ("fetched-in-trash", "note", Some(FETCHED), Some(5)),
            ("written", "note", Some(WRITTEN), None),
            ("plain", "note", Some(PLAIN), None),
            ("empty", "note", None, None),
            ("stub", "citation-stub", Some(FETCHED), None),
            ("term", "term", Some(FETCHED), None),
        ] {
            sqlx::query(
                "INSERT INTO nodes (id, title, node_type, markdown_content, canvas_x, canvas_y, created_at, updated_at, deleted_at)
                 VALUES (?, ?, ?, ?, 1.5, 2.5, 3, 4, ?)",
            )
            .bind(id)
            .bind(id)
            .bind(node_type)
            .bind(content)
            .bind(deleted_at)
            .execute(&pool)
            .await
            .expect("node");
        }
        pool
    }

    async fn type_of(pool: &DbPool, id: &str) -> String {
        sqlx::query_scalar("SELECT node_type FROM nodes WHERE id = ?")
            .bind(id)
            .fetch_one(pool)
            .await
            .expect("node type")
    }

    #[test]
    fn reads_the_marker_from_the_frontmatter_only() {
        assert!(is_fetched_paper(FETCHED));
        assert!(is_fetched_paper(FETCHED_WITHOUT_DOI));
        assert!(is_fetched_paper(
            "---\r\nsemantic_scholar_id: abc\r\n---\r\n"
        ));
        assert!(!is_fetched_paper(WRITTEN));
        assert!(!is_fetched_paper(PLAIN));
        assert!(!is_fetched_paper(""));
    }

    #[tokio::test]
    async fn converts_fetched_notes_and_nothing_else() {
        let pool = pool_with_nodes().await;
        assert_eq!(run(&pool).await.expect("run"), 3);

        for id in ["fetched", "fetched-no-doi", "fetched-in-trash"] {
            assert_eq!(type_of(&pool, id).await, "citation", "{id}");
        }
        for id in ["written", "plain", "empty"] {
            assert_eq!(type_of(&pool, id).await, "note", "{id}");
        }
        assert_eq!(type_of(&pool, "stub").await, "citation-stub");
        assert_eq!(type_of(&pool, "term").await, "term");
    }

    #[tokio::test]
    async fn changes_only_the_type() {
        let pool = pool_with_nodes().await;
        run(&pool).await.expect("run");
        let (content, x, y, created, updated): (String, f64, f64, i64, i64) = sqlx::query_as(
            "SELECT markdown_content, canvas_x, canvas_y, created_at, updated_at FROM nodes WHERE id = 'fetched'",
        )
        .fetch_one(&pool)
        .await
        .expect("node");
        assert_eq!(content, FETCHED);
        assert_eq!((x, y, created, updated), (1.5, 2.5, 3, 4));
    }

    #[tokio::test]
    async fn finds_nothing_to_do_on_a_second_run() {
        let pool = pool_with_nodes().await;
        run(&pool).await.expect("first run");
        assert_eq!(run(&pool).await.expect("second run"), 0);
    }
}
