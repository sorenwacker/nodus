#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checksum;
mod commands;
mod database;
mod import_helpers;
mod layout_config;
mod mcp_websocket;
mod ontology;
mod pdf;
mod themes;
mod typst_render;
mod watcher;

use std::sync::{Arc, Mutex};
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

#[tauri::command]
async fn render_typst_math(math: String, display_mode: bool) -> Result<String, String> {
    // Typst compilation is CPU-heavy; a synchronous command would block the
    // main thread and freeze the UI
    tauri::async_runtime::spawn_blocking(move || {
        typst_render::render_math_to_svg(&math, display_mode)
    })
    .await
    .map_err(|e| e.to_string())?
}

// MCP Server state wrapper
pub struct McpState(pub Arc<mcp_websocket::McpServerState>);

#[tauri::command]
async fn start_mcp_server(
    state: tauri::State<'_, McpState>,
    app_handle: tauri::AppHandle,
) -> Result<u16, String> {
    mcp_websocket::start_server(Arc::clone(&state.0), app_handle).await
}

#[tauri::command]
async fn stop_mcp_server(state: tauri::State<'_, McpState>) -> Result<(), String> {
    mcp_websocket::stop_server(Arc::clone(&state.0)).await
}

#[tauri::command]
async fn approve_mcp_connection(
    state: tauri::State<'_, McpState>,
    connection_id: String,
    approved: bool,
) -> Result<(), String> {
    mcp_websocket::approve_connection(Arc::clone(&state.0), &connection_id, approved).await
}

#[tauri::command]
async fn send_mcp_response(
    state: tauri::State<'_, McpState>,
    connection_id: String,
    response: String,
) -> Result<(), String> {
    mcp_websocket::send_response(Arc::clone(&state.0), &connection_id, &response).await
}

