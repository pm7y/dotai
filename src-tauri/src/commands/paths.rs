use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathTokens {
    pub home: PathBuf,
    pub copilot_home: PathBuf,
    pub claude_desktop_config: PathBuf,
    pub app_data: PathBuf,
    pub app_local_data: PathBuf,
}

fn home() -> AppResult<PathBuf> {
    dirs::home_dir().ok_or_else(|| AppError::Path("no home dir".into()))
}

fn copilot_home() -> AppResult<PathBuf> {
    if let Ok(p) = std::env::var("COPILOT_HOME") {
        return Ok(PathBuf::from(p));
    }
    Ok(home()?.join(".copilot"))
}

fn claude_desktop_config() -> AppResult<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        Ok(home()?.join("Library/Application Support/Claude/claude_desktop_config.json"))
    }
    #[cfg(target_os = "windows")]
    {
        let appdata =
            std::env::var("APPDATA").map_err(|_| AppError::Path("APPDATA not set".into()))?;
        Ok(PathBuf::from(appdata).join("Claude/claude_desktop_config.json"))
    }
    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    {
        Ok(home()?.join(".config/Claude/claude_desktop_config.json"))
    }
}

#[tauri::command]
pub fn get_path_tokens(app: tauri::AppHandle) -> AppResult<PathTokens> {
    use tauri::Manager;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    let app_local_data = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::Path(e.to_string()))?;
    Ok(PathTokens {
        home: home()?,
        copilot_home: copilot_home()?,
        claude_desktop_config: claude_desktop_config()?,
        app_data,
        app_local_data,
    })
}

#[derive(Debug, Deserialize)]
pub struct ResolveRequest {
    pub template: String,
    pub project: Option<String>,
}

#[tauri::command]
pub fn resolve_path(app: tauri::AppHandle, req: ResolveRequest) -> AppResult<String> {
    let tokens = get_path_tokens(app)?;
    let mut s = req.template;
    s = s.replace("{home}", &tokens.home.to_string_lossy());
    s = s.replace("{copilot_home}", &tokens.copilot_home.to_string_lossy());
    s = s.replace(
        "{claude_desktop_config}",
        &tokens.claude_desktop_config.to_string_lossy(),
    );
    s = s.replace("{appdata}", &tokens.app_data.to_string_lossy());
    if let Some(project) = req.project {
        s = s.replace("{project}", &project);
    } else if s.contains("{project}") {
        return Err(AppError::Invalid("template requires project".into()));
    }
    Ok(s)
}
