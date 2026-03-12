//! Tauri commands for frontend communication
//!
//! All commands are async and return Results for proper error handling.

use crate::database::{self, edges::Edge, nodes::Node};
use crate::watcher::{write_file_locked, FileChangeEvent, FileLock, VaultWatcher};
use serde::Deserialize;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

/// Global watcher state
pub struct WatcherState(pub Mutex<Option<VaultWatcher>>);

/// Global file locks state (reserved for future use)
#[allow(dead_code)]
pub struct LocksState(pub Mutex<std::collections::HashMap<String, FileLock>>);

// ============================================================================
// Node Commands
// ============================================================================

#[tauri::command]
pub async fn get_nodes() -> Result<Vec<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_node(id: String) -> Result<Option<Node>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateNodeInput {
    pub title: String,
    pub file_path: Option<String>,
    pub markdown_content: Option<String>,
    pub node_type: String,
    pub canvas_x: f64,
    pub canvas_y: f64,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub tags: Option<Vec<String>>,
    pub workspace_id: Option<String>,
}

#[tauri::command]
pub async fn create_node(input: CreateNodeInput) -> Result<Node, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let node = Node {
        id: uuid::Uuid::new_v4().to_string(),
        title: input.title,
        file_path: input.file_path,
        markdown_content: input.markdown_content,
        node_type: input.node_type,
        canvas_x: input.canvas_x,
        canvas_y: input.canvas_y,
        width: input.width.unwrap_or(200.0),
        height: input.height.unwrap_or(120.0),
        z_index: 0,
        frame_id: None,
        color_theme: None,
        is_collapsed: false,
        tags: input.tags.map(|t| serde_json::to_string(&t).unwrap()),
        workspace_id: input.workspace_id,
        checksum: None,
        created_at: now,
        updated_at: now,
        deleted_at: None,
    };

    database::nodes::create(pool, &node)
        .await
        .map_err(|e| e.to_string())?;

    Ok(node)
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct UpdateNodeInput {
    pub id: String,
    pub title: Option<String>,
    pub markdown_content: Option<String>,
    pub node_type: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[tauri::command]
pub async fn update_node(_input: UpdateNodeInput) -> Result<(), String> {
    let _pool = database::get_pool().map_err(|e| e.to_string())?;

    // TODO: Implement partial update
    // For now, just update position is implemented

    Ok(())
}

#[tauri::command]
pub async fn delete_node(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::soft_delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_position(id: String, x: f64, y: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_position(pool, &id, x, y)
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Edge Commands
// ============================================================================

#[tauri::command]
pub async fn get_edges() -> Result<Vec<Edge>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateEdgeInput {
    pub source_node_id: String,
    pub target_node_id: String,
    pub label: Option<String>,
    pub link_type: Option<String>,
}

#[tauri::command]
pub async fn create_edge(input: CreateEdgeInput) -> Result<Edge, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let edge = Edge {
        id: uuid::Uuid::new_v4().to_string(),
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        label: input.label,
        link_type: input.link_type.unwrap_or_else(|| "related".to_string()),
        weight: 1.0,
        created_at: chrono::Utc::now().timestamp(),
    };

    database::edges::create(pool, &edge)
        .await
        .map_err(|e| e.to_string())?;

    Ok(edge)
}

#[tauri::command]
pub async fn delete_edge(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::edges::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn deduplicate_edges() -> Result<u64, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let removed = database::edges::deduplicate(pool)
        .await
        .map_err(|e| e.to_string())?;
    println!("Removed {} duplicate edges", removed);
    Ok(removed)
}

/// Update node content. Returns the new checksum if file was written.
#[tauri::command]
pub async fn update_node_content(id: String, content: String) -> Result<Option<String>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Check if node has a file_path - if so, write to file with locking
    if let Some(node) = database::nodes::get_by_id(pool, &id)
        .await
        .map_err(|e| e.to_string())?
    {
        if let Some(ref file_path) = node.file_path {
            let path = std::path::Path::new(file_path);
            if path.exists() {
                // Write to file with exclusive lock and get new checksum
                let checksum = write_file_locked(path, &content)
                    .map_err(|e| e.to_string())?;

                // Update content and checksum in database
                database::nodes::update_content_and_checksum(pool, &id, &content, &checksum)
                    .await
                    .map_err(|e| e.to_string())?;

                return Ok(Some(checksum));
            }
        }
    }

    // No file_path or file doesn't exist - just update database
    database::nodes::update_content(pool, &id, &content)
        .await
        .map_err(|e| e.to_string())?;

    Ok(None)
}

#[tauri::command]
pub async fn update_node_title(id: String, title: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_title(pool, &id, &title)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_size(id: String, width: f64, height: f64) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_size(pool, &id, width, height)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_node_color(id: String, color: Option<String>) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::nodes::update_color(pool, &id, color.as_deref())
        .await
        .map_err(|e| e.to_string())
}

// ============================================================================
// Vault Watcher Commands
// ============================================================================

#[tauri::command]
pub async fn watch_vault(
    path: String,
    app_handle: AppHandle,
    watcher_state: State<'_, WatcherState>,
) -> Result<(), String> {
    let path = PathBuf::from(path);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let mut watcher = VaultWatcher::new(path, move |event: FileChangeEvent| {
        if let Err(e) = app_handle.emit("vault-file-changed", &event) {
            eprintln!("Failed to emit file change event: {}", e);
        }
    })
    .map_err(|e| e.to_string())?;

    watcher.start().map_err(|e| e.to_string())?;

    let mut state = watcher_state.0.lock().unwrap();
    *state = Some(watcher);

    Ok(())
}

#[tauri::command]
pub async fn stop_watching(watcher_state: State<'_, WatcherState>) -> Result<(), String> {
    let mut state = watcher_state.0.lock().unwrap();

    if let Some(ref mut watcher) = *state {
        watcher.stop().map_err(|e| e.to_string())?;
    }

    *state = None;
    Ok(())
}

/// Extract wikilinks from markdown content
fn extract_wikilinks(content: &str) -> Vec<String> {
    let re = regex::Regex::new(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_string())
        .collect()
}

#[tauri::command]
pub async fn import_vault(path: String, workspace_id: Option<String>) -> Result<Vec<Node>, String> {
    let path = PathBuf::from(&path);

    println!("Importing vault from: {:?}, workspace_id: {:?}", path, workspace_id);

    if !path.exists() {
        return Err("Vault path does not exist".to_string());
    }

    let pool = database::get_pool().map_err(|e| e.to_string())?;
    let mut nodes = Vec::new();
    let mut title_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut node_links: Vec<(String, Vec<String>)> = Vec::new();
    let mut skipped = 0;

    // Walk directory and import .md files
    for entry in walkdir::WalkDir::new(&path)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let file_path = entry.path();

        if file_path.extension().map_or(false, |ext| ext == "md") {
            let file_path_str = file_path.to_string_lossy().to_string();

            // Check if this file is already imported
            if let Ok(Some(existing)) = database::nodes::get_by_file_path(pool, &file_path_str).await {
                if existing.deleted_at.is_some() {
                    // Node was soft-deleted, hard delete it so we can re-import
                    let _ = database::nodes::hard_delete(pool, &existing.id).await;
                } else {
                    // Node exists and is active, skip it
                    skipped += 1;
                    continue;
                }
            }

            // Read file content
            let content = std::fs::read_to_string(file_path).map_err(|e| e.to_string())?;

            // Extract title from filename
            let title = file_path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("Untitled")
                .to_string();

            // Extract wikilinks
            let links = extract_wikilinks(&content);

            // Compute checksum
            let checksum = crate::checksum::compute_string(&content);

            // Create node with random initial position (will be adjusted by d3-force)
            let now = chrono::Utc::now().timestamp();
            let node_id = uuid::Uuid::new_v4().to_string();

            // Random initial positions in a grid-like pattern
            let idx = nodes.len();
            let cols = 5;
            let spacing = 250.0;
            let initial_x = (idx % cols) as f64 * spacing + 100.0;
            let initial_y = (idx / cols) as f64 * spacing + 100.0;

            let node = Node {
                id: node_id.clone(),
                title: title.clone(),
                file_path: Some(file_path_str),
                markdown_content: Some(content),
                node_type: "note".to_string(),
                canvas_x: initial_x,
                canvas_y: initial_y,
                width: 200.0,
                height: 120.0,
                z_index: 0,
                frame_id: None,
                color_theme: None,
                is_collapsed: false,
                tags: None,
                workspace_id: workspace_id.clone(),
                checksum: Some(checksum),
                created_at: now,
                updated_at: now,
                deleted_at: None,
            };

            database::nodes::create(pool, &node)
                .await
                .map_err(|e| e.to_string())?;

            title_to_id.insert(title.to_lowercase(), node_id.clone());
            node_links.push((node_id, links));
            nodes.push(node);
        }
    }

    // Create edges for wikilinks (deduplicated)
    let now = chrono::Utc::now().timestamp();
    let mut edge_count = 0;
    let mut seen_edges: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();

    for (source_id, links) in node_links {
        // Deduplicate links within the same source node
        let unique_links: std::collections::HashSet<String> = links.into_iter()
            .map(|l| l.to_lowercase())
            .collect();

        for link in unique_links {
            if let Some(target_id) = title_to_id.get(&link) {
                if source_id != *target_id {
                    // Skip if we've already created this edge
                    let edge_key = (source_id.clone(), target_id.clone());
                    if seen_edges.contains(&edge_key) {
                        continue;
                    }
                    seen_edges.insert(edge_key);

                    let edge = database::edges::Edge {
                        id: uuid::Uuid::new_v4().to_string(),
                        source_node_id: source_id.clone(),
                        target_node_id: target_id.clone(),
                        label: None,
                        link_type: "wikilink".to_string(),
                        weight: 1.0,
                        created_at: now,
                    };
                    if database::edges::create(pool, &edge).await.is_ok() {
                        edge_count += 1;
                    }
                }
            }
        }
    }

    // Clean up any duplicate edges (from previous imports or database issues)
    let duplicates_removed = database::edges::deduplicate(pool).await.unwrap_or(0);

    println!("Import complete: {} nodes imported, {} skipped, {} edges created, {} duplicates removed",
             nodes.len(), skipped, edge_count, duplicates_removed);

    Ok(nodes)
}