#[tauri::command]
async fn get_mcp_status(state: tauri::State<'_, McpState>) -> Result<serde_json::Value, String> {
    let running = state.0.is_running().await;
    let port = state.0.get_port().await;
    let pending = mcp_websocket::get_pending_connections(Arc::clone(&state.0)).await;

    Ok(serde_json::json!({
        "running": running,
        "port": port,
        "pending_connections": pending.len()
    }))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(commands::WatcherState(Mutex::new(None)))
        .manage(commands::LocksState(Mutex::new(
            std::collections::HashMap::new(),
        )))
        .manage(McpState(Arc::new(mcp_websocket::McpServerState::new())))
        .setup(|app| {
            // Initialize database - must complete before app starts. A failure
            // here must abort startup: without a database every command fails
            // and the app would launch in a silently broken state.
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move { database::initialize(&app_handle).await })
                .map_err(|e| format!("Failed to initialize database: {}", e))?;

            // Build macOS menu
            #[cfg(target_os = "macos")]
            {
                let handle = app.handle();

                let app_menu = SubmenuBuilder::new(handle, "Nodus")
                    .item(&PredefinedMenuItem::about(
                        handle,
                        Some("About Nodus"),
                        None,
                    )?)
                    .separator()
                    .item(
                        &MenuItemBuilder::with_id("settings", "Settings...")
                            .accelerator("CmdOrCtrl+,")
                            .build(handle)?,
                    )
                    .separator()
                    .item(&PredefinedMenuItem::hide(handle, Some("Hide Nodus"))?)
                    .item(&PredefinedMenuItem::hide_others(handle, None)?)
                    .item(&PredefinedMenuItem::show_all(handle, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::quit(handle, Some("Quit Nodus"))?)
                    .build()?;

                let edit_menu = SubmenuBuilder::new(handle, "Edit")
                    .item(&PredefinedMenuItem::undo(handle, None)?)
                    .item(&PredefinedMenuItem::redo(handle, None)?)
                    .separator()
                    .item(&PredefinedMenuItem::cut(handle, None)?)
                    .item(&PredefinedMenuItem::copy(handle, None)?)
                    .item(&PredefinedMenuItem::paste(handle, None)?)
                    .item(&PredefinedMenuItem::select_all(handle, None)?)
                    .build()?;

                let view_menu = SubmenuBuilder::new(handle, "View")
                    .item(
                        &MenuItemBuilder::with_id("zoom_in", "Zoom In")
                            .accelerator("CmdOrCtrl+=")
                            .build(handle)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("zoom_out", "Zoom Out")
                            .accelerator("CmdOrCtrl+-")
                            .build(handle)?,
                    )
                    .item(
                        &MenuItemBuilder::with_id("zoom_reset", "Actual Size")
                            .accelerator("CmdOrCtrl+0")
                            .build(handle)?,
                    )
                    .separator()
                    .item(&PredefinedMenuItem::fullscreen(handle, None)?)
                    .build()?;

                let help_menu = SubmenuBuilder::new(handle, "Help")
                    .item(&MenuItemBuilder::with_id("website", "Nodus Website").build(handle)?)
                    .item(&MenuItemBuilder::with_id("docs", "Documentation").build(handle)?)
                    .build()?;

                let menu = MenuBuilder::new(handle)
                    .item(&app_menu)
                    .item(&edit_menu)
                    .item(&view_menu)
                    .item(&help_menu)
                    .build()?;

                app.set_menu(menu)?;
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            let window = app.get_webview_window("main").unwrap();
            match event.id().as_ref() {
                "settings" => {
                    let _ = window.eval("window.__NODUS_OPEN_SETTINGS?.()");
                }
                "zoom_in" => {
                    let _ = window.eval("window.__NODUS_ZOOM_IN?.()");
                }
                "zoom_out" => {
                    let _ = window.eval("window.__NODUS_ZOOM_OUT?.()");
                }
                "zoom_reset" => {
                    let _ = window.eval("window.__NODUS_ZOOM_RESET?.()");
                }
                "website" => {
                    // window.open inside the webview does not reach the system
                    // browser under wry; use the opener plugin instead
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app.opener().open_url("https://nodus.app", None::<&str>);
                }
                "docs" => {
                    use tauri_plugin_opener::OpenerExt;
                    let _ = app
                        .opener()
                        .open_url("https://nodus.app/docs", None::<&str>);
                }
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_nodes,
            commands::get_node,
            commands::create_node,
            commands::update_node,
            commands::delete_node,
            commands::delete_nodes,
            commands::restore_node,
            commands::get_deleted_nodes,
            commands::restore_nodes_with_files,
            commands::update_node_position,
            commands::update_node_content,
            commands::update_node_content_from_file,
            commands::update_node_title,
            commands::update_node_file_path,
            commands::check_file_collision,
            commands::move_node_file,
            commands::update_node_size,
            commands::get_edges,
            commands::create_edge,
            commands::delete_edge,
            commands::update_edge_color,
            commands::update_edge_label,
            commands::update_edge_storyline,
            commands::update_edge_directed,
            commands::restore_edge,
            commands::watch_vault,
            commands::stop_watching,
            commands::sync_missing_files,
            commands::link_nodes_to_files,
            commands::import_vault,
            commands::create_workspace,
            commands::get_workspaces,
            commands::delete_workspace,
            commands::rename_workspace,
            commands::set_workspace_sync,
            commands::set_workspace_vault_path,
            commands::get_workspace,
            commands::create_node_from_file,
            commands::sync_node_wikilinks,
            commands::sync_all_wikilinks,
            commands::create_file_for_node,
            commands::export_nodes_to_files,
            commands::deduplicate_edges,
            commands::merge_bidirectional_edges,
            commands::cleanup_orphan_edges,
            commands::debug_get_all_edges,
            commands::read_file_content,
            commands::http_request,
            commands::extract_pdf_text,
            commands::extract_pdf_annotations,
            commands::refresh_workspace,
            commands::update_node_color,
            commands::update_node_workspace,
            commands::update_node_tags,
            commands::check_file_available,
            commands::acquire_edit_lock,
            commands::release_edit_lock,
            commands::get_locked_nodes,
            commands::create_storyline,
            commands::get_storylines,
            commands::get_storyline,
            commands::update_storyline,
            commands::delete_storyline,
            commands::add_node_to_storyline,
            commands::remove_node_from_storyline,
            commands::reorder_storyline_nodes,
            commands::get_storyline_nodes,
            commands::web_search,
            commands::fetch_url,
            commands::get_themes,
            commands::get_theme,
            commands::create_theme,
            commands::update_theme,
            commands::delete_theme,
            commands::validate_theme_yaml,
            commands::get_frames,
            commands::create_frame,
            commands::update_frame_position,
            commands::update_frame_size,
            commands::update_frame_title,
            commands::update_frame_color,
            commands::update_frame_parent,
            commands::delete_frame,
            commands::assign_node_to_frame,
            commands::import_ontology,
            render_typst_math,
            start_mcp_server,
            stop_mcp_server,
            approve_mcp_connection,
            send_mcp_response,
            get_mcp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
