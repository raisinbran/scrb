//! Meeting Scribe v3, with the meeting library, transcript files and the `scrb` command line.
//!
//! Read [`library::Library`] first, then [`transcript`], then [`cli::run`].

pub mod cli;
pub mod dev;
pub mod library;
pub mod transcript;

use std::fmt::Display;
use std::path::Path;

use serde::Serialize;

/// A failure that a command reports as its error result.
#[derive(Debug)]
pub struct Error {
    pub code: ErrorCode,
    pub message: String,
}

/// Stable error codes. Tests and agents match on these, never on the message.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Another writer holds the lock.
    Busy,
    /// `fix_passage` expected text that the segment no longer holds.
    Stale,
    NotFound,
    /// The meeting's state does not allow this move.
    BadState,
    /// The command line could not be parsed, or names an export file inside
    /// the library folder. The exit code is 2.
    Usage,
    /// A file could not be read or written, or holds broken JSON.
    Internal,
}

impl Error {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Error {
        Error {
            code,
            message: message.into(),
        }
    }

    /// An `internal` error that names the file that failed.
    pub fn file(path: &Path, cause: impl Display) -> Error {
        Error::new(ErrorCode::Internal, format!("{}: {cause}", path.display()))
    }
}
