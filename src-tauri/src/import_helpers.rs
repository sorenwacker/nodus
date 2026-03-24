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

/// Transform wikilinks that resolve to a target into plain text
/// Returns the modified content
///
/// Handles:
/// - `[[target]]` → `target`
/// - `[[target|alias]]` → `alias`
/// - `[[folder/target]]` → `target`
/// - `[[target#section]]` → `target`
/// - `[[target#section|alias]]` → `alias`
pub fn remove_wikilinks_to_target(content: &str, target_title: &str) -> String {
    let target_lower = target_title.to_lowercase();

    // Regex captures: full match, link part (before |), optional alias (after |)
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]").unwrap();

    re.replace_all(content, |caps: &regex::Captures| {
        let link_part = &caps[1];
        let alias = caps.get(2).map(|m| m.as_str());

        // Extract the filename from the link (strip path and section)
        let link_name = link_part
            .split('#')
            .next()
            .unwrap_or(link_part)
            .rsplit('/')
            .next()
            .unwrap_or(link_part);

        // Check if this link resolves to the target
        if link_name.to_lowercase() == target_lower {
            // Replace with alias if present, otherwise use link name
            alias.unwrap_or(link_name).to_string()
        } else {
            // Keep the original wikilink
            caps[0].to_string()
        }
    })
    .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remove_simple_wikilink() {
        let content = "See [[MIRA]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See MIRA for details.");
    }

    #[test]
    fn test_remove_wikilink_with_alias() {
        let content = "See [[MIRA|the MIRA project]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See the MIRA project for details.");
    }

    #[test]
    fn test_remove_wikilink_with_path() {
        let content = "See [[projects/MIRA]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See MIRA for details.");
    }

    #[test]
    fn test_remove_wikilink_with_section() {
        let content = "See [[MIRA#Overview]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See MIRA for details.");
    }

    #[test]
    fn test_remove_wikilink_with_section_and_alias() {
        let content = "See [[MIRA#Overview|overview]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See overview for details.");
    }

    #[test]
    fn test_remove_wikilink_with_path_section_alias() {
        let content = "See [[folder/MIRA#Section|alias text]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See alias text for details.");
    }

    #[test]
    fn test_preserve_other_wikilinks() {
        let content = "See [[MIRA]] and [[BrAPI]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See MIRA and [[BrAPI]] for details.");
    }

    #[test]
    fn test_case_insensitive_matching() {
        let content = "See [[mira]] and [[MIRA]] for details.";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "See mira and MIRA for details.");
    }

    #[test]
    fn test_multiple_occurrences() {
        let content = "[[MIRA]], [[MIRA|alias]], and [[folder/MIRA#section]]";
        let result = remove_wikilinks_to_target(content, "MIRA");
        assert_eq!(result, "MIRA, alias, and MIRA");
    }
}
