use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::types::Type;
use rusqlite::{Connection, Row, params};
use scrb_transcript::Transcript;
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::library::{MEETING_FILE, MEETINGS_FOLDER, TRANSCRIPT_FILE};
use crate::{Library, LibraryError, MeetingFile, MeetingId, MeetingStatus, Origin};

const SUMMARY_FILE: &str = "summary.json";

/// One meeting in the meeting list, as the index holds it. It holds no transcript text.
#[derive(Debug, Clone, PartialEq)]
pub struct IndexedMeeting {
    pub id: MeetingId,
    /// The folder's name under `meetings/`.
    pub folder: String,
    pub title: String,
    pub date: String,
    pub created_at: String,
    pub duration_ms: u64,
    pub origin: Origin,
    pub status: MeetingStatus,
    /// `notGenerated` until summaries are built.
    pub summary_state: String,
    /// The speakers in `transcript.json` that were not merged into another.
    pub speaker_count: u32,
    pub audio_deleted_at: Option<String>,
}

/// Folders a rebuild could not list as their own meeting, for the screens to report.
#[derive(Debug, Default, PartialEq)]
pub struct RebuildReport {
    /// Folders whose `meeting.json` repeats the id of a folder that stays in the index.
    pub duplicates: Vec<String>,
    /// Folders with no readable `meeting.json`. They are left alone, since they may hold audio,
    /// and one the index already knows keeps its row.
    pub unreadable: Vec<String>,
}

impl Library {
    /// The meeting list, newest date first.
    pub fn meetings(&self) -> Result<Vec<IndexedMeeting>, LibraryError> {
        let mut statement = self.connection.prepare(
            "SELECT id, folder, title, date, created_at, duration_ms, origin, status,
                    summary_state, speaker_count, audio_deleted_at
             FROM idx.meetings ORDER BY date DESC, created_at DESC, id",
        )?;
        let rows = statement.query_map([], meeting_from_row)?;
        Ok(rows.collect::<Result<_, _>>()?)
    }

    /// Makes the index match the meeting folders. It adds rows for new folders, updates rows
    /// whose files changed, and removes rows whose folder is gone or now holds another meeting's
    /// id. A folder that is still there but cannot be read keeps its row and is reported.
    ///
    /// It only reads the folders, and reads a folder's files again only when their sizes or
    /// modified times differ from the last read. When `meetings/` cannot be listed, it fails before
    /// changing any row, so an unreachable network folder does not empty the list.
    pub fn rebuild_index(&mut self) -> Result<RebuildReport, LibraryError> {
        let meetings = self.root.join(MEETINGS_FOLDER);
        let folders = list_meeting_folders(&meetings)?;
        let known = self.known_folders()?;
        // Each folder with its id when the index knows it and its files are unchanged.
        let mut folders: Vec<(String, Option<String>)> = folders
            .into_iter()
            .map(|name| {
                let unchanged = known
                    .get(&name)
                    .filter(|(_, seen)| *seen == files_seen(&meetings.join(&name)))
                    .map(|(id, _)| id.clone());
                (name, unchanged)
            })
            .collect();
        // Known folders with unchanged files go first, then known folders whose files changed,
        // then new ones, so of two folders with one id, the copy is the one left out.
        folders.sort_by_key(|(name, unchanged)| {
            (unchanged.is_none(), !known.contains_key(name), name.clone())
        });

        let mut report = RebuildReport::default();
        let mut kept_ids = HashSet::new();
        let mut changed = Vec::new();
        for (name, unchanged) in folders {
            let folder = meetings.join(&name);
            let (id, row) = match unchanged {
                Some(id) => (id, None),
                None => match read_folder(&folder, &name) {
                    Ok(row) => (row.meeting.id.as_str().to_owned(), Some(row)),
                    Err(_) => {
                        // A known folder keeps its row while it cannot be read, such as while a
                        // sync client writes its `meeting.json`. An unknown empty folder, such as
                        // one a crash left during a create, holds nothing to report.
                        if let Some((id, _)) = known.get(&name) {
                            kept_ids.insert(id.clone());
                            report.unreadable.push(name);
                        } else if !is_empty_folder(&folder) {
                            report.unreadable.push(name);
                        }
                        continue;
                    }
                },
            };
            if !kept_ids.insert(id) {
                report.duplicates.push(name);
                continue;
            }
            changed.extend(row);
        }

        let transaction = self.connection.transaction()?;
        for (id, _) in known.values() {
            if !kept_ids.contains(id) {
                transaction.execute("DELETE FROM idx.meetings WHERE id = ?1", [id])?;
            }
        }
        for row in &changed {
            save_row(&transaction, row)?;
        }
        transaction.commit()?;
        Ok(report)
    }

    /// Each indexed folder name with its meeting id and `files_seen`.
    fn known_folders(&self) -> Result<HashMap<String, (String, String)>, LibraryError> {
        let mut statement = self
            .connection
            .prepare("SELECT folder, id, files_seen FROM idx.meetings")?;
        let rows = statement.query_map([], |row| Ok((row.get(0)?, (row.get(1)?, row.get(2)?))))?;
        Ok(rows.collect::<Result<_, _>>()?)
    }
}

