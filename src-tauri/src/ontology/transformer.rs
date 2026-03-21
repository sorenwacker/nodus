//! Transform ontology data to Nodus nodes and edges

use super::types::*;
use crate::database::edges::Edge;
use crate::database::nodes::Node;
use std::collections::HashMap;

/// Options for ontology transformation
pub struct TransformOptions {
    /// Create nodes for OWL classes
    pub create_class_nodes: bool,
    /// Create nodes for individuals/instances
    pub create_individual_nodes: bool,
    /// Workspace ID to assign to created nodes
    pub workspace_id: Option<String>,
    /// Starting X position for grid layout
    pub start_x: f64,
    /// Starting Y position for grid layout
    pub start_y: f64,
    /// Layout type
    pub layout: OntologyLayout,
}

impl Default for TransformOptions {
    fn default() -> Self {
        Self {
            create_class_nodes: true,
            create_individual_nodes: true,
            workspace_id: None,
            start_x: 100.0,
            start_y: 100.0,
            layout: OntologyLayout::Grid,
        }
    }
}

/// Result of transformation
pub struct TransformResult {
    pub nodes: Vec<Node>,
    pub edges: Vec<Edge>,
    pub class_nodes_created: usize,
}

/// Color palette for different classes (distinct, accessible colors)
const CLASS_COLORS: &[&str] = &[
    "#3b82f6", // Blue
    "#10b981", // Emerald
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#8b5cf6", // Violet
    "#ec4899", // Pink
    "#06b6d4", // Cyan
    "#84cc16", // Lime
    "#f97316", // Orange
    "#6366f1", // Indigo
];

