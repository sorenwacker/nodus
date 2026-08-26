//! Each table is defined in one migration.
//!
//! `frames` was defined in both 001 and 007, with the two disagreeing on
//! nullability, default sizes, the delete behaviour of the workspace foreign
//! key, and one column. 001 runs first, so `CREATE TABLE IF NOT EXISTS` in 007
//! found the table already there and did nothing: 007 could never take effect,
//! and reading it gave a false picture of the live schema.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// Table names created by a migration, ignoring the temporary tables a rebuild
/// uses and drops within the same file.
fn tables_created_in(sql: &str) -> Vec<String> {
    let mut tables = Vec::new();
    for line in sql.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed
            .strip_prefix("CREATE TABLE IF NOT EXISTS ")
            .or_else(|| trimmed.strip_prefix("CREATE TABLE "))
        else {
            continue;
        };
        let name = rest
            .split(['(', ' '])
            .next()
            .unwrap_or("")
            .trim()
            .to_string();
        if name.is_empty() {
            continue;
        }
        // A rebuild creates a scratch table and drops it in the same file
        if sql.contains(&format!("DROP TABLE IF EXISTS {}", name))
            || sql.contains(&format!("DROP TABLE {}", name))
        {
            continue;
        }
        tables.push(name);
    }
    tables
}

#[test]
fn no_table_is_defined_by_two_migrations() {
    let dir = Path::new("migrations");
    let mut definitions: HashMap<String, Vec<String>> = HashMap::new();

    let mut files: Vec<_> = fs::read_dir(dir)
        .expect("migrations directory is readable")
        .map(|e| e.expect("readable entry").path())
        .filter(|p| p.extension().is_some_and(|e| e == "sql"))
        .collect();
    files.sort();
    assert!(!files.is_empty(), "found no migrations to scan");

    for path in &files {
        let sql = fs::read_to_string(path).expect("readable migration");
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("?")
            .to_string();
        for table in tables_created_in(&sql) {
            definitions.entry(table).or_default().push(name.clone());
        }
    }

    let duplicates: Vec<String> = definitions
        .iter()
        .filter(|(_, files)| files.len() > 1)
        .map(|(table, files)| format!("{} defined in {}", table, files.join(", ")))
        .collect();

    assert!(
        duplicates.is_empty(),
        "Only the first definition of a table applies; a later one silently does \
         nothing and misleads anyone reading it. Keep one definition and alter it \
         in place:\n  {}",
        duplicates.join("\n  ")
    );
}

#[test]
fn every_migration_is_applied() {
    // A migration file nothing runs is as misleading as a duplicate definition
    let runner = fs::read_to_string("src/database/mod.rs").expect("readable runner");

    let mut unreferenced = Vec::new();
    for entry in fs::read_dir("migrations").expect("migrations directory is readable") {
        let path = entry.expect("readable entry").path();
        if path.extension().is_none_or(|e| e != "sql") {
            continue;
        }
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !runner.contains(name) {
            unreferenced.push(name.to_string());
        }
    }
    unreferenced.sort();

    assert!(
        unreferenced.is_empty(),
        "These migrations are never applied:\n  {}",
        unreferenced.join("\n  ")
    );
}
