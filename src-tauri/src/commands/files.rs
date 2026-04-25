use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Serialize)]
pub struct FileMeta {
    pub abs_path: String,
    pub exists: bool,
    pub is_dir: bool,
    pub size_bytes: Option<u64>,
    pub mtime_ms: Option<u128>,
    pub readable: bool,
    pub writable: bool,
}

fn mtime_ms(meta: &fs::Metadata) -> Option<u128> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_millis())
}

#[tauri::command]
pub fn stat_path(path: String) -> AppResult<FileMeta> {
    let p = PathBuf::from(&path);
    match fs::metadata(&p) {
        Ok(meta) => Ok(FileMeta {
            abs_path: path,
            exists: true,
            is_dir: meta.is_dir(),
            size_bytes: Some(meta.len()),
            mtime_ms: mtime_ms(&meta),
            readable: true,
            writable: !meta.permissions().readonly(),
        }),
        Err(_) => Ok(FileMeta {
            abs_path: path,
            exists: false,
            is_dir: false,
            size_bytes: None,
            mtime_ms: None,
            readable: false,
            writable: false,
        }),
    }
}

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub abs_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub mtime_ms: Option<u128>,
}

#[tauri::command]
pub fn list_dir(path: String, glob: Option<String>) -> AppResult<Vec<DirEntry>> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Ok(vec![]);
    }
    let glob = glob.unwrap_or_else(|| "*".into());
    let pattern_segments: Vec<&str> = glob.split('/').collect();

    let mut out = Vec::new();
    let walker = walkdir::WalkDir::new(&root)
        .min_depth(1)
        .max_depth(pattern_segments.len().max(1));
    for entry in walker.into_iter().filter_map(|e| e.ok()) {
        let depth = entry.depth();
        if depth == 0 || depth > pattern_segments.len() {
            continue;
        }
        let segment = pattern_segments[depth - 1];
        let name = entry.file_name().to_string_lossy().to_string();
        if !match_segment(segment, &name) {
            continue;
        }
        if depth < pattern_segments.len() {
            if !entry.file_type().is_dir() {
                continue;
            }
            continue;
        }
        let meta = entry.metadata().ok();
        let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
        let mtime = meta.as_ref().and_then(mtime_ms);
        out.push(DirEntry {
            name: rel_path(&root, entry.path()),
            abs_path: entry.path().to_string_lossy().to_string(),
            is_dir: entry.file_type().is_dir(),
            size_bytes: size,
            mtime_ms: mtime,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

fn rel_path(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .map(|r| r.to_string_lossy().to_string())
        .unwrap_or_else(|_| p.to_string_lossy().to_string())
}

fn match_segment(pattern: &str, name: &str) -> bool {
    if pattern == "*" {
        return true;
    }
    if let Some(suffix) = pattern.strip_prefix("*") {
        return name.ends_with(suffix);
    }
    if let Some(prefix) = pattern.strip_suffix("*") {
        return name.starts_with(prefix);
    }
    pattern == name
}

#[derive(Debug, Serialize)]
pub struct ReadResult {
    pub content: String,
    pub size_bytes: u64,
    pub mtime_ms: Option<u128>,
    pub line_ending: String,
    pub mode: Option<u32>,
}

#[tauri::command]
pub fn read_file(path: String) -> AppResult<ReadResult> {
    let p = PathBuf::from(&path);
    let bytes = fs::read(&p)?;
    let meta = fs::metadata(&p)?;
    let content = String::from_utf8_lossy(&bytes).to_string();
    let line_ending = if content.contains("\r\n") {
        "crlf"
    } else {
        "lf"
    };
    #[cfg(unix)]
    let mode = {
        use std::os::unix::fs::PermissionsExt;
        Some(meta.permissions().mode())
    };
    #[cfg(not(unix))]
    let mode: Option<u32> = None;
    Ok(ReadResult {
        content,
        size_bytes: meta.len(),
        mtime_ms: mtime_ms(&meta),
        line_ending: line_ending.to_string(),
        mode,
    })
}

#[derive(Debug, Deserialize)]
pub struct WriteRequest {
    pub path: String,
    pub content: String,
    pub line_ending: Option<String>,
    pub mode: Option<u32>,
    pub backup_dir: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WriteResult {
    pub backup_path: Option<String>,
    pub size_bytes: u64,
    pub mtime_ms: Option<u128>,
}

#[tauri::command]
pub fn write_file(req: WriteRequest) -> AppResult<WriteResult> {
    let target = PathBuf::from(&req.path);
    let parent = target
        .parent()
        .ok_or_else(|| AppError::Invalid("no parent dir".into()))?;
    fs::create_dir_all(parent)?;

    let normalized = normalize_line_endings(&req.content, req.line_ending.as_deref());
    let backup_path = if let Some(backup_dir) = req.backup_dir.as_ref() {
        backup_existing(&target, backup_dir)?
    } else {
        None
    };

    let mut tmp = tempfile::Builder::new()
        .prefix(".aifiles-")
        .suffix(".tmp")
        .tempfile_in(parent)?;
    tmp.write_all(normalized.as_bytes())?;
    tmp.flush()?;

    #[cfg(unix)]
    if let Some(mode) = req.mode {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(mode);
        fs::set_permissions(tmp.path(), perms)?;
    }

    tmp.persist(&target).map_err(|e| AppError::Io(e.error))?;

    let meta = fs::metadata(&target)?;
    Ok(WriteResult {
        backup_path,
        size_bytes: meta.len(),
        mtime_ms: mtime_ms(&meta),
    })
}

fn normalize_line_endings(content: &str, line_ending: Option<&str>) -> String {
    match line_ending {
        Some("crlf") => {
            let lf_only = content.replace("\r\n", "\n");
            lf_only.replace('\n', "\r\n")
        }
        _ => content.replace("\r\n", "\n"),
    }
}

fn backup_existing(target: &Path, backup_dir: &str) -> AppResult<Option<String>> {
    if !target.exists() {
        return Ok(None);
    }
    let stamp = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".into());
    let hash = simple_hash(target.to_string_lossy().as_bytes());
    let dir = PathBuf::from(backup_dir).join(format!("{:x}", hash));
    fs::create_dir_all(&dir)?;
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".into());
    let backup_path = dir.join(format!("{}.{}.bak", name, stamp));
    fs::copy(target, &backup_path)?;
    Ok(Some(backup_path.to_string_lossy().to_string()))
}

fn simple_hash(bytes: &[u8]) -> u64 {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in bytes {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    h
}
