//! A registered command must act on what it is given.
//!
//! `update_node` was registered in the invoke handler, took an `UpdateNodeInput`
//! it bound as `_input`, and returned `Ok(())`. Every caller was told the update
//! succeeded and nothing was written. A command that binds none of its inputs
//! cannot have used them, so the signature alone gives this away.

use std::fs;
use std::path::{Path, PathBuf};

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

/// Parameter names in a signature, ignoring the receiver and any lifetimes.
fn parameter_names(signature: &str) -> Vec<String> {
    let Some(open) = signature.find('(') else {
        return Vec::new();
    };
    let Some(close) = signature.rfind(')') else {
        return Vec::new();
    };
    let params = &signature[open + 1..close];

    let mut names = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();
    for ch in params.chars() {
        match ch {
            '<' | '(' | '[' => {
                depth += 1;
                current.push(ch)
            }
            '>' | ')' | ']' => {
                depth = depth.saturating_sub(1);
                current.push(ch)
            }
            ',' if depth == 0 => {
                names.push(std::mem::take(&mut current));
            }
            _ => current.push(ch),
        }
    }
    names.push(current);

    names
        .into_iter()
        .filter_map(|param| {
            let param = param.trim();
            if param.is_empty() {
                return None;
            }
            let name = param.split(':').next()?.trim();
            if name == "self" || name == "&self" || name == "&mut self" {
                return None;
            }
            Some(name.to_string())
        })
        .collect()
}

#[test]
fn no_command_ignores_every_input_it_is_given() {
    let mut sources = Vec::new();
    rust_sources(Path::new("src"), &mut sources);
    assert!(!sources.is_empty(), "found no Rust sources to scan");

    let mut offenders = Vec::new();

    for path in &sources {
        let text = fs::read_to_string(path).expect("readable source");
        let lines: Vec<&str> = text.lines().collect();

        for (index, line) in lines.iter().enumerate() {
            if line.trim() != "#[tauri::command]" {
                continue;
            }

            // Join the signature, which may wrap across lines
            let mut signature = String::new();
            for following in lines.iter().skip(index + 1) {
                signature.push_str(following);
                signature.push(' ');
                if following.contains('{') {
                    break;
                }
            }

            let params = parameter_names(&signature);
            if params.is_empty() {
                continue;
            }
            if params.iter().all(|name| name.starts_with('_')) {
                let name = signature
                    .split("fn ")
                    .nth(1)
                    .and_then(|rest| rest.split('(').next())
                    .unwrap_or("<unknown>")
                    .trim()
                    .to_string();
                offenders.push(format!("{}: {}", path.display(), name));
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "These commands bind none of their parameters, so they cannot act on \
         them while still reporting success. Implement them or remove them:\n  {}",
        offenders.join("\n  ")
    );
}
