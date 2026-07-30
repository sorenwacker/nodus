//! Open Knowledge Format (OKF v0.2) bundle export
//!
//! Exports a workspace as an OKF bundle: Markdown concept documents with YAML
//! frontmatter grouped by node type, plus a root index.md declaring the OKF
//! version. Spec:
//! https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md

use crate::database::{self, nodes::Node};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

pub const OKF_VERSION: &str = "0.2";

#[derive(Serialize)]
struct Generated {
    by: String,
    at: String,
}

#[derive(Serialize)]
struct OkfFrontmatter {
    r#type: String,
    title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    tags: Vec<String>,
    generated: Generated,
}

fn generator_actor() -> String {
    format!("nodus/{}", env!("CARGO_PKG_VERSION"))
}

/// Map a node type to its OKF concept type label
pub(crate) fn concept_type(node_type: &str) -> String {
    let mut chars = node_type.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => "Note".to_string(),
    }
}

/// Directory name for a node type (notes/, citations/, ...)
pub(crate) fn type_directory(node_type: &str) -> String {
    format!("{}s", node_type.to_lowercase())
}

/// Parse node tags from their JSON column representation
fn parse_tags(tags: &Option<String>) -> Vec<String> {
    tags.as_deref()
        .and_then(|t| serde_json::from_str::<Vec<String>>(t).ok())
        .unwrap_or_default()
}

/// First non-empty, non-heading content line, truncated for use as description
pub(crate) fn derive_description(content: &str) -> Option<String> {
    let line = content
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty() && !l.starts_with('#') && *l != "---")?;
    let cleaned: String = line.chars().take(150).collect();
    Some(cleaned)
}

/// Build the YAML frontmatter block for a node's concept document
pub(crate) fn build_frontmatter(node: &Node) -> String {
    let at = chrono::DateTime::from_timestamp(node.updated_at, 0)
        .unwrap_or_else(chrono::Utc::now)
        .to_rfc3339();
    let fm = OkfFrontmatter {
        r#type: concept_type(&node.node_type),
        title: node.title.clone(),
        description: node
            .markdown_content
            .as_deref()
            .and_then(derive_description),
        tags: parse_tags(&node.tags),
        generated: Generated {
            by: generator_actor(),
            at,
        },
    };
    let yaml = serde_yaml::to_string(&fm).unwrap_or_default();
    format!("---\n{}---\n", yaml)
}

/// Content for a NEW file Nodus creates: OKF frontmatter followed by the
/// node's content, unless the content already carries its own frontmatter.
pub(crate) fn with_frontmatter(node: &Node) -> String {
    let content = node.markdown_content.clone().unwrap_or_default();
    if content.starts_with("---\n") {
        return content;
    }
    format!("{}\n{}", build_frontmatter(node), content)
}

/// Splice new body content under the frontmatter block already present in a
/// file, so write-backs do not strip metadata. Returns the content to write.
pub(crate) fn preserve_frontmatter(existing_file: &str, new_content: &str) -> String {
    if new_content.starts_with("---\n") || !existing_file.starts_with("---\n") {
        return new_content.to_string();
    }
    let after_open = &existing_file[4..];
    match after_open.find("\n---") {
        Some(pos) => {
            let block_end = 4 + pos + 4;
            let block = existing_file[..block_end].trim_end_matches(['\r']);
            format!("{}\n{}", block, new_content)
        }
        // Unterminated frontmatter: treat the file as body-only
        None => new_content.to_string(),
    }
}

/// Sanitize a title into a filename stem, deduplicating against `taken`
pub(crate) fn okf_filename(title: &str, taken: &mut std::collections::HashSet<String>) -> String {
    let mut stem: String = title
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => ' ',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-");
    stem.truncate(100);
    let stem = stem.trim_matches(['-', '.']).to_string();
    let base = if stem.is_empty() {
        "untitled".to_string()
    } else {
        stem
    };

    let mut candidate = base.clone();
    let mut n = 2;
    while !taken.insert(candidate.to_lowercase()) {
        candidate = format!("{}-{}", base, n);
        n += 1;
    }
    candidate
}

