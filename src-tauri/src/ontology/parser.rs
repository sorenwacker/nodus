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
#[allow(dead_code)] // Used for documentation, matching done via blank nodes
const OWL_RESTRICTION: &str = "http://www.w3.org/2002/07/owl#Restriction";
const OWL_ON_PROPERTY: &str = "http://www.w3.org/2002/07/owl#onProperty";
const OWL_SOME_VALUES_FROM: &str = "http://www.w3.org/2002/07/owl#someValuesFrom";
const OWL_UNION_OF: &str = "http://www.w3.org/2002/07/owl#unionOf";
const RDF_FIRST: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#first";
const RDF_REST: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#rest";
const RDF_NIL: &str = "http://www.w3.org/1999/02/22-rdf-syntax-ns#nil";
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
    /// Blank nodes representing owl:Restriction - maps blank node ID to property IRI
    restriction_properties: RefCell<HashMap<String, String>>,
    /// Blank nodes representing owl:Restriction - maps blank node ID to someValuesFrom class IRI
    restriction_values: RefCell<HashMap<String, String>>,
    /// Class to blank node restriction mappings (class IRI -> restriction blank node IDs)
    class_restrictions: RefCell<HashMap<String, Vec<String>>>,
    /// Property to blank node domain mappings (for union domains)
    property_blank_domains: RefCell<HashMap<String, String>>,
    /// Blank node owl:unionOf mappings (blank node -> list node)
    union_of_lists: RefCell<HashMap<String, String>>,
    /// RDF list first elements (list node -> IRI)
    rdf_list_first: RefCell<HashMap<String, String>>,
    /// RDF list rest pointers (list node -> next list node or rdf:nil)
    rdf_list_rest: RefCell<HashMap<String, String>>,
}

