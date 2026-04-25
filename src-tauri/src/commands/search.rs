use crate::error::{AppError, AppResult};
use grep_matcher::Matcher;
use grep_regex::RegexMatcherBuilder;
use grep_searcher::sinks::UTF8;
use grep_searcher::SearcherBuilder;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
pub struct SearchRequest {
    pub query: String,
    pub paths: Vec<String>,
    pub case_insensitive: Option<bool>,
    pub regex: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub path: String,
    pub line: u64,
    pub text: String,
}

#[tauri::command]
pub fn search_files(req: SearchRequest) -> AppResult<Vec<SearchHit>> {
    let pattern = if req.regex.unwrap_or(false) {
        req.query.clone()
    } else {
        regex_escape(&req.query)
    };
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(req.case_insensitive.unwrap_or(true))
        .build(&pattern)
        .map_err(|e| AppError::Search(e.to_string()))?;
    let mut searcher = SearcherBuilder::new().line_number(true).build();

    let mut hits = Vec::new();
    for raw in &req.paths {
        let path = PathBuf::from(raw);
        if !path.exists() || !path.is_file() {
            continue;
        }
        let path_str = path.to_string_lossy().to_string();
        let result = searcher.search_path(
            &matcher,
            &path,
            UTF8(|line_number, line| {
                if matcher.is_match(line.as_bytes()).unwrap_or(false) {
                    hits.push(SearchHit {
                        path: path_str.clone(),
                        line: line_number,
                        text: line.trim_end().to_string(),
                    });
                }
                Ok(true)
            }),
        );
        if let Err(e) = result {
            eprintln!("search error for {}: {}", path_str, e);
        }
    }
    Ok(hits)
}

fn regex_escape(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if "\\.+*?()[]{}|^$".contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
