use std::fs::{self, File, OpenOptions, TryLockError};
use std::io;
use std::path::{Component, Path, PathBuf};

use rusqlite::{Connection, OptionalExtension};
use scrb_transcript::Transcript;
use serde_json::{Map, Value};

use crate::database::open_databases;
use crate::delete::finish_deletes;
use crate::folder::create_meeting_folder;
use crate::index::add_to_index;
use crate::os;
use crate::safe_write::{remove_temp_files, write_file_safely};
use crate::{LibraryError, MeetingFile, MeetingId, NewMeeting};

pub(crate) const MEETINGS_FOLDER: &str = "meetings";
pub(crate) const MEETING_FILE: &str = "meeting.json";
pub(crate) const TRANSCRIPT_FILE: &str = "transcript.json";
const LOCK_FILE: &str = "scrb.lock";

/// An open library folder. While it lives it holds the library lock, so a second core cannot
/// open the same folder.
pub struct Library {
    pub(crate) root: PathBuf,
    // Fields drop in order, so the connection closes before the lock is released.
    pub(crate) connection: Connection,
    damaged_files: Vec<PathBuf>,
    _lock: File,
}

impl Library {
    /// Opens the library at `root`, making its folders and databases on first use.
    ///
    /// It takes the library lock first, then removes what a crash left behind, which is temporary
    /// files of safe writes and meeting folders a create left empty, then opens the databases and
    /// finishes each delete a crash stopped. It does not rebuild the index, so call
    /// [`Library::rebuild_index`] next. `now` names any damaged database it sets aside.
    pub fn open(root: &Path, now: &str) -> Result<Self, LibraryError> {
        fs::create_dir_all(root)?;
        let lock = take_lock(root)?;
        fs::create_dir_all(root.join(MEETINGS_FOLDER))?;
        remove_leftovers(root)?;
        let (connection, damaged_files) = open_databases(root, now)?;
        finish_deletes(&connection, root)?;
        Ok(Self {
            root: root.to_owned(),
            connection,
            damaged_files,
            _lock: lock,
        })
    }

    /// The databases [`Library::open`] found damaged, under their new names. When
    /// `library.sqlite` is among them, the settings were reset.
    pub fn damaged_files(&self) -> &[PathBuf] {
        &self.damaged_files
    }

    /// Makes a meeting's folder with its `meeting.json` and an empty `transcript.json`, adds it
    /// to the index, and returns the folder.
    pub fn create_meeting(&mut self, meeting: &NewMeeting) -> Result<PathBuf, LibraryError> {
        let meetings = self.root.join(MEETINGS_FOLDER);
        let name = create_meeting_folder(&meetings, &meeting.date, &meeting.title)?;
        let folder = meetings.join(&name);
        // The new folder is already made, so a `meetings/` that cannot be flushed does not fail the
        // create, as in a safe write.
        let _ = os::sync_folder(&meetings);
        let file = MeetingFile::starting(meeting);
        write_file_safely(
            &folder.join(MEETING_FILE),
            &serde_json::to_vec_pretty(&file)?,
        )?;
        let transcript = Transcript::new(meeting.id.as_str());
        let bytes = serde_json::to_vec_pretty(&transcript)?;
        write_file_safely(&folder.join(TRANSCRIPT_FILE), &bytes)?;
        add_to_index(&self.connection, &meetings, &name)?;
        Ok(folder)
    }

    /// Replaces the meeting's `transcript.json` with a safe write and updates its index row.
    /// When `meeting.json` cannot be read, the row keeps its old values until the next rebuild.
    pub fn save_transcript(
        &mut self,
        id: &MeetingId,
        transcript: &Transcript,
    ) -> Result<(), LibraryError> {
        let name = self.folder_name(id)?;
        let meetings = self.root.join(MEETINGS_FOLDER);
        let meeting_file = read_own_meeting_file(&meetings.join(&name), id)?;
        let bytes = serde_json::to_vec_pretty(transcript)?;
        write_file_safely(&meetings.join(&name).join(TRANSCRIPT_FILE), &bytes)?;
        if meeting_file.is_some() {
            add_to_index(&self.connection, &meetings, &name)?;
        }
        Ok(())
    }

    /// The meeting's folder name from the index.
    ///
    /// Fails with `NotFound` when the row is gone, so a job that ends after a delete cannot bring
    /// the folder back, and with `UnsafeFolder` when the name could lead out of `meetings/`.
    pub(crate) fn folder_name(&self, id: &MeetingId) -> Result<String, LibraryError> {
        let name: Option<String> = self
            .connection
            .query_row(
                "SELECT folder FROM idx.meetings WHERE id = ?1",
                [id.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        let name = name.ok_or_else(|| LibraryError::NotFound(id.clone()))?;
        let mut parts = Path::new(&name).components();
        let is_plain = matches!(parts.next(), Some(Component::Normal(_)))
            && parts.next().is_none()
            && !name.starts_with('.');
        if is_plain {
            Ok(name)
        } else {
            Err(LibraryError::UnsafeFolder(name))
        }
    }

    /// The saved settings, each a JSON value under its `AppSettings` field name.
    pub fn settings(&self) -> Result<Map<String, Value>, LibraryError> {
        let mut statement = self
            .connection
            .prepare("SELECT key, value FROM main.settings")?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, row.get::<_, String>(1)?)))?;
        let mut settings = Map::new();
        for row in rows {
            let (key, value) = row?;
            settings.insert(key, serde_json::from_str(&value)?);
        }
        Ok(settings)
    }

    /// Saves each field in `changes` over its old value, all in one transaction, and keeps the
    /// fields it does not name.
    pub fn update_settings(&mut self, changes: &Map<String, Value>) -> Result<(), LibraryError> {
        let transaction = self.connection.transaction()?;
        for (key, value) in changes {
            transaction.execute(
                "INSERT INTO main.settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT (key) DO UPDATE SET value = excluded.value",
                (key, value.to_string()),
            )?;
        }
        transaction.commit()?;
        Ok(())
    }
}

/// The `meeting.json` in `folder`, or `None` when it cannot be read.
///
/// Fails with `NotFound` when it names another meeting, as after a change outside the app, so a
/// save or delete never reaches that meeting's files. An unreadable file does not stop the
/// caller, since the rebuild keeps that folder's index row.
pub(crate) fn read_own_meeting_file(
    folder: &Path,
    id: &MeetingId,
) -> Result<Option<MeetingFile>, LibraryError> {
    let Ok(bytes) = fs::read(folder.join(MEETING_FILE)) else {
        return Ok(None);
    };
    match serde_json::from_slice::<MeetingFile>(&bytes) {
        Ok(file) if file.id != *id => Err(LibraryError::NotFound(id.clone())),
        Ok(file) => Ok(Some(file)),
        Err(_) => Ok(None),
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
