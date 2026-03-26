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
}
