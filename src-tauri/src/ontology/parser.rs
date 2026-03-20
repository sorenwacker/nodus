//! RDF parsing for ontology import
//!
//! Supports Turtle, RDF/XML, and basic JSON-LD formats.

use super::types::*;
use rio_api::model::{Literal, NamedNode, Subject, Term, Triple};
use rio_api::parser::TriplesParser;
use rio_turtle::TurtleParser;
use rio_xml::RdfXmlParser;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::io::BufReader;
use std::path::Path;

/// Well-known RDF/OWL namespaces
const RDF_TYPE: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const RDFS_LABEL: &str = "http://www.w3.org/2000/01/rdf-schema#label";
const RDFS_COMMENT: &str = "http://www.w3.org/2000/01/rdf-schema#comment";
const RDFS_SUBCLASS_OF: &str = "http://www.w3.org/2000/01/rdf-schema#subClassOf";
const RDFS_DOMAIN: &str = "http://www.w3.org/2000/01/rdf-schema#domain";
const RDFS_RANGE: &str = "http://www.w3.org/2000/01/rdf-schema#range";
const SCHEMA_DOMAIN_INCLUDES: &str = "http://schema.org/domainIncludes";
const SCHEMA_RANGE_INCLUDES: &str = "http://schema.org/rangeIncludes";
// Also handle https variant
const SCHEMA_DOMAIN_INCLUDES_HTTPS: &str = "https://schema.org/domainIncludes";
const SCHEMA_RANGE_INCLUDES_HTTPS: &str = "https://schema.org/rangeIncludes";
const RDFS_CLASS: &str = "http://www.w3.org/2000/01/rdf-schema#Class";
const OWL_CLASS: &str = "http://www.w3.org/2002/07/owl#Class";
const OWL_OBJECT_PROPERTY: &str = "http://www.w3.org/2002/07/owl#ObjectProperty";
const OWL_DATATYPE_PROPERTY: &str = "http://www.w3.org/2002/07/owl#DatatypeProperty";
const OWL_NAMED_INDIVIDUAL: &str = "http://www.w3.org/2002/07/owl#NamedIndividual";
const DC_DESCRIPTION: &str = "http://purl.org/dc/elements/1.1/description";
const DC_TERMS_DESCRIPTION: &str = "http://purl.org/dc/terms/description";
const SKOS_PREF_LABEL: &str = "http://www.w3.org/2004/02/skos/core#prefLabel";

/// Data property predicates to exclude from markdown content
const EXCLUDED_PREDICATES: &[&str] = &[
    RDF_TYPE,
    RDFS_LABEL,
    RDFS_COMMENT,
    RDFS_SUBCLASS_OF,
    SKOS_PREF_LABEL,
];

/// Parse an ontology file into OntologyData
pub fn parse_ontology(path: &Path) -> Result<OntologyData, String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .ok_or_else(|| "Cannot determine file extension".to_string())?;

    let format = OntologyFormat::from_extension(ext)
        .ok_or_else(|| format!("Unsupported ontology format: .{}", ext))?;

    match format {
        OntologyFormat::Turtle => parse_turtle(path),
        OntologyFormat::RdfXml => parse_rdf_xml(path),
        OntologyFormat::JsonLd => parse_json_ld(path),
    }
}

/// Parse Turtle format
fn parse_turtle(path: &Path) -> Result<OntologyData, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    // Use file URI as base
    let base_iri = format!("file://{}", path.display());
    let base = oxiri::Iri::parse(base_iri).map_err(|e| format!("Invalid base IRI: {}", e))?;

    let mut parser = TurtleParser::new(reader, Some(base));

    // Collect triples using callback
    let collector = TripleCollector::new();
    parser
        .parse_all(&mut |triple| {
            collector.process_triple(triple);
            Ok(()) as Result<(), std::io::Error>
        })
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(collector.into_ontology_data())
}

/// Parse RDF/XML format (including OWL)
fn parse_rdf_xml(path: &Path) -> Result<OntologyData, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let reader = BufReader::new(file);

    let base_iri = format!("file://{}", path.display());
    let base = oxiri::Iri::parse(base_iri).map_err(|e| format!("Invalid base IRI: {}", e))?;

    let mut parser = RdfXmlParser::new(reader, Some(base));

    let collector = TripleCollector::new();
    parser
        .parse_all(&mut |triple| {
            collector.process_triple(triple);
            Ok(()) as Result<(), std::io::Error>
        })
        .map_err(|e| format!("Parse error: {}", e))?;

    Ok(collector.into_ontology_data())
}