// ============================================================================
// Workspace Commands
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceInput {
    pub id: String,
    pub name: String,
    pub color: Option<String>,
    pub vault_path: Option<String>,
}

#[tauri::command]
pub async fn create_workspace(input: CreateWorkspaceInput) -> Result<database::workspaces::Workspace, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().timestamp();
    let workspace = database::workspaces::Workspace {
        id: input.id,
        name: input.name,
        color: input.color,
        vault_path: input.vault_path,
        created_at: now,
        updated_at: now,
    };

    database::workspaces::create(pool, &workspace)
        .await
        .map_err(|e| e.to_string())?;

    Ok(workspace)
}

#[tauri::command]
pub async fn get_workspaces() -> Result<Vec<database::workspaces::Workspace>, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::get_all(pool)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_workspace(id: String) -> Result<(), String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;
    database::workspaces::delete(pool, &id)
        .await
        .map_err(|e| e.to_string())
}

/// Read file content from disk (for on-demand sync)
#[tauri::command]
pub async fn read_file_content(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

/// Refresh all nodes in a workspace from their source files
#[tauri::command]
pub async fn refresh_workspace(workspace_id: Option<String>) -> Result<u32, String> {
    let pool = database::get_pool().map_err(|e| e.to_string())?;

    // Get all nodes in workspace
    let nodes = database::nodes::get_all(pool).await.map_err(|e| e.to_string())?;

    let mut updated = 0u32;

    for node in nodes {
        // Skip nodes not in this workspace
        if node.workspace_id != workspace_id {
            continue;
        }

        // Skip nodes without a file path
        let file_path = match &node.file_path {
            Some(p) if !p.is_empty() => p,
            _ => continue,
        };

        // Try to read the file
        let content = match std::fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue, // File doesn't exist or can't be read
        };

        // Compute new checksum
        let new_checksum = crate::checksum::compute_string(&content);

        // Skip if content hasn't changed
        if node.checksum.as_ref() == Some(&new_checksum) {
            continue;
        }

        // Update the node
        if let Err(e) = database::nodes::update_content(pool, &node.id, &content).await {
            eprintln!("Failed to update node {}: {}", node.id, e);
            continue;
        }

        updated += 1;
    }

    Ok(updated)
}

