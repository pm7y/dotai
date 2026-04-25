mod commands;
mod error;

use commands::{env, files, paths, search, watch};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(watch::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            paths::get_path_tokens,
            paths::resolve_path,
            files::stat_path,
            files::list_dir,
            files::read_file,
            files::write_file,
            watch::start_watch,
            watch::stop_watch,
            search::search_files,
            env::read_env_vars,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
