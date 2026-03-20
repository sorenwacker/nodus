//! Ontology import module for RDF/OWL files
//!
//! Supports parsing and importing:
//! - Turtle (.ttl)
//! - RDF/XML (.rdf, .owl)
//! - JSON-LD (.jsonld) - basic support

pub mod parser;
pub mod transformer;
pub mod types;

pub use parser::parse_ontology;
pub use transformer::transform_to_nodus;
pub use types::*;