/// Collects triples and builds OntologyData
struct TripleCollector {
    subjects: RefCell<HashMap<String, SubjectData>>,
    object_properties: RefCell<Vec<ObjectProperty>>,
    classes: RefCell<HashMap<String, OntologyClass>>,
    subclass_relations: RefCell<Vec<SubclassRelation>>,
    /// OWL ObjectProperty definitions with domain/range
    property_definitions: RefCell<HashMap<String, PropertyDefinition>>,
}

/// Intermediate structure for collecting property definition info
#[derive(Default)]
struct PropertyDefinition {
    label: Option<String>,
    description: Option<String>,
    domains: Vec<String>,
    ranges: Vec<String>,
}

impl TripleCollector {
    fn new() -> Self {
        Self {
            subjects: RefCell::new(HashMap::new()),
            object_properties: RefCell::new(Vec::new()),
            classes: RefCell::new(HashMap::new()),
            subclass_relations: RefCell::new(Vec::new()),
            property_definitions: RefCell::new(HashMap::new()),
        }
    }

    fn process_triple(&self, triple: Triple) {
        let subject_iri = match triple.subject {
            Subject::NamedNode(NamedNode { iri }) => iri.to_string(),
            Subject::BlankNode(_) => return, // Skip blank nodes
            _ => return,
        };

        let predicate_iri = triple.predicate.iri.to_string();

        match triple.object {
            Term::NamedNode(NamedNode { iri: obj_iri }) => {
                let obj_iri = obj_iri.to_string();

                if predicate_iri == RDF_TYPE {
                    // Track type
                    let mut subjects = self.subjects.borrow_mut();
                    let data = subjects.entry(subject_iri.clone()).or_default();
                    data.types.push(obj_iri.clone());

                    // If it's a class definition, track it (owl:Class or rdfs:Class)
                    if obj_iri == OWL_CLASS || obj_iri == RDFS_CLASS {
                        let mut classes = self.classes.borrow_mut();
                        classes.entry(subject_iri.clone()).or_insert_with(|| OntologyClass {
                            iri: subject_iri.clone(),
                            label: None,
                            description: None,
                        });
                    }

                    // If it's an ObjectProperty definition, track it
                    if obj_iri == OWL_OBJECT_PROPERTY {
                        let mut props = self.property_definitions.borrow_mut();
                        props.entry(subject_iri.clone()).or_default();
                    }
                } else if predicate_iri == RDFS_SUBCLASS_OF {
                    self.subclass_relations.borrow_mut().push(SubclassRelation {
                        subclass_iri: subject_iri.clone(),
                        superclass_iri: obj_iri,
                    });
                } else if predicate_iri == RDFS_DOMAIN
                    || predicate_iri == SCHEMA_DOMAIN_INCLUDES
                    || predicate_iri == SCHEMA_DOMAIN_INCLUDES_HTTPS
                {
                    // Track domain for property definitions (rdfs:domain or schema:domainIncludes)
                    let mut props = self.property_definitions.borrow_mut();
                    let prop = props.entry(subject_iri.clone()).or_default();
                    prop.domains.push(obj_iri);
                } else if predicate_iri == RDFS_RANGE
                    || predicate_iri == SCHEMA_RANGE_INCLUDES
                    || predicate_iri == SCHEMA_RANGE_INCLUDES_HTTPS
                {
                    // Track range for property definitions (rdfs:range or schema:rangeIncludes)
                    let mut props = self.property_definitions.borrow_mut();
                    let prop = props.entry(subject_iri.clone()).or_default();
                    prop.ranges.push(obj_iri);
                } else {
                    // Object property usage (actual triple)
                    self.object_properties.borrow_mut().push(ObjectProperty {
                        subject_iri: subject_iri.clone(),
                        predicate_local_name: local_name(&predicate_iri),
                        object_iri: obj_iri,
                    });
                }
            }
            Term::Literal(lit) => {
                let value = match lit {
                    Literal::Simple { value } => value.to_string(),
                    Literal::LanguageTaggedString { value, .. } => value.to_string(),
                    Literal::Typed { value, .. } => value.to_string(),
                };

                let mut subjects = self.subjects.borrow_mut();
                let data = subjects.entry(subject_iri.clone()).or_default();

                if predicate_iri == RDFS_LABEL || predicate_iri == SKOS_PREF_LABEL {
                    data.label = Some(value);
                } else if predicate_iri == RDFS_COMMENT
                    || predicate_iri == DC_DESCRIPTION
                    || predicate_iri == DC_TERMS_DESCRIPTION
                {
                    data.description = Some(value);
                } else if !EXCLUDED_PREDICATES.contains(&predicate_iri.as_str()) {
                    // Data property
                    data.data_properties.push((local_name(&predicate_iri), value));
                }

                // Update class if this is a class definition
                let mut classes = self.classes.borrow_mut();
                if let Some(class) = classes.get_mut(&subject_iri) {
                    if predicate_iri == RDFS_LABEL || predicate_iri == SKOS_PREF_LABEL {
                        class.label = data.label.clone();
                    }
                    if predicate_iri == RDFS_COMMENT {
                        class.description = data.description.clone();
                    }
                }

                // Update property definition if this is a property
                let mut props = self.property_definitions.borrow_mut();
                if let Some(prop) = props.get_mut(&subject_iri) {
                    if predicate_iri == RDFS_LABEL || predicate_iri == SKOS_PREF_LABEL {
                        prop.label = data.label.clone();
                    }
                    if predicate_iri == RDFS_COMMENT {
                        prop.description = data.description.clone();
                    }
                }
            }
            _ => {}
        }
    }

