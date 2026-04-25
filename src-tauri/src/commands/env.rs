use crate::error::AppResult;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct EnvRequest {
    pub names: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct EnvVar {
    pub name: String,
    pub value: Option<String>,
    pub masked: bool,
    pub set: bool,
}

fn is_secret(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.contains("key")
        || lower.contains("token")
        || lower.contains("secret")
        || lower.contains("password")
}

fn mask(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let visible = 4.min(trimmed.len() / 4);
    let head: String = trimmed.chars().take(visible).collect();
    let tail: String = trimmed
        .chars()
        .rev()
        .take(visible)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect();
    format!("{}{}{}", head, "•".repeat(8), tail)
}

#[tauri::command]
pub fn read_env_vars(req: EnvRequest) -> AppResult<Vec<EnvVar>> {
    let mut out = Vec::with_capacity(req.names.len());
    for name in req.names {
        match std::env::var(&name) {
            Ok(value) => {
                let masked = is_secret(&name);
                let value = if masked { mask(&value) } else { value };
                out.push(EnvVar {
                    name,
                    value: Some(value),
                    masked,
                    set: true,
                });
            }
            Err(_) => out.push(EnvVar {
                name,
                value: None,
                masked: false,
                set: false,
            }),
        }
    }
    Ok(out)
}
