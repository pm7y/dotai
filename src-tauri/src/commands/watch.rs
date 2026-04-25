use crate::error::{AppError, AppResult};
use notify_debouncer_full::notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use tauri::Emitter;

pub struct WatcherState {
    inner: Mutex<HashMap<String, Debouncer<RecommendedWatcher, FileIdMap>>>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WatchEvent {
    pub watch_id: String,
    pub paths: Vec<String>,
    pub kind: String,
}

#[derive(Debug, Deserialize)]
pub struct WatchRequest {
    pub watch_id: String,
    pub paths: Vec<String>,
    pub recursive: bool,
}

#[tauri::command]
pub fn start_watch(
    app: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    req: WatchRequest,
) -> AppResult<()> {
    let app_for_callback = app.clone();
    let watch_id = req.watch_id.clone();
    let watch_id_for_callback = watch_id.clone();

    let mut debouncer = new_debouncer(
        Duration::from_millis(250),
        None,
        move |result: DebounceEventResult| {
            if let Ok(events) = result {
                for ev in events {
                    let paths: Vec<String> = ev
                        .paths
                        .iter()
                        .map(|p| p.to_string_lossy().to_string())
                        .collect();
                    let kind = format!("{:?}", ev.kind);
                    let payload = WatchEvent {
                        watch_id: watch_id_for_callback.clone(),
                        paths,
                        kind,
                    };
                    let _ = app_for_callback.emit("dotai://watch", payload);
                }
            }
        },
    )
    .map_err(|e| AppError::Watch(e.to_string()))?;

    let mode = if req.recursive {
        RecursiveMode::Recursive
    } else {
        RecursiveMode::NonRecursive
    };

    for raw in &req.paths {
        let path = PathBuf::from(raw);
        if !path.exists() {
            continue;
        }
        debouncer
            .watcher()
            .watch(&path, mode)
            .map_err(|e| AppError::Watch(e.to_string()))?;
        debouncer.cache().add_root(&path, mode);
    }

    let mut guard = state
        .inner
        .lock()
        .map_err(|e| AppError::Watch(e.to_string()))?;
    guard.insert(watch_id, debouncer);
    Ok(())
}

#[tauri::command]
pub fn stop_watch(state: tauri::State<'_, WatcherState>, watch_id: String) -> AppResult<()> {
    let mut guard = state
        .inner
        .lock()
        .map_err(|e| AppError::Watch(e.to_string()))?;
    guard.remove(&watch_id);
    Ok(())
}
