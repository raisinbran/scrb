use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::Duration;

use rusqlite::{Connection, OptionalExtension};

use crate::index::from_name;
use crate::library::{MEETING_FILE, MEETINGS_FOLDER, read_own_meeting_file};
use crate::os;
use crate::safe_write::rename_when_free;
use crate::{Library, LibraryError, MeetingFile, MeetingId, MeetingStatus};

/// The start of a meeting folder's name while its delete runs, followed by the meeting id.
const DELETING_PREFIX: &str = ".deleting-";
/// Holds files made from a meeting that can be thrown away, such as waveform peaks.
const CACHE_FOLDER: &str = "cache";
/// How many times a removal is tried again while another program holds a file.
const REMOVE_RETRIES: u32 = 6;

/// What the check at the end of a delete found.
#[derive(Debug, PartialEq)]
pub struct DeleteReport {
    /// False when the check found something left.
    pub verified: bool,
    /// Plain words for each thing left, such as `the meeting's cached files`.
    pub remaining: Vec<String>,
}

impl Library {
    /// Deletes the meeting's folder, its index row and `cache/<id>/`, then checks that nothing is
    /// left.
    ///
    /// Refuses with `Conflict` while the meeting is `recording`, `paused`, `importing` or
    /// `finalPassRunning`. The core checks that no job for it is queued or running. The folder is
    /// first renamed to `meetings/.deleting-<id>`, and a failure before that rename changes
    /// nothing. After it the meeting is gone from the list, and a crash leaves a folder the next
    /// [`Library::open`] finishes.
    pub fn delete_meeting(&mut self, id: &MeetingId) -> Result<DeleteReport, LibraryError> {
        let name = self.folder_name(id)?;
        let meetings = self.root.join(MEETINGS_FOLDER);
        let folder = meetings.join(&name);
        let status = match read_own_meeting_file(&folder, id)? {
            Some(file) => file.status,
            None => self.connection.query_row(
                "SELECT status FROM idx.meetings WHERE id = ?1",
                [id.as_str()],
                |row| from_name(row, 0),
            )?,
        };
        if matches!(
            status,
            MeetingStatus::Recording
                | MeetingStatus::Paused
                | MeetingStatus::Importing
                | MeetingStatus::FinalPassRunning
        ) {
            return Err(LibraryError::Conflict(status));
        }

        rename_when_free(&folder, &deleting_folder(&self.root, id))?;
        let _ = os::sync_folder(&meetings);
        remove_meeting_rows(&self.connection, id)?;
        remove_meeting_files(&self.root, id);
        Ok(check_nothing_left(&self.connection, &self.root, id))
    }
}

/// Finishes each delete a crash stopped after its rename. For each `meetings/.deleting-<id>`
/// folder, the index row goes, then the folder and `cache/<id>/`.
///
/// Only names with a meeting id after `.deleting-` are touched. A folder that cannot be removed
/// stays until the next open.
pub(crate) fn finish_deletes(connection: &Connection, root: &Path) -> Result<(), LibraryError> {
    for entry in fs::read_dir(root.join(MEETINGS_FOLDER))?.flatten() {
        let name = entry.file_name();
        let id = name
            .to_str()
            .and_then(|name| name.strip_prefix(DELETING_PREFIX));
        let Some(id) = id.and_then(|id| id.parse::<MeetingId>().ok()) else {
            continue;
        };
        remove_meeting_rows(connection, &id)?;
        remove_meeting_files(root, &id);
    }
    Ok(())
}

/// Where the meeting's folder is while its delete runs.
fn deleting_folder(root: &Path, id: &MeetingId) -> PathBuf {
    let name = format!("{DELETING_PREFIX}{}", id.as_str());
    root.join(MEETINGS_FOLDER).join(name)
}

/// The meeting's folder of files that can be thrown away.
fn cache_folder(root: &Path, id: &MeetingId) -> PathBuf {
    root.join(CACHE_FOLDER).join(id.as_str())
}

/// Removes the meeting's index row. Running it again changes nothing.
fn remove_meeting_rows(connection: &Connection, id: &MeetingId) -> rusqlite::Result<()> {
    connection.execute("DELETE FROM idx.meetings WHERE id = ?1", [id.as_str()])?;
    Ok(())
}

/// Removes the `.deleting-<id>` folder and `cache/<id>/`. What cannot be removed stays, and
/// [`check_nothing_left`] reports it.
fn remove_meeting_files(root: &Path, id: &MeetingId) {
    for folder in [deleting_folder(root, id), cache_folder(root, id)] {
        let _ = remove_folder_when_free(&folder);
    }
}

/// Removes `folder` with everything in it, waiting a little longer after each failure while
/// another program holds a file. A missing folder counts as removed. A symlink is removed, not
/// the folder it points to.
fn remove_folder_when_free(folder: &Path) -> io::Result<()> {
    let mut wait = Duration::from_millis(10);
    for _ in 0..REMOVE_RETRIES {
        match fs::remove_dir_all(folder) {
            Err(error) if os::is_held_by_another_program(&error) => {
                thread::sleep(wait);
                wait *= 2;
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            other => return other,
        }
    }
    fs::remove_dir_all(folder)
}

/// Looks for anything of the meeting a delete left, such as its `.deleting-` folder, its cached
/// files, its index row, or another folder whose `meeting.json` has its id. A place that cannot
/// be checked counts as left.
fn check_nothing_left(connection: &Connection, root: &Path, id: &MeetingId) -> DeleteReport {
    let mut remaining = Vec::new();
    if !matches!(deleting_folder(root, id).try_exists(), Ok(false)) {
        remaining.push("the meeting's folder".to_owned());
    }
    if !matches!(cache_folder(root, id).try_exists(), Ok(false)) {
        remaining.push("the meeting's cached files".to_owned());
    }
    let row = connection
        .query_row(
            "SELECT 1 FROM idx.meetings WHERE id = ?1",
            [id.as_str()],
            |_| Ok(()),
        )
        .optional();
    if !matches!(row, Ok(None)) {
        remaining.push("the meeting's entry in the meeting list".to_owned());
    }
    match folders_holding(&root.join(MEETINGS_FOLDER), id) {
        Ok(names) => remaining.extend(
            names
                .into_iter()
                .map(|name| format!("a copy of the meeting in the folder {name:?}")),
        ),
        Err(_) => remaining.push("the meetings folder, which could not be checked".to_owned()),
    }
    DeleteReport {
        verified: remaining.is_empty(),
        remaining,
    }
}

/// The folders under `meetings/` whose `meeting.json` has `id`, such as a copy made outside the
/// app. Names that start with a dot are left out.
fn folders_holding(meetings: &Path, id: &MeetingId) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    for entry in fs::read_dir(meetings)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let Ok(bytes) = fs::read(entry.path().join(MEETING_FILE)) else {
            continue;
        };
        if serde_json::from_slice::<MeetingFile>(&bytes).is_ok_and(|file| file.id == *id) {
            names.push(name);
        }
    }
    Ok(names)
}
