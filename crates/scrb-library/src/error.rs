use std::{fmt, io};

/// Why a library step failed.
#[derive(Debug)]
pub enum LibraryError {
    /// Another core holds the library lock.
    Busy,
    /// Not a meeting id. Holds the text.
    InvalidMeetingId(String),
    /// A meeting date that does not start with `YYYY-MM-DD`. Holds the date.
    InvalidDate(String),
    Io(io::Error),
    Json(serde_json::Error),
}

impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Busy => write!(f, "A previous recording is being finished."),
            Self::InvalidMeetingId(text) => write!(f, "{text:?} is not a meeting id."),
            Self::InvalidDate(date) => write!(f, "{date:?} is not a date."),
            Self::Io(error) => write!(f, "The library folder could not be used: {error}"),
            Self::Json(error) => write!(f, "A library JSON file failed: {error}"),
        }
    }
}

impl std::error::Error for LibraryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Json(error) => Some(error),
            _ => None,
        }
    }
}

impl From<io::Error> for LibraryError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<serde_json::Error> for LibraryError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}
