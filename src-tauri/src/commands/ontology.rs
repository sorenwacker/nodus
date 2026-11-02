//! Ontology import commands for importing OWL/RDF ontologies

use crate::database;
use serde::Deserialize;

use super::default_true;

// ============================================================================
// Ontology Import Commands
// ============================================================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOntologyInput {
    pub file_path: String,
    pub workspace_id: Option<String>,
    #[serde(default = "default_true")]
    pub create_class_nodes: bool,
    #[serde(default)]
    pub create_individual_nodes: bool,
    #[serde(default)]
    pub layout: crate::ontology::OntologyLayout,
}

#[tauri::command]
pub async fn import_ontology(
    input: ImportOntologyInput,
) -> Result<crate::ontology::OntologyImportResult, String> {
    let path = std::path::Path::new(&input.file_path);
    if !path.exists() {
        return Err("Ontology file/directory does not exist".to_string());
    }

    // The path arrives from the webview, so it is not yet the user's choice.
    // A file the user dropped is granted separately
    // (PRODUCT_DESIGN.md > Validating caller-supplied paths)
    super::validate_path_in_workspace(path).await?;

    let pool = database::get_pool().map_err(|e| e.to_string())?;
    import_ontology_into(pool, input).await
}

/// Import into a workspace, linking to what earlier imports put there
/// (PRODUCT_DESIGN.md > Ontologies split across files)
pub async fn import_ontology_into(
    pool: &database::DbPool,
    input: ImportOntologyInput,
) -> Result<crate::ontology::OntologyImportResult, String> {
    use crate::ontology::{
        parse_ontology, transform_into_workspace,
        transformer::{recorded_iri, TransformOptions},
        types::OntologyData,
    };
    use std::collections::{HashMap, HashSet};
    use std::path::Path;

    let path = Path::new(&input.file_path);

    // Parse the ontology - either a single file or all files in a directory
    let ontology_data = if path.is_dir() {
        // Parse all ontology files in the directory
        let mut combined = OntologyData {
            individuals: Vec::new(),
            object_properties: Vec::new(),
            classes: Vec::new(),
            subclass_relations: Vec::new(),
            property_definitions: Vec::new(),
        };

        let extensions = ["ttl", "rdf", "owl", "jsonld"];
        for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let file_path = entry.path();

            if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                if extensions.contains(&ext) {
                    println!("Parsing ontology file: {:?}", file_path);
                    match parse_ontology(&file_path) {
                        Ok(data) => {
                            combined.individuals.extend(data.individuals);
                            combined.object_properties.extend(data.object_properties);
                            combined.classes.extend(data.classes);
                            combined.subclass_relations.extend(data.subclass_relations);
                            combined
                                .property_definitions
                                .extend(data.property_definitions);
                        }
                        Err(e) => {
                            eprintln!("Warning: Failed to parse {:?}: {}", file_path, e);
                        }
                    }
                }
            }
        }

        if combined.individuals.is_empty() && combined.classes.is_empty() {
            return Err("No ontology data found in directory".to_string());
        }

        combined
    } else {
        // Parse single file
        parse_ontology(path).map_err(|e| format!("Failed to parse ontology: {}", e))?
    };

    let total_entities = ontology_data.classes.len() + ontology_data.individuals.len();

    // Force grid layout for large ontologies (hierarchical is too slow)
    let layout = if total_entities > 500 {
        crate::ontology::OntologyLayout::Grid
    } else {
        input.layout
    };

    // Transform to nodes and edges
    let options = TransformOptions {
        create_class_nodes: input.create_class_nodes,
        create_individual_nodes: input.create_individual_nodes,
        workspace_id: input.workspace_id.clone(),
        layout,
        ..Default::default()
    };

    // What earlier imports put in this workspace: nodes by the IRI their note
    // records, the edges between them, and the relations still waiting
    let workspace = input.workspace_id.as_deref();
    let in_workspace: Vec<(String, Option<String>)> = sqlx::query_as(
        "SELECT id, markdown_content FROM nodes WHERE deleted_at IS NULL AND workspace_id IS ?",
    )
    .bind(workspace)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;
    let existing: HashMap<String, String> = in_workspace
        .into_iter()
        .filter_map(|(id, content)| {
            content
                .as_deref()
                .and_then(recorded_iri)
                .map(|iri| (iri.to_string(), id))
        })
        .collect();
    let existing_edges: HashSet<(String, String, String)> = sqlx::query_as(
        "SELECT e.source_node_id, e.target_node_id, e.link_type FROM edges e
         JOIN nodes n ON n.id = e.source_node_id WHERE n.workspace_id IS ?",
    )
    .bind(workspace)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?
    .into_iter()
    .collect();
    let pending = database::ontology_pending::load(pool, workspace)
        .await
        .map_err(|e| e.to_string())?;

    let mut result = transform_into_workspace(&ontology_data, &options, &existing, &pending);
    // Re-importing does not duplicate an edge an earlier import made
    result.edges.retain(|e| {
        !existing_edges.contains(&(
            e.source_node_id.clone(),
            e.target_node_id.clone(),
            e.link_type.clone(),
        ))
    });

    database::nodes::create_many(pool, &result.nodes)
        .await
        .map_err(|e| format!("Failed to create nodes: {}", e))?;
    database::edges::create_many(pool, &result.edges)
        .await
        .map_err(|e| format!("Failed to create edges: {}", e))?;
    database::ontology_pending::replace(pool, workspace, &result.pending)
        .await
        .map_err(|e| format!("Failed to keep pending relations: {}", e))?;

    let node_ids: Vec<String> = result.nodes.iter().map(|n| n.id.clone()).collect();

    println!(
        "Import complete: {} nodes created, {} edges created, {} class nodes",
        result.nodes.len(),
        result.edges.len(),
        result.class_nodes_created
    );

    Ok(crate::ontology::OntologyImportResult {
        nodes_created: result.nodes.len(),
        edges_created: result.edges.len(),
        class_nodes_created: result.class_nodes_created,
        node_ids,
    })
}

