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
    use crate::ontology::{
        parse_ontology, transform_to_nodus, transformer::TransformOptions, types::OntologyData,
    };
    use std::path::Path;

    let path = Path::new(&input.file_path);

    if !path.exists() {
        return Err("Ontology file/directory does not exist".to_string());
    }

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

    let result = transform_to_nodus(&ontology_data, &options);

    // Save nodes and edges transactionally so a failed import leaves no partial graph
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    database::nodes::create_many(pool, &result.nodes)
        .await
        .map_err(|e| format!("Failed to create nodes: {}", e))?;
    database::edges::create_many(pool, &result.edges)
        .await
        .map_err(|e| format!("Failed to create edges: {}", e))?;

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