/// Transform OntologyData to Nodus nodes and edges
pub fn transform_to_nodus(data: &OntologyData, options: &TransformOptions) -> TransformResult {
    let mut nodes = Vec::new();
    let mut edges = Vec::new();
    let mut iri_to_node_id: HashMap<String, String> = HashMap::new();
    // Track edge triples to avoid true duplicates: (source_id, target_id, link_type) -> exists
    let mut seen_edges: std::collections::HashSet<(String, String, String)> =
        std::collections::HashSet::new();
    let now = chrono::Utc::now().timestamp();

    // Grid layout parameters
    let cols = 5;
    let spacing = 250.0;

    // Build class-to-color mapping
    let mut class_colors: HashMap<String, String> = HashMap::new();
    let mut color_idx = 0;

    // First, collect all unique classes from individuals
    for individual in &data.individuals {
        if let Some(class_iri) = &individual.class_iri {
            if !class_colors.contains_key(class_iri) {
                class_colors.insert(
                    class_iri.clone(),
                    CLASS_COLORS[color_idx % CLASS_COLORS.len()].to_string(),
                );
                color_idx += 1;
            }
        }
    }

    // Create nodes for individuals (if enabled)
    if options.create_individual_nodes {
        for (idx, individual) in data.individuals.iter().enumerate() {
            let node_id = uuid::Uuid::new_v4().to_string();
            iri_to_node_id.insert(individual.iri.clone(), node_id.clone());

            let title = individual
                .label
                .clone()
                .unwrap_or_else(|| local_name(&individual.iri));

            let markdown_content = format_individual_content(individual);

            // Grid position
            let col = idx % cols;
            let row = idx / cols;
            let x = options.start_x + (col as f64) * spacing;
            let y = options.start_y + (row as f64) * spacing;

            // Derive node_type from class
            let node_type = individual
                .class_iri
                .as_ref()
                .map(|c| local_name(c).to_lowercase())
                .unwrap_or_else(|| "individual".to_string());

            // Get color based on class
            let color_theme = individual
                .class_iri
                .as_ref()
                .and_then(|c| class_colors.get(c).cloned());

            let node = Node {
                id: node_id,
                title,
                file_path: None,
                markdown_content: Some(markdown_content),
                node_type,
                canvas_x: x,
                canvas_y: y,
                width: 220.0,
                height: 160.0,
                z_index: 0,
                frame_id: None,
                color_theme,
                is_collapsed: false,
                tags: None,
                workspace_id: options.workspace_id.clone(),
                checksum: None,
                created_at: now,
                updated_at: now,
                deleted_at: None,
            };

            nodes.push(node);
        }
    }

    // Create nodes for classes (if enabled)
    let mut class_nodes_created = 0;
    if options.create_class_nodes {
        let class_start_idx = nodes.len();
        for (idx, class) in data.classes.iter().enumerate() {
            // Skip if already created as individual
            if iri_to_node_id.contains_key(&class.iri) {
                continue;
            }

            let node_id = uuid::Uuid::new_v4().to_string();
            iri_to_node_id.insert(class.iri.clone(), node_id.clone());

            let title = class
                .label
                .clone()
                .unwrap_or_else(|| local_name(&class.iri));

            let markdown_content = format_class_content(class);

            // Position after individuals
            let total_idx = class_start_idx + idx;
            let col = total_idx % cols;
            let row = total_idx / cols;
            let x = options.start_x + (col as f64) * spacing;
            let y = options.start_y + (row as f64) * spacing;

            let node = Node {
                id: node_id,
                title,
                file_path: None,
                markdown_content: Some(markdown_content),
                node_type: "class".to_string(),
                canvas_x: x,
                canvas_y: y,
                width: 200.0,
                height: 120.0,
                z_index: 0,
                frame_id: None,
                color_theme: Some("#9333ea".to_string()), // Purple for classes
                is_collapsed: false,
                tags: None,
                workspace_id: options.workspace_id.clone(),
                checksum: None,
                created_at: now,
                updated_at: now,
                deleted_at: None,
            };

            nodes.push(node);
            class_nodes_created += 1;
        }
    }

    // Create edges for object properties (deduplicate by source+target+type)
    for prop in &data.object_properties {
        let source_id = match iri_to_node_id.get(&prop.subject_iri) {
            Some(id) => id.clone(),
            None => continue, // Skip if subject not found
        };

        let target_id = match iri_to_node_id.get(&prop.object_iri) {
            Some(id) => id.clone(),
            None => continue, // Skip if object not found
        };

        // Skip self-loops
        if source_id == target_id {
            continue;
        }

        // Skip if we've already seen this exact edge
        let key = (
            source_id.clone(),
            target_id.clone(),
            prop.predicate_local_name.clone(),
        );
        if seen_edges.contains(&key) {
            continue;
        }
        seen_edges.insert(key);

        let edge = Edge {
            id: uuid::Uuid::new_v4().to_string(),
            source_node_id: source_id,
            target_node_id: target_id,
            label: Some(prop.predicate_local_name.clone()),
            link_type: prop.predicate_local_name.clone(),
            weight: 1.0,
            color: None,
            storyline_id: None,
            created_at: now,
        };
        edges.push(edge);
    }

    // Create edges for subclass relations (if class nodes enabled)
    if options.create_class_nodes {
        for rel in &data.subclass_relations {
            let source_id = match iri_to_node_id.get(&rel.subclass_iri) {
                Some(id) => id.clone(),
                None => continue,
            };

            let target_id = match iri_to_node_id.get(&rel.superclass_iri) {
                Some(id) => id.clone(),
                None => continue,
            };

            if source_id == target_id {
                continue;
            }

            let key = (
                source_id.clone(),
                target_id.clone(),
                "subClassOf".to_string(),
            );
            if seen_edges.contains(&key) {
                continue;
            }
            seen_edges.insert(key);

            let edge = Edge {
                id: uuid::Uuid::new_v4().to_string(),
                source_node_id: source_id,
                target_node_id: target_id,
                label: Some("subClassOf".to_string()),
                link_type: "subClassOf".to_string(),
                weight: 1.0,
                color: Some("#9333ea".to_string()), // Purple for class hierarchy
                storyline_id: None,
                created_at: now,
            };
            edges.push(edge);
        }

        // Create edges from property definitions (domain -> range)
        // This shows which properties connect which classes
        for prop in &data.property_definitions {
            let prop_name = prop.label.clone().unwrap_or_else(|| local_name(&prop.iri));

            // Create edge for each domain -> range pair
            for domain_iri in &prop.domains {
                for range_iri in &prop.ranges {
                    let source_id = match iri_to_node_id.get(domain_iri) {
                        Some(id) => id.clone(),
                        None => continue,
                    };

                    let target_id = match iri_to_node_id.get(range_iri) {
                        Some(id) => id.clone(),
                        None => continue,
                    };

                    if source_id == target_id {
                        continue;
                    }

                    let key = (source_id.clone(), target_id.clone(), prop_name.clone());
                    if seen_edges.contains(&key) {
                        continue;
                    }
                    seen_edges.insert(key);

                    let edge = Edge {
                        id: uuid::Uuid::new_v4().to_string(),
                        source_node_id: source_id,
                        target_node_id: target_id,
                        label: Some(prop_name.clone()),
                        link_type: prop_name.clone(),
                        weight: 1.0,
                        color: Some("#3b82f6".to_string()), // Blue for properties
                        storyline_id: None,
                        created_at: now,
                    };
                    edges.push(edge);
                }
            }
        }
    }

    // Create rdf:type edges (instance -> class)
    if options.create_class_nodes {
        for individual in &data.individuals {
            if let Some(class_iri) = &individual.class_iri {
                let source_id = match iri_to_node_id.get(&individual.iri) {
                    Some(id) => id.clone(),
                    None => continue,
                };

                let target_id = match iri_to_node_id.get(class_iri) {
                    Some(id) => id.clone(),
                    None => continue,
                };

                if source_id == target_id {
                    continue;
                }

                let key = (source_id.clone(), target_id.clone(), "type".to_string());
                if seen_edges.contains(&key) {
                    continue;
                }
                seen_edges.insert(key);

                let edge = Edge {
                    id: uuid::Uuid::new_v4().to_string(),
                    source_node_id: source_id,
                    target_node_id: target_id,
                    label: Some("type".to_string()),
                    link_type: "type".to_string(),
                    weight: 1.0,
                    color: Some("#6b7280".to_string()), // Gray for type edges
                    storyline_id: None,
                    created_at: now,
                };
                edges.push(edge);
            }
        }
    }

    // Apply hierarchical layout if requested
    if options.layout == OntologyLayout::Hierarchical {
        apply_hierarchical_layout(&mut nodes, &edges, options.start_x, options.start_y);
    }

    TransformResult {
        nodes,
        edges,
        class_nodes_created,
    }
}