    fn into_ontology_data(self) -> OntologyData {
        let subjects = self.subjects.into_inner();
        let classes = self.classes.into_inner();
        let prop_defs = self.property_definitions.into_inner();

        // Convert subjects to individuals (excluding pure class definitions)
        let individuals: Vec<OntologyIndividual> = subjects
            .into_iter()
            .filter(|(_, data)| {
                // Include if it's a named individual or has a non-OWL/RDFS type
                data.types.iter().any(|t| {
                    t == OWL_NAMED_INDIVIDUAL
                        || (!t.starts_with("http://www.w3.org/2002/07/owl#")
                            && !t.starts_with("http://www.w3.org/2000/01/rdf-schema#")
                            && t != OWL_CLASS)
                })
            })
            .map(|(iri, data)| {
                let class_iri = data.types.iter().find(|t| {
                    t != &OWL_NAMED_INDIVIDUAL
                        && !t.starts_with("http://www.w3.org/2002/07/owl#")
                        && !t.starts_with("http://www.w3.org/2000/01/rdf-schema#")
                });

                OntologyIndividual {
                    iri: iri.clone(),
                    label: data.label,
                    class_iri: class_iri.cloned(),
                    data_properties: data.data_properties,
                    description: data.description,
                }
            })
            .collect();

        // Convert property definitions
        let property_definitions: Vec<OntologyProperty> = prop_defs
            .into_iter()
            .map(|(iri, def)| OntologyProperty {
                iri,
                label: def.label,
                description: def.description,
                domains: def.domains,
                ranges: def.ranges,
            })
            .collect();

        OntologyData {
            individuals,
            object_properties: self.object_properties.into_inner(),
            classes: classes.into_values().collect(),
            subclass_relations: self.subclass_relations.into_inner(),
            property_definitions,
        }
    }
}

/// Intermediate data structure for collecting subject information
#[derive(Default)]
struct SubjectData {
    types: Vec<String>,
    label: Option<String>,
    description: Option<String>,
    data_properties: Vec<(String, String)>,
}

