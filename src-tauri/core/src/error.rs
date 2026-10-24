use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    #[error("database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("file error: {0}")]
    Io(#[from] std::io::Error),
    #[error("seed data is invalid: {0}")]
    Seed(#[from] serde_json::Error),
    #[error("datetime could not be parsed: {0}")]
    DateTime(#[from] chrono::ParseError),
    #[error("workspace is invalid: {0}")]
    Data(String),
    #[error("{0}")]
    Validation(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("{message}")]
    Rule {
        code: String,
        message: String,
        field: Option<String>,
        action: Option<String>,
    },
}

impl CoreError {
    pub fn rule(
        code: impl Into<String>,
        message: impl Into<String>,
        field: Option<String>,
        action: Option<String>,
    ) -> Self {
        Self::Rule {
            code: code.into(),
            message: message.into(),
            field,
            action,
        }
    }
}

/// Structured error returned to TypeScript. Keeping `code`, `field` and
/// `action` means the UI can offer a recovery path instead of a generic toast.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action: Option<String>,
}

impl From<CoreError> for AppError {
    fn from(error: CoreError) -> Self {
        match error {
            CoreError::Rule {
                code,
                message,
                field,
                action,
            } => Self {
                code,
                message,
                field,
                action,
            },
            CoreError::Validation(message) => Self {
                code: "VALIDATION".into(),
                message,
                field: None,
                action: None,
            },
            CoreError::NotFound(message) => Self {
                code: "NOT_FOUND".into(),
                message,
                field: None,
                action: None,
            },
            CoreError::Database(error) => Self {
                code: "DATABASE".into(),
                message: format!("The workspace database could not complete that action: {error}"),
                field: None,
                action: None,
            },
            other => Self {
                code: "INTERNAL".into(),
                message: other.to_string(),
                field: None,
                action: None,
            },
        }
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
