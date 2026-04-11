//! Data types for ontology import

use serde::{Deserialize, Serialize};

/// Parsed ontology data ready for transformation
#[derive(Debug, Clone, Default)]
pub struct OntologyData {
    /// Individual instances (owl:NamedIndividual or typed resources)
    pub individuals: Vec<OntologyIndividual>,
    /// Object properties (relationships between individuals)
    pub object_properties: Vec<ObjectProperty>,
    /// Class definitions (for optional class node creation)
    pub classes: Vec<OntologyClass>,
    /// Subclass relationships
    pub subclass_relations: Vec<SubclassRelation>,
    /// Property definitions (owl:ObjectProperty with domain/range)
    pub property_definitions: Vec<OntologyProperty>,
}

/// An OWL ObjectProperty definition with domain and range
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct OntologyProperty {
    /// Full IRI of the property
    pub iri: String,
    /// Human-readable label
    pub label: Option<String>,
    /// Description
    pub description: Option<String>,
    /// Domain class IRIs (what classes can have this property)
    pub domains: Vec<String>,
    /// Range class IRIs (what classes this property points to)
    pub ranges: Vec<String>,
}

/// An individual/instance in the ontology
#[derive(Debug, Clone)]
pub struct OntologyIndividual {
    /// Full IRI of the individual
    pub iri: String,
    /// Human-readable label (rdfs:label)
    pub label: Option<String>,
    /// Type/class IRI (rdf:type)
    pub class_iri: Option<String>,
    /// Data properties as (predicate_local_name, value) pairs
    pub data_properties: Vec<(String, String)>,
    /// Optional description (rdfs:comment, dc:description)
    pub description: Option<String>,
}

/// An object property relationship
#[derive(Debug, Clone)]
pub struct ObjectProperty {
    /// Subject IRI
    pub subject_iri: String,
    /// Predicate local name (used as link_type)
    pub predicate_local_name: String,
    /// Object IRI
    pub object_iri: String,
}

/// A class definition
#[derive(Debug, Clone)]
pub struct OntologyClass {
    /// Full IRI of the class
    pub iri: String,
    /// Human-readable label
    pub label: Option<String>,
    /// Description
    pub description: Option<String>,
    /// Property IRIs restricted on this class (from owl:Restriction)
    pub restricted_properties: Vec<String>,
}

/// A subclass relationship
#[derive(Debug, Clone)]
pub struct SubclassRelation {
    /// Subclass IRI
    pub subclass_iri: String,
    /// Superclass IRI
    pub superclass_iri: String,
}

/// Result of ontology import
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OntologyImportResult {
    /// Number of nodes created
    pub nodes_created: usize,
    /// Number of edges created
    pub edges_created: usize,
    /// Number of class nodes created (if enabled)
    pub class_nodes_created: usize,
    /// IDs of created nodes
    pub node_ids: Vec<String>,
}

/// Layout type for imported ontology
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OntologyLayout {
    /// Grid layout (default)
    #[default]
    Grid,
    /// Hierarchical/tree layout
    Hierarchical,
}

/// Supported ontology file formats
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OntologyFormat {
    Turtle,
    RdfXml,
    JsonLd,
}

impl OntologyFormat {
    /// Detect format from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "ttl" => Some(Self::Turtle),
            "rdf" | "owl" | "xml" => Some(Self::RdfXml),
            "jsonld" | "json" => Some(Self::JsonLd),
            _ => None,
        }
    }
}

/// Extract local name from IRI
pub fn local_name(iri: &str) -> String {
    // Try fragment first (#name)
    if let Some(pos) = iri.rfind('#') {
        return iri[pos + 1..].to_string();
    }
    // Try last path segment (/name)
    if let Some(pos) = iri.rfind('/') {
        return iri[pos + 1..].to_string();
    }
    // Fallback to full IRI
    iri.to_string()
}

