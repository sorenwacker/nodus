//! Import helper functions for vault import operations
//!
//! Extracted from commands.rs to reduce function complexity.

use std::collections::HashMap;
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

/// Extract wikilinks from markdown content
pub fn extract_wikilinks(content: &str) -> Vec<String> {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}