/// Intermediate structure for collecting property definition info
#[derive(Default)]
struct PropertyDefinition {
    label: Option<String>,
    /// Language tag of current label - for preferring English
    label_lang: Option<String>,
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
            restriction_properties: RefCell::new(HashMap::new()),
            restriction_values: RefCell::new(HashMap::new()),
            class_restrictions: RefCell::new(HashMap::new()),
            property_blank_domains: RefCell::new(HashMap::new()),
            union_of_lists: RefCell::new(HashMap::new()),
            rdf_list_first: RefCell::new(HashMap::new()),
            rdf_list_rest: RefCell::new(HashMap::new()),
        }
    }

    fn process_triple(&self, triple: Triple) {
        let predicate_iri = triple.predicate.iri.to_string();

        // Handle blank node subjects (for owl:Restriction)
        let (subject_iri, is_blank_subject) = match &triple.subject {
            Subject::NamedNode(NamedNode { iri }) => (iri.to_string(), false),
            Subject::BlankNode(bn) => (format!("_:{}", bn.id), true),
            _ => return,
        };

        match &triple.object {
            Term::NamedNode(NamedNode { iri: obj_iri }) => {
                let obj_iri = obj_iri.to_string();

                // Handle blank node as subject
                if is_blank_subject {
                    // Track owl:onProperty for restrictions
                    if predicate_iri == OWL_ON_PROPERTY {
                        self.restriction_properties
                            .borrow_mut()
                            .insert(subject_iri.clone(), obj_iri.clone());
                    }
                    // Track owl:someValuesFrom for restrictions
                    if predicate_iri == OWL_SOME_VALUES_FROM {
                        self.restriction_values
                            .borrow_mut()
                            .insert(subject_iri.clone(), obj_iri.clone());
                    }
                    // Track rdf:first for list parsing
                    if predicate_iri == RDF_FIRST {
                        self.rdf_list_first
                            .borrow_mut()
                            .insert(subject_iri.clone(), obj_iri.clone());
                    }
                    // Track rdf:rest for list parsing (named node case like rdf:nil)
                    if predicate_iri == RDF_REST {
                        self.rdf_list_rest
                            .borrow_mut()
                            .insert(subject_iri.clone(), obj_iri);
                    }
                    return;
                }

                if predicate_iri == RDF_TYPE {
                    // Track type
                    let mut subjects = self.subjects.borrow_mut();
                    let data = subjects.entry(subject_iri.clone()).or_default();
                    data.types.push(obj_iri.clone());

                    // If it's a class definition, track it (owl:Class or rdfs:Class)
                    if obj_iri == OWL_CLASS || obj_iri == RDFS_CLASS {
                        let mut classes = self.classes.borrow_mut();
                        classes
                            .entry(subject_iri.clone())
                            .or_insert_with(|| OntologyClass {
                                iri: subject_iri.clone(),
                                label: None,
                                description: None,
                                restricted_properties: Vec::new(),
                            });
                    }

                    // If it's an ObjectProperty or DatatypeProperty definition, track it
                    if obj_iri == OWL_OBJECT_PROPERTY || obj_iri == OWL_DATATYPE_PROPERTY {
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
                // Extract value and optional language tag
                let (value, lang_tag) = match lit {
                    Literal::Simple { value } => (value.to_string(), None),
                    Literal::LanguageTaggedString { value, language } => {
                        (value.to_string(), Some(language.to_string()))
                    }
                    Literal::Typed { value, .. } => (value.to_string(), None),
                };

                let mut subjects = self.subjects.borrow_mut();
                let data = subjects.entry(subject_iri.clone()).or_default();

                if predicate_iri == RDFS_LABEL || predicate_iri == SKOS_PREF_LABEL {
                    // Prefer English labels over other languages
                    // Priority: no tag/en > other languages
                    let is_english = lang_tag.is_none()
                        || lang_tag.as_deref() == Some("en")
                        || lang_tag
                            .as_ref()
                            .map(|t| t.starts_with("en-"))
                            .unwrap_or(false);

                    let current_is_english = data.label_lang.is_none()
                        || data.label_lang.as_deref() == Some("en")
                        || data
                            .label_lang
                            .as_ref()
                            .map(|t| t.starts_with("en-"))
                            .unwrap_or(false);

                    // Update label if:
                    // 1. No label exists yet, OR
                    // 2. New label is English and current is not
                    if data.label.is_none() || (is_english && !current_is_english) {
                        data.label = Some(value.clone());
                        data.label_lang = lang_tag.clone();
                    }
                } else if predicate_iri == RDFS_COMMENT
                    || predicate_iri == DC_DESCRIPTION
                    || predicate_iri == DC_TERMS_DESCRIPTION
                {
                    // Prefer English descriptions over other languages
                    let desc_is_english = lang_tag.is_none()
                        || lang_tag.as_deref() == Some("en")
                        || lang_tag
                            .as_ref()
                            .map(|t| t.starts_with("en-"))
                            .unwrap_or(false);

                    let current_desc_is_english = data.description_lang.is_none()
                        || data.description_lang.as_deref() == Some("en")
                        || data
                            .description_lang
                            .as_ref()
                            .map(|t| t.starts_with("en-"))
                            .unwrap_or(false);

                    if data.description.is_none() || (desc_is_english && !current_desc_is_english) {
                        data.description = Some(value);
                        data.description_lang = lang_tag.clone();
                    }
                } else if !EXCLUDED_PREDICATES.contains(&predicate_iri.as_str()) {
                    // Data property
                    data.data_properties
                        .push((local_name(&predicate_iri), value));
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
                        // Check if data has a better (more English) label than prop
                        let data_is_english = data.label_lang.is_none()
                            || data.label_lang.as_deref() == Some("en")
                            || data
                                .label_lang
                                .as_ref()
                                .map(|t| t.starts_with("en-"))
                                .unwrap_or(false);

                        let prop_is_english = prop.label_lang.is_none()
                            || prop.label_lang.as_deref() == Some("en")
                            || prop
                                .label_lang
                                .as_ref()
                                .map(|t| t.starts_with("en-"))
                                .unwrap_or(false);

                        // Update if no label yet, or if data has English and prop does not
                        if prop.label.is_none() || (data_is_english && !prop_is_english) {
                            prop.label = data.label.clone();
                            prop.label_lang = data.label_lang.clone();
                        }
                    }
                    if predicate_iri == RDFS_COMMENT {
                        prop.description = data.description.clone();
                    }
                }
            }
            Term::BlankNode(bn) => {
                let bn_id = format!("_:{}", bn.id);

                // Handle blank node objects (e.g., rdfs:subClassOf pointing to owl:Restriction)
                if predicate_iri == RDFS_SUBCLASS_OF && !is_blank_subject {
                    self.class_restrictions
                        .borrow_mut()
                        .entry(subject_iri.clone())
                        .or_default()
                        .push(bn_id.clone());
                }

                // Track rdfs:domain pointing to blank node (union class)
                if predicate_iri == RDFS_DOMAIN && !is_blank_subject {
                    self.property_blank_domains
                        .borrow_mut()
                        .insert(subject_iri.clone(), bn_id.clone());
                }

                // Track owl:unionOf from blank node to list
                if predicate_iri == OWL_UNION_OF && is_blank_subject {
                    self.union_of_lists
                        .borrow_mut()
                        .insert(subject_iri.clone(), bn_id.clone());
                }

                // Track rdf:rest pointing to another blank node (list continuation)
                if predicate_iri == RDF_REST && is_blank_subject {
                    self.rdf_list_rest
                        .borrow_mut()
                        .insert(subject_iri.clone(), bn_id);
                }
            }
            _ => {}
        }
    }

    fn into_ontology_data(self) -> OntologyData {
        let subjects = self.subjects.into_inner();
        let mut classes = self.classes.into_inner();
        let mut prop_defs = self.property_definitions.into_inner();
        let restriction_properties = self.restriction_properties.into_inner();
        let restriction_values = self.restriction_values.into_inner();
        let class_restrictions = self.class_restrictions.into_inner();
        let mut object_properties = self.object_properties.into_inner();
        let property_blank_domains = self.property_blank_domains.into_inner();
        let union_of_lists = self.union_of_lists.into_inner();
        let rdf_list_first = self.rdf_list_first.into_inner();
        let rdf_list_rest = self.rdf_list_rest.into_inner();

        // Resolve union domains for properties
        for (prop_iri, blank_domain_id) in &property_blank_domains {
            // Check if this blank node has an owl:unionOf
            if let Some(list_id) = union_of_lists.get(blank_domain_id) {
                // Traverse the RDF list to get all union members
                let mut current = list_id.clone();
                let mut iterations = 0;
                while iterations < 100 {
                    // Safety limit
                    iterations += 1;
                    // Get the first element of the current list node
                    if let Some(class_iri) = rdf_list_first.get(&current) {
                        if let Some(prop) = prop_defs.get_mut(prop_iri) {
                            if !prop.domains.contains(class_iri) {
                                prop.domains.push(class_iri.clone());
                            }
                        }
                    }
                    // Move to rest of list
                    if let Some(rest_id) = rdf_list_rest.get(&current) {
                        if rest_id == RDF_NIL {
                            break;
                        }
                        current = rest_id.clone();
                    } else {
                        break;
                    }
                }
            }
        }

        // Connect class restrictions to their properties and create object property edges
        for (class_iri, restriction_ids) in &class_restrictions {
            if let Some(class) = classes.get_mut(class_iri) {
                for restriction_id in restriction_ids {
                    if let Some(prop_iri) = restriction_properties.get(restriction_id) {
                        if !class.restricted_properties.contains(prop_iri) {
                            class.restricted_properties.push(prop_iri.clone());
                        }

                        // If this restriction also has someValuesFrom, create an object property edge
                        if let Some(value_class_iri) = restriction_values.get(restriction_id) {
                            object_properties.push(ObjectProperty {
                                subject_iri: class_iri.clone(),
                                predicate_local_name: local_name(prop_iri),
                                object_iri: value_class_iri.clone(),
                            });
                        }
                    }
                }
            }
        }

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
            object_properties,
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
    /// Language tag of current label (e.g., "en", "zh") - None means no tag or English
    label_lang: Option<String>,
    description: Option<String>,
    /// Language tag of current description
    description_lang: Option<String>,
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
            Some(serde_json::Value::Array(arr)) => arr
                .iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect(),
            _ => Vec::new(),
        };

        // Check if it's a class
        if types.contains(&OWL_CLASS.to_string()) || types.contains(&"owl:Class".to_string()) {
            classes.push(OntologyClass {
                iri: id.clone(),
                label: get_json_label(obj),
                description: get_json_description(obj),
                restricted_properties: Vec::new(), // JSON-LD doesn't parse restrictions yet
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
        assert_eq!(
            john.data_properties[0],
            ("age".to_string(), "42".to_string())
        );
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
        assert!(
            result.classes.len() >= 20,
            "Expected ~21 classes, got {}",
            result.classes.len()
        );
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
        let unique: std::collections::HashSet<String> =
            combined.classes.iter().map(|c| c.iri.clone()).collect();
        // README says 19 classes but SOSA+SSN together may have more
        assert!(
            unique.len() >= 19,
            "Expected ~19 classes, got {}",
            unique.len()
        );
    }

    #[test]
    fn test_parse_oeso() {
        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/OESO/oeso.owl");
        if !path.exists() {
            return;
        }

        let result = parse_ontology(path).unwrap();
        // README says 120 classes
        assert!(
            result.classes.len() >= 100,
            "Expected ~120 classes, got {}",
            result.classes.len()
        );
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

        let unique: std::collections::HashSet<String> =
            combined.classes.iter().map(|c| c.iri.clone()).collect();
        // README says 291 classes
        assert!(
            unique.len() >= 250,
            "Expected ~291 classes, got {}",
            unique.len()
        );
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
        assert!(
            result.classes.len() >= 5000,
            "Expected ~5074 classes, got {}",
            result.classes.len()
        );
    }

    #[test]
    fn test_all_ontologies_summary() {
        use crate::ontology::{
            transform_to_nodus, transformer::TransformOptions, types::OntologyData,
        };

        // Expected class counts from README.md
        let ontologies: &[(&str, &str, usize)] = &[
            (
                "PPEO",
                "/Users/sdrwacker/workspace/ontologies/PPEO/PPEO.owl",
                31,
            ),
            (
                "PROV-O",
                "/Users/sdrwacker/workspace/ontologies/PROV-O/prov-o.ttl",
                21,
            ),
            (
                "OESO",
                "/Users/sdrwacker/workspace/ontologies/OESO/oeso.owl",
                120,
            ),
            (
                "SOSA-SSN",
                "/Users/sdrwacker/workspace/ontologies/SOSA-SSN",
                19,
            ),
            ("OBOE", "/Users/sdrwacker/workspace/ontologies/OBOE", 291),
        ];

        println!("\n=== Ontology Import Validation ===\n");
        println!(
            "{:<12} {:>8} {:>8} {:>8} {:>8}",
            "Ontology", "Expected", "Classes", "Nodes", "Edges"
        );
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

            let result = transform_to_nodus(
                &data,
                &TransformOptions {
                    create_class_nodes: true,
                    workspace_id: Some(format!("{}-workspace", name.to_lowercase())),
                    ..Default::default()
                },
            );

            let status = if data.classes.len() >= *expected_min {
                "OK"
            } else {
                "LOW"
            };
            println!(
                "{:<12} {:>8} {:>8} {:>8} {:>8} {}",
                name,
                expected_min,
                data.classes.len(),
                result.nodes.len(),
                result.edges.len(),
                status
            );

            assert!(
                data.classes.len() >= *expected_min,
                "{}: Expected {} classes, got {}",
                name,
                expected_min,
                data.classes.len()
            );
        }

        println!("\n{}", "=".repeat(56));
    }
}
