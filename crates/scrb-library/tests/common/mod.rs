//! Helpers for the library tests. Each test opens its library in a temporary folder of its own.

// Each test file uses only some of these helpers.
#![allow(dead_code)]

use std::fs;
use std::path::{Path, PathBuf};

use scrb_library::{MeetingId, NewMeeting, Origin};

/// The time every test opens its library and creates its meetings at.
pub const NOW: &str = "2026-11-11T09:00:00Z";

/// A temporary folder that is removed when the test ends. Declare it before the library, so the
/// library closes first and releases its lock and its databases.
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

/// Sets `status` in the `meeting.json` in `folder`, as recording or the final pass would.
pub fn set_status(folder: &Path, status: &str) {
    let path = folder.join("meeting.json");
    let mut file: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    file["status"] = status.into();
    fs::write(&path, serde_json::to_vec(&file).unwrap()).unwrap();
}

/// Every file and folder under `folder` with each file's bytes, sorted by path.
pub fn snapshot(folder: &Path) -> Vec<(PathBuf, Vec<u8>)> {
    let mut files = Vec::new();
    for entry in fs::read_dir(folder).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            files.push((path.clone(), Vec::new()));
            files.extend(snapshot(&path));
        } else {
            files.push((path.clone(), fs::read(&path).unwrap()));
        }
    }
    files.sort();
    files
}
