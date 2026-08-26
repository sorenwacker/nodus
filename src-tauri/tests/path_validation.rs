//! A path the interface names is not a path the user chose.
//!
//! `import_ontology` read any file the webview named, `export_okf_bundle` wrote
//! to any directory it named, and `restore_node` renamed a file to a path taken
//! straight from a frontend-supplied struct. Each checked only that the path
//! existed. See PRODUCT_DESIGN.md > Validating caller-supplied paths.

use std::fs;
use std::path::{Path, PathBuf};

/// Filesystem operations. A command reaching one of these with an unchecked
/// caller-supplied path is the defect this gate exists for.
const FILESYSTEM_OPS: &[&str] = &[
    "fs::write",
    "fs::read_to_string",
    "fs::rename",
    "fs::create_dir_all",
    "fs::remove_file",
    "fs::remove_dir_all",
    "fs::copy",
    "fs::read_dir",
    "fs::metadata",
    "File::create",
    ".exists()",
    ".is_dir()",
];

const VALIDATORS: &[&str] = &[
    "validate_path_in_workspace",
    "validate_target_dir_in_workspace",
    "path_is_within_vaults",
    "future_dir_is_within_vaults",
    "dropped_paths::is_granted",
    // The backend owns this dialog, so the path is the user's own choice
    "save_export_file",
];

/// Structs whose fields carry a path supplied by the caller.
const PATH_CARRYING_STRUCTS: &[&str] = &["Node", "ImportOntologyInput"];

/// Commands exempt from the rule, each with the reason.
///
/// The vault path is the thing being chosen here: validating it against the
/// vault list it is about to define is circular. All four are reachable only
/// from a folder dialog.
const EXEMPT: &[(&str, &str)] = &[
    ("watch_vault", "registers the vault folder the user picked"),
    ("import_vault", "imports the vault folder the user picked"),
    (
        "sync_missing_files",
        "walks the vault of a workspace already registered",
    ),
    (
        "link_nodes_to_files",
        "walks the vault of a workspace already registered",
    ),
    (
        "refresh_workspace",
        "walks the vault of a workspace already registered",
    ),
];

struct Command {
    name: String,
    signature: String,
    body: String,
}

fn rust_sources(dir: &Path, found: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).expect("readable source directory") {
        let path = entry.expect("readable entry").path();
        if path.is_dir() {
            rust_sources(&path, found);
        } else if path.extension().is_some_and(|e| e == "rs") {
            found.push(path);
        }
    }
}

fn commands_in(text: &str) -> Vec<Command> {
    let lines: Vec<&str> = text.lines().collect();
    let mut found = Vec::new();

    for (index, line) in lines.iter().enumerate() {
        if line.trim() != "#[tauri::command]" {
            continue;
        }

        let mut name = String::new();
        let mut signature = String::new();
        let mut body = String::new();
        let mut depth: i32 = 0;
        let mut in_body = false;

        for following in lines.iter().skip(index + 1) {
            body.push_str(following);
            body.push('\n');

            if name.is_empty() {
                if let Some(rest) = following.split_once("fn ") {
                    name = rest
                        .1
                        .split('(')
                        .next()
                        .unwrap_or("")
                        .trim()
                        .trim_end_matches('<')
                        .to_string();
                }
            }
            if !in_body {
                signature.push_str(following);
                signature.push(' ');
            }

            depth += following.matches('{').count() as i32;
            depth -= following.matches('}').count() as i32;
            if following.contains('{') {
                in_body = true;
            }
            if in_body && depth <= 0 {
                break;
            }
        }

        found.push(Command {
            name,
            signature,
            body,
        });
    }

    found
}

/// True when a parameter carries a path the caller chose, either directly or
/// inside a struct that holds one.
fn takes_caller_path(signature: &str) -> bool {
    let Some(open) = signature.find('(') else {
        return false;
    };
    // Match the opening paren by depth. rfind(')') lands inside the return
    // type, e.g. `Result<(), String>`, which truncated the last parameter and
    // let a path-carrying struct through this scan unnoticed.
    let mut depth = 0usize;
    let mut close = None;
    for (offset, ch) in signature[open..].char_indices() {
        match ch {
            '(' => depth += 1,
            ')' => {
                depth -= 1;
                if depth == 0 {
                    close = Some(open + offset);
                    break;
                }
            }
            _ => {}
        }
    }
    let Some(close) = close else {
        return false;
    };
    let params = &signature[open + 1..close];

    // Split on top-level commas only, so `Result<A, B>` or a tuple stays whole
    let mut parts: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut nesting = 0usize;
    for ch in params.chars() {
        match ch {
            '<' | '(' | '[' => {
                nesting += 1;
                current.push(ch)
            }
            '>' | ')' | ']' => {
                nesting = nesting.saturating_sub(1);
                current.push(ch)
            }
            ',' if nesting == 0 => parts.push(std::mem::take(&mut current)),
            _ => current.push(ch),
        }
    }
    parts.push(current);

    for param in parts {
        let Some((raw_name, raw_type)) = param.split_once(':') else {
            continue;
        };
        let param_name = raw_name.trim().to_lowercase();
        let param_type = raw_type.trim();

        let names_a_path = param_name.contains("path")
            || param_name.contains("dir")
            || param_name.contains("file");
        let is_string_like = param_type.contains("String") || param_type.contains("str");
        if names_a_path && is_string_like {
            return true;
        }

        if PATH_CARRYING_STRUCTS
            .iter()
            .any(|s| param_type.split_whitespace().any(|word| word == *s))
        {
            return true;
        }
    }

    false
}

#[test]
fn every_caller_supplied_path_is_validated_before_use() {
    let mut sources = Vec::new();
    rust_sources(Path::new("src"), &mut sources);
    assert!(!sources.is_empty(), "found no Rust sources to scan");

    let mut offenders = Vec::new();
    let mut checked = 0;

    for path in &sources {
        let text = fs::read_to_string(path).expect("readable source");
        for command in commands_in(&text) {
            if !takes_caller_path(&command.signature) {
                continue;
            }
            if EXEMPT.iter().any(|(name, _)| *name == command.name) {
                continue;
            }
            checked += 1;

            let touches_filesystem = FILESYSTEM_OPS.iter().any(|op| command.body.contains(op));
            let validates = VALIDATORS.iter().any(|v| command.body.contains(v));

            if touches_filesystem && !validates {
                offenders.push(format!("{}::{}", path.display(), command.name));
            }
        }
    }

    assert!(
        checked > 0,
        "the scan matched no commands, so it proves nothing"
    );
    assert!(
        offenders.is_empty(),
        "These commands act on a caller-supplied path without checking it against \
         the workspace vaults. Call validate_path_in_workspace (existing path) or \
         validate_target_dir_in_workspace (directory that may not exist yet):\n  {}",
        offenders.join("\n  ")
    );
}

#[test]
fn every_exemption_states_a_reason() {
    for (name, reason) in EXEMPT {
        assert!(
            reason.len() > 20,
            "exemption for {} needs a reason, not a placeholder",
            name
        );
    }
}