/// Extract a short ID (CURIE) from IRI
/// Examples:
/// - `http://purl.org/ppeo/PPEO.owl#investigation` → `PPEO:investigation`
/// - `http://purl.obolibrary.org/obo/OBI_0000001` → `OBI:0000001`
/// - `http://www.w3.org/2002/07/owl#Class` → `owl:Class`
pub fn curie_from_iri(iri: &str) -> String {
    // Well-known prefixes
    let known_prefixes: &[(&str, &str)] = &[
        ("http://www.w3.org/2002/07/owl#", "owl"),
        ("http://www.w3.org/2000/01/rdf-schema#", "rdfs"),
        ("http://www.w3.org/1999/02/22-rdf-syntax-ns#", "rdf"),
        ("http://www.w3.org/2001/XMLSchema#", "xsd"),
        ("http://purl.org/dc/elements/1.1/", "dc"),
        ("http://purl.org/dc/terms/", "dcterms"),
        ("http://xmlns.com/foaf/0.1/", "foaf"),
        ("http://www.w3.org/2004/02/skos/core#", "skos"),
        ("http://schema.org/", "schema"),
        ("https://schema.org/", "schema"),
    ];

    // Check well-known prefixes first
    for (namespace, prefix) in known_prefixes {
        if let Some(local) = iri.strip_prefix(namespace) {
            return format!("{}:{}", prefix, local);
        }
    }

    // OBO Foundry pattern: http://purl.obolibrary.org/obo/PREFIX_ID
    if let Some(local) = iri.strip_prefix("http://purl.obolibrary.org/obo/") {
        if let Some(pos) = local.find('_') {
            let prefix = &local[..pos];
            let id = &local[pos + 1..];
            return format!("{}:{}", prefix, id);
        }
    }

    // Generic pattern: extract prefix from path before .owl# or just before #
    if let Some(hash_pos) = iri.rfind('#') {
        let namespace = &iri[..hash_pos];
        let local = &iri[hash_pos + 1..];

        // Try to extract prefix from namespace
        // Pattern: .../PREFIX.owl or .../PREFIX#
        if let Some(slash_pos) = namespace.rfind('/') {
            let filename = &namespace[slash_pos + 1..];
            // Remove .owl suffix if present
            let prefix = filename
                .strip_suffix(".owl")
                .or_else(|| filename.strip_suffix(".rdf"))
                .or_else(|| filename.strip_suffix(".ttl"))
                .unwrap_or(filename);

            if !prefix.is_empty() {
                return format!("{}:{}", prefix, local);
            }
        }
    }

    // Fallback: just use local name
    local_name(iri)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_name_fragment() {
        assert_eq!(local_name("http://example.org/ontology#Person"), "Person");
    }

    #[test]
    fn test_local_name_path() {
        assert_eq!(local_name("http://example.org/ontology/Person"), "Person");
    }

    #[test]
    fn test_format_detection() {
        assert_eq!(
            OntologyFormat::from_extension("ttl"),
            Some(OntologyFormat::Turtle)
        );
        assert_eq!(
            OntologyFormat::from_extension("rdf"),
            Some(OntologyFormat::RdfXml)
        );
        assert_eq!(
            OntologyFormat::from_extension("owl"),
            Some(OntologyFormat::RdfXml)
        );
        assert_eq!(
            OntologyFormat::from_extension("jsonld"),
            Some(OntologyFormat::JsonLd)
        );
        assert_eq!(OntologyFormat::from_extension("txt"), None);
    }

    #[test]
    fn test_curie_ppeo() {
        assert_eq!(
            curie_from_iri("http://purl.org/ppeo/PPEO.owl#investigation"),
            "PPEO:investigation"
        );
        assert_eq!(
            curie_from_iri("http://purl.org/ppeo/PPEO.owl#event"),
            "PPEO:event"
        );
    }

    #[test]
    fn test_curie_owl() {
        assert_eq!(
            curie_from_iri("http://www.w3.org/2002/07/owl#Class"),
            "owl:Class"
        );
        assert_eq!(
            curie_from_iri("http://www.w3.org/2000/01/rdf-schema#label"),
            "rdfs:label"
        );
    }

    #[test]
    fn test_curie_obo() {
        assert_eq!(
            curie_from_iri("http://purl.obolibrary.org/obo/OBI_0000001"),
            "OBI:0000001"
        );
        assert_eq!(
            curie_from_iri("http://purl.obolibrary.org/obo/GO_0008150"),
            "GO:0008150"
        );
    }
}
