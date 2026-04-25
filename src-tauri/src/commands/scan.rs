use crate::error::AppResult;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Deserialize)]
pub struct ScanRequest {
    pub root: String,
    pub max_depth: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub path: String,
    pub matches: Vec<String>,
}

const MARKERS: &[&str] = &[".claude", ".mcp.json", ".github/agents", ".copilot"];
const IGNORE: &[&str] = &["node_modules", ".git", "target", "dist", "build", ".next"];

pub fn marker_matches(dir: &Path) -> Vec<String> {
    let mut hits = Vec::new();
    for marker in MARKERS {
        if dir.join(marker).exists() {
            hits.push((*marker).to_string());
        }
    }
    hits
}

#[tauri::command]
pub fn scan_projects(req: ScanRequest) -> AppResult<Vec<ScanResult>> {
    let root = PathBuf::from(&req.root);
    let max_depth = req.max_depth.unwrap_or(3);
    let mut seen = BTreeSet::new();
    let mut out = Vec::new();
    if !root.exists() {
        return Ok(out);
    }
    let walker = walkdir::WalkDir::new(&root)
        .min_depth(0)
        .max_depth(max_depth)
        .into_iter()
        .filter_entry(|e| {
            !IGNORE
                .iter()
                .any(|ig| e.file_name().to_string_lossy() == *ig)
        });
    for entry in walker.filter_map(|e| e.ok()) {
        if !entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        let path_str = path.to_string_lossy().to_string();
        if seen.contains(&path_str) {
            continue;
        }
        let matches = marker_matches(path);
        if matches.is_empty() {
            continue;
        }
        seen.insert(path_str.clone());
        out.push(ScanResult {
            path: path_str,
            matches,
        });
    }
    Ok(out)
}
