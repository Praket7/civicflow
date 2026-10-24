//! CivicFlow core: authoritative domain rules, SQLite persistence, and read
//! models. The Tauri command layer is a thin wrapper over this crate so the same
//! behaviour is testable without a webview.

pub mod auth;
pub mod backups;
pub mod db;
pub mod domain;
pub mod error;
pub mod matching;
pub mod models;
pub mod reports;
pub mod roster;
pub mod services;
pub mod workflows;

pub use db::{Database, DEMO_SEED};
pub use error::{CoreError, Result};
