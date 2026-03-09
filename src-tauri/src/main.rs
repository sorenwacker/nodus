#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod checksum;
mod commands;
mod database;
mod watcher;

use std::sync::Mutex;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::WatcherState(Mutex::new(None)))
        .setup(|app| {
            // Initialize database
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = database::initialize(&app_handle).await {
                    eprintln!("Failed to initialize database: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_nodes,
            commands::get_node,
            commands::create_node,
            commands::update_node,
            commands::delete_node,
            commands::update_node_position,
            commands::update_node_content,
            commands::update_node_title,
            commands::update_node_size,
            commands::get_edges,
            commands::create_edge,
            commands::delete_edge,
            commands::watch_vault,
            commands::stop_watching,
            commands::import_vault,
            commands::create_workspace,
            commands::get_workspaces,
            commands::delete_workspace,
            commands::deduplicate_edges,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