#[cfg(test)]
mod tests {
    //! An ontology split across files gives the same graph whether its files
    //! are imported together, one at a time, or again
    //! (PRODUCT_DESIGN.md > Ontologies split across files).
    use super::*;
    use crate::database::DbPool;
    use sqlx::sqlite::SqlitePoolOptions;
    use std::io::Write;

    const CORE: &str = r#"
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix core: <http://example.org/core#> .
core:Unit a owl:Class ; rdfs:label "Unit" .
core:BaseUnit a owl:Class ; rdfs:label "Base Unit" ; rdfs:subClassOf core:Unit .
"#;

    const STANDARDS: &str = r#"
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix core: <http://example.org/core#> .
@prefix std: <http://example.org/std#> .
std:Second a owl:Class ; rdfs:label "Second" ; rdfs:subClassOf core:BaseUnit .
std:Kilosecond a owl:Class ; rdfs:label "Kilosecond" ; rdfs:subClassOf core:BaseUnit .
"#;

    async fn pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    fn file(ttl: &str) -> tempfile::NamedTempFile {
        let mut f = tempfile::NamedTempFile::with_suffix(".ttl").expect("temp");
        f.write_all(ttl.as_bytes()).expect("write");
        f
    }

    async fn import(pool: &DbPool, f: &tempfile::NamedTempFile) {
        import_ontology_into(
            pool,
            ImportOntologyInput {
                file_path: f.path().to_string_lossy().to_string(),
                workspace_id: None,
                create_class_nodes: true,
                create_individual_nodes: false,
                layout: crate::ontology::OntologyLayout::Grid,
            },
        )
        .await
        .expect("import");
    }

    /// Titles joined by subClassOf, sorted
    async fn hierarchy(pool: &DbPool) -> Vec<(String, String)> {
        let mut rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT s.title, t.title FROM edges e
             JOIN nodes s ON s.id = e.source_node_id JOIN nodes t ON t.id = e.target_node_id
             WHERE e.link_type = 'subClassOf'",
        )
        .fetch_all(pool)
        .await
        .expect("edges");
        rows.sort();
        rows
    }

    async fn node_count(pool: &DbPool) -> i64 {
        sqlx::query_scalar("SELECT COUNT(*) FROM nodes WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await
            .expect("count")
    }

    fn expected() -> Vec<(String, String)> {
        let mut e: Vec<(String, String)> = [
            ("Base Unit", "Unit"),
            ("Kilosecond", "Base Unit"),
            ("Second", "Base Unit"),
        ]
        .iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
        e.sort();
        e
    }

    #[tokio::test]
    async fn links_to_classes_imported_earlier() {
        let pool = pool().await;
        let (core, standards) = (file(CORE), file(STANDARDS));
        import(&pool, &core).await;
        import(&pool, &standards).await;
        assert_eq!(hierarchy(&pool).await, expected());
    }

    #[tokio::test]
    async fn links_to_classes_imported_later() {
        let pool = pool().await;
        let (core, standards) = (file(CORE), file(STANDARDS));
        import(&pool, &standards).await;
        import(&pool, &core).await;
        assert_eq!(hierarchy(&pool).await, expected());
    }

    #[tokio::test]
    async fn reimporting_adds_nothing_twice() {
        let pool = pool().await;
        let (core, standards) = (file(CORE), file(STANDARDS));
        import(&pool, &core).await;
        import(&pool, &standards).await;
        import(&pool, &standards).await;
        import(&pool, &core).await;
        assert_eq!(node_count(&pool).await, 4);
        assert_eq!(hierarchy(&pool).await, expected());
    }

    #[tokio::test]
    async fn keeps_workspaces_apart() {
        // A class in another workspace is not a match: each workspace is its own graph
        let pool = pool().await;
        sqlx::query("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES ('w2', 'Other', 0, 0)")
            .execute(&pool)
            .await
            .expect("workspace");
        let (core, standards) = (file(CORE), file(STANDARDS));
        import_ontology_into(
            &pool,
            ImportOntologyInput {
                file_path: core.path().to_string_lossy().to_string(),
                workspace_id: Some("w2".to_string()),
                create_class_nodes: true,
                create_individual_nodes: false,
                layout: crate::ontology::OntologyLayout::Grid,
            },
        )
        .await
        .expect("import");
        import(&pool, &standards).await;
        let links: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM edges e JOIN nodes s ON s.id = e.source_node_id
             JOIN nodes t ON t.id = e.target_node_id WHERE s.workspace_id IS NOT t.workspace_id",
        )
        .fetch_one(&pool)
        .await
        .expect("count");
        assert_eq!(links, 0);
    }
}
