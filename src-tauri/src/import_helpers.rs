//! Import helper functions for vault import operations
//!
//! Extracted from commands.rs to reduce function complexity.

use crate::database::{self, edges::Edge, nodes::Node, DbPool};
use crate::layout_config;
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};

/// Collected markdown file with its folder path
pub struct MarkdownFile {
    pub path: PathBuf,
    pub folder: String,
}

/// Collect all markdown files from a vault directory
/// Returns files and a map of folders to their file counts
pub fn collect_markdown_files(vault_path: &Path) -> (Vec<MarkdownFile>, HashMap<String, usize>) {
    let mut files = Vec::new();
    let mut folder_counts: HashMap<String, usize> = HashMap::new();

    for entry in walkdir::WalkDir::new(vault_path)
        .follow_links(true)
        .into_iter()
        .filter_entry(|e| {
            // Skip all hidden files and directories (starting with .)
            let name = e.file_name().to_string_lossy();
            !name.starts_with('.')
        })
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "md") {
            let folder = get_relative_folder(file_path, vault_path).unwrap_or_default();
            println!(
                "  Found: {:?} in folder: '{}'",
                file_path.file_name(),
                folder
            );

            files.push(MarkdownFile {
                path: file_path.to_path_buf(),
                folder: folder.clone(),
            });

            // Track folder for frame creation
            *folder_counts.entry(folder).or_insert(0) += 1;
        }
    }

    println!(
        "Total files found: {}, folders: {:?}",
        files.len(),
        folder_counts.keys().collect::<Vec<_>>()
    );

    (files, folder_counts)
}

/// Get relative folder path from vault root (empty string for root)
fn get_relative_folder(file_path: &Path, vault_root: &Path) -> Option<String> {
    file_path.parent().and_then(|parent| {
        parent
            .strip_prefix(vault_root)
            .ok()
            .map(|rel| rel.to_string_lossy().to_string())
    })
}

/// Calculate node position based on whether it's in a frame or at root level
pub fn calculate_node_position(
    folder: &str,
    node_index: usize,
    root_node_count: usize,
    folder_frames: &HashMap<String, (String, usize)>,
    in_frame: bool,
) -> (f64, f64) {
    if in_frame {
        // Position within frame
        let (frame_x, frame_y) = if let Some(fi) = folder_frames.keys().position(|k| k == folder) {
            let fx = (fi % layout_config::FRAME_COLS) as f64 * layout_config::FRAME_SPACING
                + layout_config::FRAME_ORIGIN;
            let fy = (fi / layout_config::FRAME_COLS) as f64 * layout_config::FRAME_SPACING
                + layout_config::FRAME_ORIGIN;
            (fx, fy)
        } else {
            (layout_config::FRAME_ORIGIN, layout_config::FRAME_ORIGIN)
        };

        let x = frame_x
            + layout_config::FRAME_NODE_X_OFFSET
            + (node_index % layout_config::FRAME_NODE_COLS) as f64
                * layout_config::FRAME_NODE_SPACING;
        let y = frame_y
            + layout_config::FRAME_NODE_Y_OFFSET
            + (node_index / layout_config::FRAME_NODE_COLS) as f64
                * layout_config::FRAME_NODE_ROW_HEIGHT;
        (x, y)
    } else {
        // Root folder nodes - grid layout
        let x = (root_node_count % layout_config::ROOT_NODE_COLS) as f64
            * layout_config::ROOT_NODE_SPACING
            + layout_config::ROOT_NODE_ORIGIN;
        let y = (root_node_count / layout_config::ROOT_NODE_COLS) as f64
            * layout_config::ROOT_NODE_SPACING
            + layout_config::ROOT_NODE_ORIGIN;
        (x, y)
    }
}

/// Create edges for wikilinks between nodes
/// Returns the number of edges created
pub async fn create_wikilink_edges(
    pool: &'static DbPool,
    node_links: Vec<(String, Vec<String>)>,
    title_to_id: &HashMap<String, String>,
) -> Result<usize, String> {
    let now = chrono::Utc::now().timestamp();
    let mut edge_count = 0;
    let mut seen_edges: HashSet<(String, String)> = HashSet::new();

    for (source_id, links) in node_links {
        let unique_links: HashSet<String> = links.into_iter().map(|l| l.to_lowercase()).collect();

        for link in unique_links {
            if let Some(target_id) = title_to_id.get(&link) {
                if source_id != *target_id {
                    let edge_key = (source_id.clone(), target_id.clone());
                    if seen_edges.contains(&edge_key) {
                        continue;
                    }
                    seen_edges.insert(edge_key);

                    let edge = Edge {
                        id: uuid::Uuid::new_v4().to_string(),
                        source_node_id: source_id.clone(),
                        target_node_id: target_id.clone(),
                        label: None,
                        link_type: "wikilink".to_string(),
                        weight: 1.0,
                        color: None,
                        storyline_id: None,
                        created_at: now,
                    };

                    if database::edges::create(pool, &edge).await.is_ok() {
                        edge_count += 1;
                    }
                }
            }
        }
    }

    Ok(edge_count)
}

/// Extract wikilinks from markdown content
pub fn extract_wikilinks(content: &str) -> Vec<String> {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

/// Create a node from file data
pub fn create_node_data(
    node_id: String,
    title: String,
    content: String,
    file_path_str: Option<String>,
    checksum: Option<String>,
    initial_x: f64,
    initial_y: f64,
    frame_id: Option<String>,
    workspace_id: Option<String>,
) -> Node {
    let now_ts = chrono::Utc::now().timestamp();

    Node {
        id: node_id,
        title,
        file_path: file_path_str,
        markdown_content: Some(content),
        node_type: "note".to_string(),
        canvas_x: initial_x,
        canvas_y: initial_y,
        width: layout_config::NODE_WIDTH,
        height: layout_config::NODE_HEIGHT,
        z_index: 0,
        frame_id,
        color_theme: None,
        is_collapsed: false,
        tags: None,
        workspace_id,
        checksum,
        created_at: now_ts,
        updated_at: now_ts,
        deleted_at: None,
    }
}
