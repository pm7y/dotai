use serde::{Serialize, Serializer};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("path resolution failed: {0}")]
    Path(String),

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("watch error: {0}")]
    Watch(String),

    #[error("search error: {0}")]
    Search(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = std::result::Result<T, AppError>;
