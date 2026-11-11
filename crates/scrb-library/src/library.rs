use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::{Path, PathBuf};

use scrb_transcript::Transcript;

use crate::folder::create_meeting_folder;
use crate::os;
use crate::safe_write::{remove_temp_files, write_file_safely};
use crate::{LibraryError, MeetingFile, NewMeeting};

const MEETINGS_FOLDER: &str = "meetings";
const LOCK_FILE: &str = "scrb.lock";

/// An open library folder. While it lives it holds the library lock, so a second core cannot
/// open the same folder.
pub struct Library {
    root: PathBuf,
    _lock: File,
}

impl Library {
    /// Opens the library at `root`, making its folders on first use.
    ///
    /// It takes the library lock first, then removes what a crash left behind, which is temporary
    /// files of safe writes and meeting folders a create left empty.
    pub fn open(root: &Path) -> Result<Self, LibraryError> {
        fs::create_dir_all(root)?;
        let lock = take_lock(root)?;
        fs::create_dir_all(root.join(MEETINGS_FOLDER))?;
        remove_leftovers(root)?;
        Ok(Self {
            root: root.to_owned(),
            _lock: lock,
        })
    }

    /// Makes a meeting's folder with its `meeting.json` and an empty `transcript.json`, and
    /// returns the folder.
    pub fn create_meeting(&mut self, meeting: &NewMeeting) -> Result<PathBuf, LibraryError> {
        let meetings = self.root.join(MEETINGS_FOLDER);
        let folder = meetings.join(create_meeting_folder(
            &meetings,
            &meeting.date,
            &meeting.title,
        )?);
        // The new folder is already made, so a `meetings/` that cannot be flushed does not fail the
        // create, as in a safe write.
        let _ = os::sync_folder(&meetings);
        let file = MeetingFile::starting(meeting);
        write_file_safely(
            &folder.join("meeting.json"),
            &serde_json::to_vec_pretty(&file)?,
        )?;
        let transcript = Transcript::new(meeting.id.as_str());
        let bytes = serde_json::to_vec_pretty(&transcript)?;
        write_file_safely(&folder.join("transcript.json"), &bytes)?;
        Ok(folder)
    }
}

/// Takes the exclusive lock on `scrb.lock`, or fails with `Busy` at once when another core
/// holds it. The core decides how long to keep trying.
fn take_lock(root: &Path) -> Result<File, LibraryError> {
    let file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(root.join(LOCK_FILE))?;
    match file.try_lock() {
        Ok(()) => Ok(file),
        Err(TryLockError::WouldBlock) => Err(LibraryError::Busy),
        Err(TryLockError::Error(error)) => Err(error.into()),
    }
}

/// Removes temporary files from the library folder and each meeting folder, and meeting folders
/// left empty by a crash between making the folder and writing its `meeting.json`.
///
/// Only failing to list the library folder or `meetings/` is an error. Any other entry that
/// cannot be read or removed is skipped, so one file that antivirus or a sync client holds cannot
/// stop the library from opening.
fn remove_leftovers(root: &Path) -> io::Result<()> {
    remove_temp_files(root)?;
    for entry in fs::read_dir(root.join(MEETINGS_FOLDER))?.flatten() {
        let is_folder = entry.file_type().is_ok_and(|kind| kind.is_dir());
        if !is_folder || entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        let folder = entry.path();
        if remove_temp_files(&folder).is_ok() {
            // `remove_dir` refuses a folder that is not empty, so a folder with audio but no
            // `meeting.json` stays.
            let _ = fs::remove_dir(&folder);
        }
    }
    Ok(())
}