/// Apply hierarchical layout to nodes based on edges
fn apply_hierarchical_layout(nodes: &mut [Node], edges: &[Edge], start_x: f64, start_y: f64) {
    use std::collections::{HashSet, VecDeque};

    if nodes.is_empty() {
        return;
    }

    let node_ids: HashSet<String> = nodes.iter().map(|n| n.id.clone()).collect();

    // Build adjacency: target -> sources (reverse for finding roots)
    let mut parents: HashMap<String, Vec<String>> = HashMap::new();
    let mut children: HashMap<String, Vec<String>> = HashMap::new();

    for node in nodes.iter() {
        parents.insert(node.id.clone(), Vec::new());
        children.insert(node.id.clone(), Vec::new());
    }

    for edge in edges {
        if node_ids.contains(&edge.source_node_id) && node_ids.contains(&edge.target_node_id) {
            children
                .get_mut(&edge.source_node_id)
                .unwrap()
                .push(edge.target_node_id.clone());
            parents
                .get_mut(&edge.target_node_id)
                .unwrap()
                .push(edge.source_node_id.clone());
        }
    }

    // Find roots (nodes with no parents)
    let roots: Vec<String> = nodes
        .iter()
        .filter(|n| parents.get(&n.id).map_or(true, |p| p.is_empty()))
        .map(|n| n.id.clone())
        .collect();

    // Assign layers using BFS
    let mut layers: HashMap<String, usize> = HashMap::new();
    let mut queue: VecDeque<(String, usize)> = VecDeque::new();

    for root in &roots {
        queue.push_back((root.clone(), 0));
    }

    while let Some((id, layer)) = queue.pop_front() {
        if layers.contains_key(&id) {
            // Update to deeper layer if found via longer path
            if layer > *layers.get(&id).unwrap() {
                layers.insert(id.clone(), layer);
            } else {
                continue;
            }
        } else {
            layers.insert(id.clone(), layer);
        }

        for child in children.get(&id).unwrap_or(&Vec::new()) {
            queue.push_back((child.clone(), layer + 1));
        }
    }

    // Assign disconnected nodes to layer 0
    for node in nodes.iter() {
        if !layers.contains_key(&node.id) {
            layers.insert(node.id.clone(), 0);
        }
    }

    // Group nodes by layer
    let mut layer_groups: HashMap<usize, Vec<String>> = HashMap::new();
    for (id, layer) in &layers {
        layer_groups.entry(*layer).or_default().push(id.clone());
    }

    // Sort layers and position nodes
    let mut sorted_layers: Vec<usize> = layer_groups.keys().copied().collect();
    sorted_layers.sort();

    let node_spacing_x = 280.0;
    let node_spacing_y = 200.0;

    // Position nodes within each layer
    for layer in &sorted_layers {
        let layer = *layer;
        let node_ids_in_layer = layer_groups.get(&layer).unwrap();
        let layer_width = node_ids_in_layer.len() as f64 * node_spacing_x;
        let layer_start_x = start_x - layer_width / 2.0 + node_spacing_x / 2.0;

        for (idx, node_id) in node_ids_in_layer.iter().enumerate() {
            if let Some(node) = nodes.iter_mut().find(|n| &n.id == node_id) {
                node.canvas_x = layer_start_x + idx as f64 * node_spacing_x;
                node.canvas_y = start_y + layer as f64 * node_spacing_y;
            }
        }
    }

    // Second pass: center children under parents
    for _pass in 0..2 {
        for layer in 1..=sorted_layers.iter().max().copied().unwrap_or(0) {
            let node_ids_in_layer = match layer_groups.get(&layer) {
                Some(ids) => ids.clone(),
                None => continue,
            };

            for node_id in &node_ids_in_layer {
                let node_parents = parents.get(node_id).unwrap();
                if !node_parents.is_empty() {
                    let avg_parent_x: f64 = node_parents
                        .iter()
                        .filter_map(|pid| nodes.iter().find(|n| &n.id == pid))
                        .map(|n| n.canvas_x)
                        .sum::<f64>()
                        / node_parents.len() as f64;

                    if let Some(node) = nodes.iter_mut().find(|n| &n.id == node_id) {
                        node.canvas_x = avg_parent_x;
                    }
                }
            }

            // Resolve overlaps within layer
            let mut layer_nodes: Vec<(String, f64, f64)> = node_ids_in_layer
                .iter()
                .filter_map(|id| {
                    nodes
                        .iter()
                        .find(|n| &n.id == id)
                        .map(|n| (id.clone(), n.canvas_x, n.width))
                })
                .collect();
            layer_nodes.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap());

            for i in 1..layer_nodes.len() {
                let (_prev_id, prev_x, prev_width) = &layer_nodes[i - 1];
                let (curr_id, curr_x, _) = &layer_nodes[i];
                let min_x = prev_x + prev_width + 50.0;

                if *curr_x < min_x {
                    if let Some(node) = nodes.iter_mut().find(|n| &n.id == curr_id) {
                        node.canvas_x = min_x;
                        layer_nodes[i].1 = min_x;
                    }
                }
            }
        }
    }
}

