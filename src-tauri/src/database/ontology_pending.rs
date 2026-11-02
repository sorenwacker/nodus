//! Ontology relations waiting for an end that a later import will bring in
//! (PRODUCT_DESIGN.md > Ontologies split across files).

use super::{DatabaseError, DbPool};
use crate::ontology::transformer::Relation;

fn workspace_key(workspace_id: Option<&str>) -> &str {
    workspace_id.unwrap_or("")
}

/// The pending relations of one workspace.
pub async fn load(
    pool: &DbPool,
    workspace_id: Option<&str>,
) -> Result<Vec<Relation>, DatabaseError> {
    let rows: Vec<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT source_iri, target_iri, link_type, color FROM ontology_pending_relations WHERE workspace_key = ?",
    )
    .bind(workspace_key(workspace_id))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(source_iri, target_iri, link_type, color)| Relation {
            source_iri,
            target_iri,
            link_type,
            color,
        })
        .collect())
}

/// Replace a workspace's pending relations with those still unresolved.
pub async fn replace(
    pool: &DbPool,
    workspace_id: Option<&str>,
    relations: &[Relation],
) -> Result<(), DatabaseError> {
    let key = workspace_key(workspace_id);
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM ontology_pending_relations WHERE workspace_key = ?")
        .bind(key)
        .execute(&mut *tx)
        .await?;
    for r in relations {
        sqlx::query(
            "INSERT OR IGNORE INTO ontology_pending_relations
             (workspace_key, source_iri, target_iri, link_type, color) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(key)
        .bind(&r.source_iri)
        .bind(&r.target_iri)
        .bind(&r.link_type)
        .bind(&r.color)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}