/// Rewrite wikilinks to bundle-relative markdown links using the resolution
/// map (lowercased title or path key -> bundle path). Unresolvable links are
/// left unchanged; OKF consumers must tolerate them either way.
pub(crate) fn convert_wikilinks(content: &str, targets: &HashMap<String, String>) -> String {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();
    re.replace_all(content, |caps: &regex::Captures| {
        let target = caps[1].trim();
        let label = caps
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_else(|| target.split('#').next().unwrap_or(target).to_string());
        let key = target.split('#').next().unwrap_or(target).to_lowercase();
        let resolved = targets
            .get(&key)
            .or_else(|| key.rsplit('/').next().and_then(|k| targets.get(k)));
        match resolved {
            Some(path) => format!("[{}]({})", label, path),
            None => caps[0].to_string(),
        }
    })
    .to_string()
}

struct IndexEntry {
    section: String,
    title: String,
    path: String,
    description: Option<String>,
}

/// Build the bundle-root index.md with the okf_version declaration
fn build_index(workspace_name: &str, entries: &[IndexEntry]) -> String {
    let mut out = format!(
        "---\nokf_version: \"{}\"\n---\n\n# {}\n",
        OKF_VERSION, workspace_name
    );
    let unique_sections: Vec<String> = {
        let mut seen = std::collections::HashSet::new();
        entries
            .iter()
            .filter(|e| seen.insert(e.section.clone()))
            .map(|e| e.section.clone())
            .collect()
    };
    for section in unique_sections {
        out.push_str(&format!("\n# {}\n", section));
        for entry in entries.iter().filter(|e| e.section == section) {
            match &entry.description {
                Some(d) => out.push_str(&format!("* [{}]({}) - {}\n", entry.title, entry.path, d)),
                None => out.push_str(&format!("* [{}]({})\n", entry.title, entry.path)),
            }
        }
    }
    out
}

/// Export the workspace's nodes as an OKF bundle under target_dir.
/// Returns the number of concept documents written.
pub(crate) async fn export_okf_bundle_impl(
    pool: &database::DbPool,
    workspace_id: Option<String>,
    target_dir: &Path,
) -> Result<usize, String> {
    let workspace_name = match &workspace_id {
        Some(id) => database::workspaces::get_by_id(pool, id)
            .await
            .map_err(|e| e.to_string())?
            .map(|w| w.name)
            .ok_or("Workspace not found")?,
        None => "Default".to_string(),
    };

    let nodes: Vec<Node> = database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())?
        .into_iter()
        .filter(|n| n.workspace_id == workspace_id)
        .filter(|n| n.deleted_at.is_none())
        .filter(|n| n.node_type != "tag")
        .filter(|n| {
            n.markdown_content
                .as_deref()
                .is_some_and(|c| !c.trim().is_empty())
        })
        .collect();

    // Assign bundle paths first so wikilinks can resolve across documents
    let mut taken = std::collections::HashSet::new();
    let mut paths: Vec<String> = Vec::with_capacity(nodes.len());
    let mut link_targets: HashMap<String, String> = HashMap::new();
    for node in &nodes {
        let dir = type_directory(&node.node_type);
        let stem = okf_filename(&node.title, &mut taken);
        let path = format!("/{}/{}.md", dir, stem);
        link_targets
            .entry(node.title.to_lowercase())
            .or_insert_with(|| path.clone());
        paths.push(path);
    }

    std::fs::create_dir_all(target_dir).map_err(|e| e.to_string())?;

    let mut entries: Vec<IndexEntry> = Vec::with_capacity(nodes.len());
    for (node, bundle_path) in nodes.iter().zip(&paths) {
        let content = node.markdown_content.as_deref().unwrap_or_default();
        let body = convert_wikilinks(content, &link_targets);
        let doc = format!("{}\n{}\n", build_frontmatter(node), body.trim_end());

        let relative = bundle_path.trim_start_matches('/');
        let file_path = target_dir.join(relative);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&file_path, doc).map_err(|e| e.to_string())?;

        entries.push(IndexEntry {
            section: format!("{}s", concept_type(&node.node_type)),
            title: node.title.clone(),
            path: bundle_path.clone(),
            description: node
                .markdown_content
                .as_deref()
                .and_then(derive_description),
        });
    }

    let index = build_index(&workspace_name, &entries);
    std::fs::write(target_dir.join("index.md"), index).map_err(|e| e.to_string())?;

    Ok(entries.len())
}