/// Parse JSON-LD format (basic support)
fn parse_json_ld(path: &Path) -> Result<OntologyData, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid JSON: {}", e))?;

    let mut individuals = Vec::new();
    let mut object_properties = Vec::new();
    let mut classes = Vec::new();

    // Handle @graph array or single object
    let items = if let Some(graph) = json.get("@graph").and_then(|g| g.as_array()) {
        graph.iter().collect::<Vec<_>>()
    } else if json.is_object() {
        vec![&json]
    } else {
        return Err("Invalid JSON-LD structure".to_string());
    };

    for item in items {
        let obj = match item.as_object() {
            Some(o) => o,
            None => continue,
        };

        let id = obj.get("@id").and_then(|v| v.as_str()).map(String::from);
        let id = match id {
            Some(i) => i,
            None => continue,
        };

        // Get type(s)
        let types: Vec<String> = match obj.get("@type") {
            Some(serde_json::Value::String(t)) => vec![t.clone()],
            Some(serde_json::Value::Array(arr)) => {
                arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()
            }
            _ => Vec::new(),
        };

        // Check if it's a class
        if types.contains(&OWL_CLASS.to_string()) || types.contains(&"owl:Class".to_string()) {
            classes.push(OntologyClass {
                iri: id.clone(),
                label: get_json_label(obj),
                description: get_json_description(obj),
            });
            continue;
        }

        // Collect data properties
        let mut data_props = Vec::new();
        for (key, value) in obj.iter() {
            if key.starts_with('@') {
                continue;
            }
            if key == "rdfs:label" || key == "label" || key == "rdfs:comment" {
                continue;
            }

            match value {
                serde_json::Value::String(s) => {
                    data_props.push((key.clone(), s.clone()));
                }
                serde_json::Value::Number(n) => {
                    data_props.push((key.clone(), n.to_string()));
                }
                serde_json::Value::Object(ref_obj) => {
                    // Object property reference
                    if let Some(ref_id) = ref_obj.get("@id").and_then(|v| v.as_str()) {
                        object_properties.push(ObjectProperty {
                            subject_iri: id.clone(),
                            predicate_local_name: local_name(key),
                            object_iri: ref_id.to_string(),
                        });
                    }
                }
                serde_json::Value::Array(arr) => {
                    for item in arr {
                        if let Some(ref_obj) = item.as_object() {
                            if let Some(ref_id) = ref_obj.get("@id").and_then(|v| v.as_str()) {
                                object_properties.push(ObjectProperty {
                                    subject_iri: id.clone(),
                                    predicate_local_name: local_name(key),
                                    object_iri: ref_id.to_string(),
                                });
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Get class from types (first non-owl type)
        let class_iri = types.iter().find(|t| {
            !t.starts_with("http://www.w3.org/2002/07/owl#")
                && !t.starts_with("owl:")
                && *t != OWL_NAMED_INDIVIDUAL
        });

        individuals.push(OntologyIndividual {
            iri: id,
            label: get_json_label(obj),
            class_iri: class_iri.cloned(),
            data_properties: data_props,
            description: get_json_description(obj),
        });
    }

    Ok(OntologyData {
        individuals,
        object_properties,
        classes,
        subclass_relations: Vec::new(),
        property_definitions: Vec::new(), // TODO: Extract from JSON-LD
    })
}

fn get_json_label(obj: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    // Try various label properties
    for key in &["rdfs:label", "label", "name", "skos:prefLabel"] {
        if let Some(v) = obj.get(*key) {
            if let Some(s) = v.as_str() {
                return Some(s.to_string());
            }
            if let Some(arr) = v.as_array() {
                if let Some(first) = arr.first() {
                    if let Some(s) = first.as_str() {
                        return Some(s.to_string());
                    }
                    if let Some(obj) = first.as_object() {
                        if let Some(val) = obj.get("@value").and_then(|v| v.as_str()) {
                            return Some(val.to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

fn get_json_description(obj: &serde_json::Map<String, serde_json::Value>) -> Option<String> {
    for key in &["rdfs:comment", "comment", "description", "dc:description"] {
        if let Some(v) = obj.get(*key) {
            if let Some(s) = v.as_str() {
                return Some(s.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_parse_turtle() {
        let ttl = r#"
@prefix ex: <http://example.org/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

ex:Person a owl:Class ;
    rdfs:label "Person" .

ex:john a ex:Person ;
    rdfs:label "John Doe" ;
    ex:age "42" ;
    ex:knows ex:jane .

ex:jane a ex:Person ;
    rdfs:label "Jane Smith" .
"#;

        let mut file = NamedTempFile::with_suffix(".ttl").unwrap();
        file.write_all(ttl.as_bytes()).unwrap();

        let result = parse_ontology(file.path()).unwrap();

        assert_eq!(result.individuals.len(), 2);
        assert_eq!(result.classes.len(), 1);

        let john = result
            .individuals
            .iter()
            .find(|i| i.label.as_deref() == Some("John Doe"))
            .unwrap();
        assert!(john.iri.contains("john"));
        assert_eq!(john.data_properties.len(), 1);
        assert_eq!(john.data_properties[0], ("age".to_string(), "42".to_string()));
    }

    #[test]
    fn test_parse_ppeo() {
        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/PPEO/PPEO.owl");
        if !path.exists() {
            return;
        }

        let result = parse_ontology(path).unwrap();
        assert_eq!(result.classes.len(), 31, "Expected 31 classes per README");
    }

    #[test]
    fn test_parse_prov_o() {
        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/PROV-O/prov-o.ttl");
        if !path.exists() {
            return;
        }

        let result = parse_ontology(path).unwrap();
        // README says 21 classes
        assert!(result.classes.len() >= 20, "Expected ~21 classes, got {}", result.classes.len());
    }

    #[test]
    fn test_parse_sosa_ssn_directory() {
        use crate::ontology::types::OntologyData;

        let dir = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/SOSA-SSN");
        if !dir.exists() {
            return;
        }

        // Parse all TTL files (avoid RDF duplicates)
        let mut combined = OntologyData::default();
        for entry in std::fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "ttl") {
                if let Ok(data) = parse_ontology(&path) {
                    combined.classes.extend(data.classes);
                }
            }
        }

        // Dedupe by IRI
        let unique: std::collections::HashSet<String> = combined.classes.iter().map(|c| c.iri.clone()).collect();
        // README says 19 classes but SOSA+SSN together may have more
        assert!(unique.len() >= 19, "Expected ~19 classes, got {}", unique.len());
    }

    #[test]
    fn test_parse_oeso() {
        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/OESO/oeso.owl");
        if !path.exists() {
            return;
        }

        let result = parse_ontology(path).unwrap();
        // README says 120 classes
        assert!(result.classes.len() >= 100, "Expected ~120 classes, got {}", result.classes.len());
    }

    #[test]
    fn test_parse_oboe_directory() {
        use crate::ontology::types::OntologyData;

        let dir = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/OBOE");
        if !dir.exists() {
            return;
        }

        let mut combined = OntologyData::default();
        for entry in std::fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "owl") {
                if let Ok(data) = parse_ontology(&path) {
                    combined.classes.extend(data.classes);
                }
            }
        }

        let unique: std::collections::HashSet<String> = combined.classes.iter().map(|c| c.iri.clone()).collect();
        // README says 291 classes
        assert!(unique.len() >= 250, "Expected ~291 classes, got {}", unique.len());
    }

    #[test]
    #[ignore] // Large file, run manually with --ignored
    fn test_parse_obi() {
        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/OBI/obi.owl");
        if !path.exists() {
            return;
        }

        let result = parse_ontology(path).unwrap();
        // README says 5074 classes
        println!("OBI: {} classes", result.classes.len());
        assert!(result.classes.len() >= 5000, "Expected ~5074 classes, got {}", result.classes.len());
    }

    #[test]
    fn test_all_ontologies_summary() {
        use crate::ontology::{transform_to_nodus, transformer::TransformOptions, types::OntologyData};

        // Expected class counts from README.md
        let ontologies: &[(&str, &str, usize)] = &[
            ("PPEO", "/Users/sdrwacker/workspace/ontologies/PPEO/PPEO.owl", 31),
            ("PROV-O", "/Users/sdrwacker/workspace/ontologies/PROV-O/prov-o.ttl", 21),
            ("OESO", "/Users/sdrwacker/workspace/ontologies/OESO/oeso.owl", 120),
            ("SOSA-SSN", "/Users/sdrwacker/workspace/ontologies/SOSA-SSN", 19),
            ("OBOE", "/Users/sdrwacker/workspace/ontologies/OBOE", 291),
        ];

        println!("\n=== Ontology Import Validation ===\n");
        println!("{:<12} {:>8} {:>8} {:>8} {:>8}", "Ontology", "Expected", "Classes", "Nodes", "Edges");
        println!("{}", "-".repeat(56));

        for (name, path_str, expected_min) in ontologies {
            let path = std::path::Path::new(path_str);
            if !path.exists() {
                println!("{:<12} {:>8} {:>8} SKIP", name, expected_min, "-");
                continue;
            }

            let data = if path.is_dir() {
                let mut combined = OntologyData::default();
                if let Ok(entries) = std::fs::read_dir(path) {
                    for entry in entries.flatten() {
                        let file_path = entry.path();
                        if let Some(ext) = file_path.extension().and_then(|e| e.to_str()) {
                            if ["ttl", "owl"].contains(&ext) {
                                if let Ok(d) = parse_ontology(&file_path) {
                                    combined.individuals.extend(d.individuals);
                                    combined.object_properties.extend(d.object_properties);
                                    combined.classes.extend(d.classes);
                                    combined.subclass_relations.extend(d.subclass_relations);
                                }
                            }
                        }
                    }
                }
                // Dedupe by IRI
                let mut seen = std::collections::HashSet::new();
                combined.classes.retain(|c| seen.insert(c.iri.clone()));
                combined
            } else {
                parse_ontology(path).unwrap()
            };

            let result = transform_to_nodus(&data, &TransformOptions {
                create_class_nodes: true,
                workspace_id: Some(format!("{}-workspace", name.to_lowercase())),
                ..Default::default()
            });

            let status = if data.classes.len() >= *expected_min { "OK" } else { "LOW" };
            println!("{:<12} {:>8} {:>8} {:>8} {:>8} {}",
                name, expected_min, data.classes.len(), result.nodes.len(), result.edges.len(), status);

            assert!(data.classes.len() >= *expected_min,
                "{}: Expected {} classes, got {}", name, expected_min, data.classes.len());
        }

        println!("\n{}", "=".repeat(56));
    }
}