/// Format markdown content for an individual
fn format_individual_content(individual: &OntologyIndividual) -> String {
    let mut content = String::new();

    // Title with type if available
    if let Some(class_iri) = &individual.class_iri {
        let class_name = local_name(class_iri);
        content.push_str(&format!(
            "# {}: {}\n\n",
            class_name,
            individual.label.as_deref().unwrap_or("(unnamed)")
        ));
    } else {
        content.push_str(&format!(
            "# {}\n\n",
            individual.label.as_deref().unwrap_or("(unnamed)")
        ));
    }

    // Description if available
    if let Some(desc) = &individual.description {
        content.push_str(desc);
        content.push_str("\n\n");
    }

    // Data properties as table
    if !individual.data_properties.is_empty() {
        content.push_str("| Property | Value |\n");
        content.push_str("|----------|-------|\n");
        for (prop, value) in &individual.data_properties {
            // Escape pipe characters in values
            let escaped_value = value.replace('|', "\\|");
            content.push_str(&format!("| {} | {} |\n", prop, escaped_value));
        }
        content.push('\n');
    }

    // Metadata footer
    if let Some(class_iri) = &individual.class_iri {
        content.push_str(&format!("**Type:** {}\n", local_name(class_iri)));
    }
    content.push_str(&format!("**URI:** {}\n", individual.iri));

    content
}