/// Export a workspace as an OKF bundle into `<target_dir>/<workspace-slug>-okf`
#[tauri::command]
pub async fn export_okf_bundle(
    workspace_id: Option<String>,
    target_dir: String,
) -> Result<usize, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let base = Path::new(&target_dir);
    if !base.is_dir() {
        return Err("Target folder does not exist".to_string());
    }
    let slug = match &workspace_id {
        Some(id) => database::workspaces::get_by_id(pool, id)
            .await
            .map_err(|e| e.to_string())?
            .map(|w| w.name)
            .ok_or("Workspace not found")?,
        None => "default".to_string(),
    };
    let mut taken = std::collections::HashSet::new();
    let dir_name = format!("{}-okf", okf_filename(&slug, &mut taken).to_lowercase());
    export_okf_bundle_impl(pool, workspace_id, &base.join(dir_name)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::DbPool;
    use sqlx::sqlite::SqlitePoolOptions;

    fn make_node(id: &str, title: &str, node_type: &str, content: Option<&str>) -> Node {
        Node {
            id: id.to_string(),
            title: title.to_string(),
            file_path: None,
            markdown_content: content.map(|c| c.to_string()),
            node_type: node_type.to_string(),
            canvas_x: 0.0,
            canvas_y: 0.0,
            width: 200.0,
            height: 120.0,
            z_index: 0,
            frame_id: None,
            color_theme: None,
            is_collapsed: false,
            tags: Some("[\"alpha\",\"beta\"]".to_string()),
            workspace_id: None,
            checksum: None,
            created_at: 0,
            updated_at: 1_700_000_000,
            deleted_at: None,
        }
    }

    #[test]
    fn frontmatter_is_parseable_yaml_with_required_type() {
        let node = make_node(
            "n1",
            "My \"quoted\" note: subtitle",
            "note",
            Some("Body text"),
        );
        let fm = build_frontmatter(&node);

        assert!(fm.starts_with("---\n"));
        assert!(fm.ends_with("---\n"));
        let yaml = fm.trim_start_matches("---\n").trim_end_matches("---\n");
        let parsed: serde_yaml::Value = serde_yaml::from_str(yaml).expect("parseable yaml");
        assert_eq!(parsed["type"].as_str(), Some("Note"));
        assert_eq!(
            parsed["title"].as_str(),
            Some("My \"quoted\" note: subtitle")
        );
        assert_eq!(parsed["description"].as_str(), Some("Body text"));
        assert_eq!(parsed["tags"][0].as_str(), Some("alpha"));
        assert!(parsed["generated"]["by"]
            .as_str()
            .unwrap()
            .starts_with("nodus/"));
        assert!(parsed["generated"]["at"].as_str().is_some());
    }

    #[test]
    fn filenames_are_sanitized_and_deduplicated() {
        let mut taken = std::collections::HashSet::new();
        assert_eq!(okf_filename("My Note: a/b?", &mut taken), "My-Note-a-b");
        assert_eq!(okf_filename("my note   a b", &mut taken), "my-note-a-b-2");
        assert_eq!(okf_filename("", &mut taken), "untitled");
        assert_eq!(okf_filename("///", &mut taken), "untitled-2");
    }

    #[test]
    fn wikilinks_convert_to_bundle_relative_links() {
        let mut targets = HashMap::new();
        targets.insert("gpu sizing".to_string(), "/notes/gpu-sizing.md".to_string());

        assert_eq!(
            convert_wikilinks("see [[GPU Sizing]]", &targets),
            "see [GPU Sizing](/notes/gpu-sizing.md)"
        );
        assert_eq!(
            convert_wikilinks("see [[gpu sizing|the sizing doc]]", &targets),
            "see [the sizing doc](/notes/gpu-sizing.md)"
        );
        assert_eq!(
            convert_wikilinks("see [[hardware/gpu sizing]]", &targets),
            "see [hardware/gpu sizing](/notes/gpu-sizing.md)"
        );
        assert_eq!(
            convert_wikilinks("see [[GPU Sizing#memory]]", &targets),
            "see [GPU Sizing](/notes/gpu-sizing.md)"
        );
        assert_eq!(
            convert_wikilinks("see [[unknown note]]", &targets),
            "see [[unknown note]]"
        );
    }

    #[test]
    fn new_files_get_frontmatter_unless_content_has_its_own() {
        let node = make_node("n", "Alpha", "note", Some("Body"));
        let with = with_frontmatter(&node);
        assert!(with.starts_with("---\n"));
        assert!(with.contains("type: Note"));
        assert!(with.ends_with("\nBody"));

        let own = make_node("n", "Alpha", "note", Some("---\ncustom: yes\n---\nBody"));
        assert_eq!(with_frontmatter(&own), "---\ncustom: yes\n---\nBody");
    }

    #[test]
    fn write_back_preserves_existing_frontmatter_block() {
        let file = "---\ntype: Note\ntitle: Alpha\n---\nold body";
        assert_eq!(
            preserve_frontmatter(file, "new body"),
            "---\ntype: Note\ntitle: Alpha\n---\nnew body"
        );
        // New content bringing its own frontmatter wins
        assert_eq!(
            preserve_frontmatter(file, "---\nx: 1\n---\nbody"),
            "---\nx: 1\n---\nbody"
        );
        // File without frontmatter stays untouched
        assert_eq!(preserve_frontmatter("plain file", "new body"), "new body");
        // Unterminated frontmatter treated as body-only
        assert_eq!(preserve_frontmatter("---\nbroken", "new body"), "new body");
    }

    #[test]
    fn description_skips_headings_and_truncates() {
        assert_eq!(
            derive_description("# Heading\n\nFirst real line\nmore"),
            Some("First real line".to_string())
        );
        assert_eq!(derive_description("# Only heading"), None);
        let long = "x".repeat(300);
        assert_eq!(derive_description(&long).unwrap().len(), 150);
    }

    async fn memory_pool() -> DbPool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        database::run_migrations(&pool).await.expect("migrations");
        pool
    }

    async fn insert_node(pool: &DbPool, node: &Node) {
        database::nodes::create(pool, node).await.expect("insert");
    }

    #[tokio::test]
    async fn exports_conformant_bundle_with_index() {
        let pool = memory_pool().await;
        insert_node(
            &pool,
            &make_node("a", "Alpha", "note", Some("Links to [[Beta]]")),
        )
        .await;
        insert_node(
            &pool,
            &make_node("b", "Beta", "citation", Some("A cited work")),
        )
        .await;
        // Content-less and trashed nodes must be excluded
        insert_node(&pool, &make_node("c", "Empty", "note", None)).await;
        insert_node(&pool, &make_node("d", "Trashed", "note", Some("gone"))).await;
        sqlx::query("UPDATE nodes SET deleted_at = 1 WHERE id = 'd'")
            .execute(&pool)
            .await
            .unwrap();

        let dir = tempfile::tempdir().unwrap();
        let count = export_okf_bundle_impl(&pool, None, dir.path())
            .await
            .unwrap();

        assert_eq!(count, 2);

        let alpha = std::fs::read_to_string(dir.path().join("notes/Alpha.md")).unwrap();
        assert!(alpha.starts_with("---\n"));
        assert!(alpha.contains("type: Note"));
        assert!(
            alpha.contains("[Beta](/citations/Beta.md)"),
            "wikilink must be rewritten: {}",
            alpha
        );

        let beta = std::fs::read_to_string(dir.path().join("citations/Beta.md")).unwrap();
        assert!(beta.contains("type: Citation"));

        let index = std::fs::read_to_string(dir.path().join("index.md")).unwrap();
        assert!(index.contains("okf_version: \"0.2\""));
        assert!(index.contains("[Alpha](/notes/Alpha.md)"));
        assert!(index.contains("[Beta](/citations/Beta.md)"));
        assert!(!index.contains("Trashed"));
        assert!(!index.contains("Empty"));
    }
}