// ============================================================================
// HTTP Commands (for LLM API calls)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct HttpRequestInput {
    pub url: String,
    pub method: String,
    pub headers: std::collections::HashMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub body: String,
}

/// Make an HTTP request from Rust (bypasses CORS)
#[tauri::command]
pub async fn http_request(input: HttpRequestInput) -> Result<HttpResponse, String> {
    let client = reqwest::Client::new();

    let timeout = std::time::Duration::from_millis(input.timeout_ms.unwrap_or(60000));

    let mut request = match input.method.to_uppercase().as_str() {
        "GET" => client.get(&input.url),
        "POST" => client.post(&input.url),
        "PUT" => client.put(&input.url),
        "DELETE" => client.delete(&input.url),
        "PATCH" => client.patch(&input.url),
        _ => return Err(format!("Unsupported HTTP method: {}", input.method)),
    };

    request = request.timeout(timeout);

    for (key, value) in input.headers {
        request = request.header(&key, &value);
    }

    if let Some(body) = input.body {
        request = request.body(body);
    }

    let response = request.send().await.map_err(|e| e.to_string())?;
    let status = response.status().as_u16();
    let body = response.text().await.map_err(|e| e.to_string())?;

    Ok(HttpResponse { status, body })
}

// ============================================================================
// PDF Commands
// ============================================================================

#[tauri::command]
pub async fn extract_pdf_text(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read PDF: {}", e))?;
    let text = pdf_extract::extract_text_from_mem(&bytes)
        .map_err(|e| format!("PDF extraction failed: {}", e))?;
    Ok(text)
}