/// Format markdown content for a class
fn format_class_content(class: &OntologyClass) -> String {
    let mut content = String::new();

    content.push_str(&format!(
        "# Class: {}\n\n",
        class.label.as_deref().unwrap_or(&local_name(&class.iri))
    ));

    if let Some(desc) = &class.description {
        content.push_str(desc);
        content.push_str("\n\n");
    }

    content.push_str(&format!("**URI:** {}\n", class.iri));

    content
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transform_individuals() {
        let data = OntologyData {
            individuals: vec![
                OntologyIndividual {
                    iri: "http://example.org/john".to_string(),
                    label: Some("John Doe".to_string()),
                    class_iri: Some("http://example.org/Person".to_string()),
                    data_properties: vec![("age".to_string(), "42".to_string())],
                    description: None,
                },
                OntologyIndividual {
                    iri: "http://example.org/jane".to_string(),
                    label: Some("Jane Smith".to_string()),
                    class_iri: Some("http://example.org/Person".to_string()),
                    data_properties: vec![],
                    description: None,
                },
            ],
            object_properties: vec![ObjectProperty {
                subject_iri: "http://example.org/john".to_string(),
                predicate_local_name: "knows".to_string(),
                object_iri: "http://example.org/jane".to_string(),
            }],
            classes: vec![],
            subclass_relations: vec![],
            property_definitions: vec![],
        };

        let result = transform_to_nodus(&data, &TransformOptions::default());

        assert_eq!(result.nodes.len(), 2);
        assert_eq!(result.edges.len(), 1);

        let john_node = result.nodes.iter().find(|n| n.title == "John Doe").unwrap();
        assert_eq!(john_node.node_type, "person");
        assert!(john_node
            .markdown_content
            .as_ref()
            .unwrap()
            .contains("| age | 42 |"));

        let edge = &result.edges[0];
        assert_eq!(edge.link_type, "knows");
    }

    #[test]
    fn test_transform_ppeo_with_classes() {
        use crate::ontology::parse_ontology;

        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/PPEO/PPEO.owl");
        if !path.exists() {
            return;
        }

        let data = parse_ontology(path).unwrap();

        // Classes only (no individuals) - this is the default now
        let result_classes_only = transform_to_nodus(
            &data,
            &TransformOptions {
                create_class_nodes: true,
                create_individual_nodes: false,
                ..Default::default()
            },
        );
        assert_eq!(
            result_classes_only.nodes.len(),
            31,
            "Should have 31 class nodes only"
        );
        assert_eq!(result_classes_only.class_nodes_created, 31);

        // Both classes and individuals
        let result_both = transform_to_nodus(
            &data,
            &TransformOptions {
                create_class_nodes: true,
                create_individual_nodes: true,
                ..Default::default()
            },
        );
        assert_eq!(
            result_both.nodes.len(),
            42,
            "Should have 31 classes + 11 individuals"
        );

        // Individuals only
        let result_individuals = transform_to_nodus(
            &data,
            &TransformOptions {
                create_class_nodes: false,
                create_individual_nodes: true,
                ..Default::default()
            },
        );
        assert_eq!(
            result_individuals.nodes.len(),
            11,
            "Should have 11 individuals only"
        );
    }

    #[test]
    fn test_miappe_properties() {
        use crate::ontology::parse_ontology;

        let path = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/PPEO/PPEO.owl");
        if !path.exists() {
            println!("PPEO.owl not found, skipping");
            return;
        }

        let data = parse_ontology(path).unwrap();

        println!("\n=== MIAPPE Property Definitions ===");
        println!(
            "Total property_definitions: {}",
            data.property_definitions.len()
        );

        for prop in &data.property_definitions {
            println!("\nProperty: {}", prop.iri);
            if let Some(label) = &prop.label {
                println!("  Label: {}", label);
            }
            println!("  Domains: {:?}", prop.domains);
            println!("  Ranges: {:?}", prop.ranges);
        }

        // Transform and check edges
        let result = transform_to_nodus(
            &data,
            &TransformOptions {
                create_class_nodes: true,
                create_individual_nodes: false,
                ..Default::default()
            },
        );

        println!("\n=== Edges Created ===");
        println!("Total edges: {}", result.edges.len());

        // Build node ID to title map
        let id_to_title: std::collections::HashMap<String, String> = result
            .nodes
            .iter()
            .map(|n| (n.id.clone(), n.title.clone()))
            .collect();

        for edge in &result.edges {
            let src = id_to_title
                .get(&edge.source_node_id)
                .cloned()
                .unwrap_or_else(|| edge.source_node_id.clone());
            let tgt = id_to_title
                .get(&edge.target_node_id)
                .cloned()
                .unwrap_or_else(|| edge.target_node_id.clone());
            println!(
                "  {} --[{}]--> {}",
                src,
                edge.label.as_deref().unwrap_or("?"),
                tgt
            );
        }

        // Check for duplicate node pairs with different edge types
        let mut edge_pairs: std::collections::HashMap<(String, String), Vec<String>> =
            std::collections::HashMap::new();
        for edge in &result.edges {
            edge_pairs
                .entry((edge.source_node_id.clone(), edge.target_node_id.clone()))
                .or_default()
                .push(edge.label.clone().unwrap_or_default());
        }

        println!("\n=== Multi-edge pairs ===");
        for ((src, tgt), types) in &edge_pairs {
            if types.len() > 1 {
                let src_name = id_to_title.get(src).cloned().unwrap_or_else(|| src.clone());
                let tgt_name = id_to_title.get(tgt).cloned().unwrap_or_else(|| tgt.clone());
                println!("  {} -> {}: {:?}", src_name, tgt_name, types);
            }
        }
    }

    #[test]
    fn test_sosa_properties() {
        use crate::ontology::parse_ontology;

        let dir = std::path::Path::new("/Users/sdrwacker/workspace/ontologies/SOSA-SSN");
        if !dir.exists() {
            println!("SOSA-SSN not found, skipping");
            return;
        }

        // Parse all TTL files
        let mut combined = OntologyData::default();
        for entry in std::fs::read_dir(dir).unwrap() {
            let entry = entry.unwrap();
            let path = entry.path();
            if path.extension().map_or(false, |e| e == "ttl") {
                if let Ok(data) = parse_ontology(&path) {
                    combined.individuals.extend(data.individuals);
                    combined.object_properties.extend(data.object_properties);
                    combined.classes.extend(data.classes);
                    combined.subclass_relations.extend(data.subclass_relations);
                    combined
                        .property_definitions
                        .extend(data.property_definitions);
                }
            }
        }

        println!("\n=== SOSA Property Definitions ===");
        println!(
            "Total property_definitions: {}",
            combined.property_definitions.len()
        );

        for prop in &combined.property_definitions {
            if !prop.domains.is_empty() && !prop.ranges.is_empty() {
                println!("\nProperty: {}", prop.iri);
                if let Some(label) = &prop.label {
                    println!("  Label: {}", label);
                }
                println!("  Domains: {:?}", prop.domains);
                println!("  Ranges: {:?}", prop.ranges);
            }
        }

        // Dedupe classes
        let mut seen = std::collections::HashSet::new();
        combined.classes.retain(|c| seen.insert(c.iri.clone()));

        // Transform and check edges
        let result = transform_to_nodus(
            &combined,
            &TransformOptions {
                create_class_nodes: true,
                create_individual_nodes: false,
                ..Default::default()
            },
        );

        println!("\n=== Edges Created ===");
        println!("Total edges: {}", result.edges.len());

        let id_to_title: std::collections::HashMap<String, String> = result
            .nodes
            .iter()
            .map(|n| (n.id.clone(), n.title.clone()))
            .collect();

        for edge in &result.edges {
            let src = id_to_title
                .get(&edge.source_node_id)
                .cloned()
                .unwrap_or_else(|| edge.source_node_id.clone());
            let tgt = id_to_title
                .get(&edge.target_node_id)
                .cloned()
                .unwrap_or_else(|| edge.target_node_id.clone());
            println!(
                "  {} --[{}]--> {}",
                src,
                edge.label.as_deref().unwrap_or("?"),
                tgt
            );
        }
    }
}
