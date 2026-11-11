use std::{fmt, io};

use crate::{MeetingId, MeetingStatus};

/// Why a library step failed.
#[derive(Debug)]
pub enum LibraryError {
    /// Another core holds the library lock.
    Busy,
    /// A database a newer app wrote. Holds the file name. The file is left unchanged.
    NewerSchema(&'static str),
    /// Not a meeting id. Holds the text.
    InvalidMeetingId(String),
    /// A meeting date that does not start with `YYYY-MM-DD`. Holds the date.
    InvalidDate(String),
    /// The index has no meeting with this id, so it was deleted or never made. Also returned
    /// when the indexed folder's `meeting.json` names another meeting.
    NotFound(MeetingId),
    /// The index names a folder that is not one plain name under `meetings/`, such as
    /// `../outside`. Nothing is read or written there. Holds the name.
    UnsafeFolder(String),
    /// A delete was refused, because the meeting is still being recorded or made. Holds its
    /// status.
    Conflict(MeetingStatus),
    Io(io::Error),
    Database(rusqlite::Error),
    Json(serde_json::Error),
}

impl fmt::Display for LibraryError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Busy => write!(f, "A previous recording is being finished."),
            Self::NewerSchema(file) => {
                write!(
                    f,
                    "{file} was made by a newer Meeting Scribe. Update the app."
                )
            }
            Self::InvalidMeetingId(text) => write!(f, "{text:?} is not a meeting id."),
            Self::InvalidDate(date) => write!(f, "{date:?} is not a date."),
            Self::NotFound(_) => write!(f, "That meeting is no longer in the library."),
            Self::UnsafeFolder(name) => write!(f, "The index names an unsafe folder {name:?}."),
            Self::Conflict(_) => write!(f, "The meeting is still being recorded or processed."),
            Self::Io(error) => write!(f, "The library folder could not be used: {error}"),
            Self::Database(error) => write!(f, "A library database failed: {error}"),
            Self::Json(error) => write!(f, "A library JSON file failed: {error}"),
        }
    }
}

impl std::error::Error for LibraryError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Database(error) => Some(error),
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

impl From<rusqlite::Error> for LibraryError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error)
    }
}

impl From<serde_json::Error> for LibraryError {
    fn from(error: serde_json::Error) -> Self {
        Self::Json(error)
    }
}
