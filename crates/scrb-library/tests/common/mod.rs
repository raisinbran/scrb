//! Helpers for the library tests. Each test opens its library in a temporary folder of its own.

// Each test file uses only some of these helpers.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

use scrb_library::{MeetingId, NewMeeting, Origin};

/// The time every test creates its meetings at.
pub const NOW: &str = "2026-11-11T09:00:00Z";

/// A temporary folder that is removed when the test ends. Declare it before the library, so the
/// library closes first and releases its lock.
pub struct TempFolder(PathBuf);

impl TempFolder {
    /// A new empty folder under the system's temporary folder, named after `test`.
    pub fn new(test: &str) -> Self {
        let path = std::env::temp_dir().join(format!("scrb-library-{}-{test}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    /// Where the folder is.
    pub fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// The fixed id of test meeting `n`, such as `00000000-0000-4000-8000-000000000001`.
pub fn meeting_id(n: u8) -> MeetingId {
    format!("00000000-0000-4000-8000-{n:012}").parse().unwrap()
}

/// A recording of test meeting `n` with this title, shown on 12 November 2026.
pub fn recording(n: u8, title: &str) -> NewMeeting {
    NewMeeting {
        id: meeting_id(n),
        title: title.to_owned(),
        date: "2026-11-12T09:30:00Z".to_owned(),
        origin: Origin::Recorded,
        now: NOW.to_owned(),
    }
}
