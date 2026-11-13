//! Meeting Scribe v3, with the meeting library, transcript files and the `scrb` command line.
//!
//! Read [`library::Library`] first, then [`transcript`], then [`pass`] and
//! [`engine`], then [`cli::run`].

pub mod audio;
pub mod cli;
pub mod dev;
pub mod engine;
pub mod library;
pub mod pass;
pub mod transcript;

use std::fmt::Display;
use std::path::Path;

use serde::Serialize;

/// A failure that a command reports as its error result.
#[derive(Debug)]
pub struct Error {
    pub code: ErrorCode,
    pub message: String,
    /// The meeting a failed `scrb transcribe` made or ran, so it can be run
    /// again by id.
    pub meeting_id: Option<String>,
    /// A command that may fix the failure, such as `run scrb models fetch`.
    pub hint: Option<String>,
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
    /// The command line could not be parsed, or names an output file inside
    /// the library folder or one that is the input file. The exit code is 2.
    Usage,
    /// A file could not be read or written, or holds broken JSON.
    Internal,
    /// An audio file is not WAV or FLAC, or cannot be decoded.
    BadAudio,
    /// The engine worker gave an error reply, or failed a request twice by
    /// dying, hanging or writing a malformed line.
    EngineFailed,
}

impl Error {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Error {
        Error {
            code,
            message: message.into(),
            meeting_id: None,
            hint: None,
        }
    }

    /// This error, with `hint` in its result.
    pub fn with_hint(self, hint: &str) -> Error {
        Error {
            hint: Some(hint.to_string()),
            ..self
        }
    }

    /// This error, naming meeting `id` in its result.
    pub fn with_meeting_id(self, id: &str) -> Error {
        Error {
            meeting_id: Some(id.to_string()),
            ..self
        }
    }

    /// An `internal` error that names the file that failed.
    pub fn file(path: &Path, cause: impl Display) -> Error {
        Error::new(ErrorCode::Internal, format!("{}: {cause}", path.display()))
    }
}
