#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checksum;
mod commands;
mod database;
mod import_helpers;
mod layout_config;
mod ontology;
mod pdf;
mod themes;
mod typst_render;
mod watcher;
mod zotero;

use std::sync::Mutex;
#[cfg(target_os = "macos")]
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::Manager;

#[tauri::command]
fn render_typst_math(math: String, display_mode: bool) -> Result<String, String> {
    typst_render::render_math_to_svg(&math, display_mode)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(commands::WatcherState(Mutex::new(None)))
        .manage(commands::LocksState(Mutex::new(
            std::collections::HashMap::new(),
        )))
        .setup(|app| {
            // Initialize database - must complete before app starts
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                if let Err(e) = database::initialize(&app_handle).await {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });

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
                    let _ = window.eval("window.open('https://nodus.app', '_blank')");
                }
                "docs" => {
                    let _ = window.eval("window.open('https://nodus.app/docs', '_blank')");
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
            commands::update_node_position,
            commands::update_node_content,
            commands::update_node_content_from_file,
            commands::update_node_title,
            commands::update_node_file_path,
            commands::update_node_size,
            commands::get_edges,
            commands::create_edge,
            commands::delete_edge,
            commands::update_edge_color,
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
            commands::set_workspace_sync,
            commands::set_workspace_vault_path,
            commands::get_workspace,
            commands::create_node_from_file,
            commands::sync_node_wikilinks,
            commands::sync_all_wikilinks,
            commands::create_file_for_node,
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
            commands::delete_frame,
            commands::import_ontology,
            commands::detect_zotero_path,
            commands::list_zotero_collections,
            commands::get_zotero_collection_items,
            render_typst_math,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