/// Reads the folder `name` under `meetings` and saves its index row.
pub(crate) fn add_to_index(
    connection: &Connection,
    meetings: &Path,
    name: &str,
) -> Result<(), LibraryError> {
    let row = read_folder(&meetings.join(name), name)?;
    save_row(connection, &row)?;
    Ok(())
}

/// A meeting folder as one index row.
struct FolderRow {
    meeting: IndexedMeeting,
    files_seen: String,
}

/// Reads one meeting folder. A missing or unreadable `transcript.json` counts as no speakers,
/// so the meeting still shows in the list.
fn read_folder(folder: &Path, name: &str) -> Result<FolderRow, LibraryError> {
    let files_seen = files_seen(folder);
    let file: MeetingFile = serde_json::from_slice(&fs::read(folder.join(MEETING_FILE))?)?;
    let speaker_count = fs::read(folder.join(TRANSCRIPT_FILE))
        .ok()
        .and_then(|bytes| serde_json::from_slice::<Transcript>(&bytes).ok())
        .map_or(0, |transcript| {
            let speakers = transcript.speakers.iter();
            speakers
                .filter(|speaker| speaker.merged_into.is_none())
                .count() as u32
        });
    let meeting = IndexedMeeting {
        id: file.id,
        folder: name.to_owned(),
        title: file.title,
        date: file.date,
        created_at: file.created_at,
        duration_ms: file.duration_ms,
        origin: file.origin,
        status: file.status,
        summary_state: "notGenerated".to_owned(),
        speaker_count,
        audio_deleted_at: file.audio_deleted_at,
    };
    Ok(FolderRow {
        meeting,
        files_seen,
    })
}

/// The size and modified time of the folder's three JSON files, as in
/// `meeting.json 312 1762851600000000000;transcript.json -;summary.json -`.
fn files_seen(folder: &Path) -> String {
    let seen: Vec<String> = [MEETING_FILE, TRANSCRIPT_FILE, SUMMARY_FILE]
        .iter()
        .map(|name| match fs::metadata(folder.join(name)) {
            Ok(metadata) => {
                let changed = metadata.modified().ok();
                let since_epoch = changed.and_then(|time| time.duration_since(UNIX_EPOCH).ok());
                let nanos = since_epoch.map_or(0, |time| time.as_nanos());
                format!("{name} {} {nanos}", metadata.len())
            }
            Err(_) => format!("{name} -"),
        })
        .collect();
    seen.join(";")
}

/// The names of the folders under `meetings/`, leaving out names that start with a dot, such as
/// `.deleting-<id>`, and names that are not UTF-8, which the index cannot store.
fn list_meeting_folders(meetings: &Path) -> io::Result<Vec<String>> {
    let mut names = Vec::new();
    for entry in fs::read_dir(meetings)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        if let Ok(name) = entry.file_name().into_string()
            && !name.starts_with('.')
        {
            names.push(name);
        }
    }
    Ok(names)
}

/// Whether `folder` holds nothing at all.
fn is_empty_folder(folder: &Path) -> bool {
    fs::read_dir(folder).is_ok_and(|mut entries| entries.next().is_none())
}

/// Adds or replaces the row, including a row of another id that held the same folder.
fn save_row(connection: &Connection, row: &FolderRow) -> rusqlite::Result<()> {
    let meeting = &row.meeting;
    connection.execute(
        "INSERT OR REPLACE INTO idx.meetings (id, folder, title, date, created_at, duration_ms,
             origin, status, summary_state, speaker_count, audio_deleted_at, files_seen)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            meeting.id.as_str(),
            meeting.folder,
            meeting.title,
            meeting.date,
            meeting.created_at,
            meeting.duration_ms,
            name_of(&meeting.origin),
            name_of(&meeting.status),
            meeting.summary_state,
            meeting.speaker_count,
            meeting.audio_deleted_at,
            row.files_seen,
        ],
    )?;
    Ok(())
}

fn meeting_from_row(row: &Row) -> rusqlite::Result<IndexedMeeting> {
    Ok(IndexedMeeting {
        id: from_name(row, 0)?,
        folder: row.get(1)?,
        title: row.get(2)?,
        date: row.get(3)?,
        created_at: row.get(4)?,
        duration_ms: row.get(5)?,
        origin: from_name(row, 6)?,
        status: from_name(row, 7)?,
        summary_state: row.get(8)?,
        speaker_count: row.get(9)?,
        audio_deleted_at: row.get(10)?,
    })
}

/// The name `meeting.json` uses for a value, such as `finalPassRunning`.
fn name_of<T: Serialize>(value: &T) -> String {
    match serde_json::to_value(value) {
        Ok(Value::String(name)) => name,
        _ => String::new(),
    }
}

/// Reads column `column` back from the name [`name_of`] stored.
fn from_name<T: DeserializeOwned>(row: &Row, column: usize) -> rusqlite::Result<T> {
    let name: String = row.get(column)?;
    serde_json::from_value(Value::String(name)).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, error.into())
    })
}
