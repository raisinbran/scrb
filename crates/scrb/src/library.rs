//! The library folder holds one folder per meeting, each with its
//! `meeting.json`, plus `settings.json` and `glossary.json` shared by all
//! meetings.
//!
//! Start with [`Library::open`], which also recovers meetings cut off by a
//! crash. Every JSON file is replaced through a safe write, and each writer
//! takes a lock first, so a second writer gets `busy`.

use std::cmp::Reverse;
use std::fs::{self, File, OpenOptions, TryLockError};
use std::io::{self, Read, Seek, SeekFrom, Write};
use std::path::{Component, Path, PathBuf};
use std::thread;
use std::time::Duration;

use jiff::Zoned;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use crate::{Error, ErrorCode};

const MEETING_FILE: &str = "meeting.json";
const LOCK_FILE: &str = ".lock";
const SETTINGS_FILE: &str = "settings.json";
const GLOSSARY_FILE: &str = "glossary.json";
const GLOSSARY_LOCK_FILE: &str = ".glossary.lock";

/// How often a failed rename is tried on Windows, and the wait between tries.
const RENAME_ATTEMPTS: u32 = 5;
const RENAME_RETRY_WAIT: Duration = Duration::from_millis(100);

/// An opened library folder.
#[derive(Debug)]
pub struct Library {
    root: PathBuf,
    cut_off: Vec<String>,
}

/// The contents of a meeting's `meeting.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Meeting {
    pub schema: String,
    pub id: String,
    pub title: Option<String>,
    pub source: Source,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub state: MeetingState,
    pub live: Live,
    pub pass: Option<Pass>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    Recording,
    Import,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MeetingState {
    Recording,
    Recorded,
    Passing,
    Ready,
    Failed,
}

/// Whether the live pass ran during the meeting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Live {
    On,
    Off,
    Failed,
}

/// What the after-meeting pass used and how it ended.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pass {
    pub model: String,
    pub diarizer: Option<String>,
    pub started_at: String,
    pub finished_at: Option<String>,
    /// The error code of a failed pass.
    pub error: Option<String>,
}

/// The contents of `settings.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub schema: String,
    pub mic: String,
    pub model: String,
    pub diarizer: String,
    pub live: LiveSetting,
    pub live_check: Option<LiveCheck>,
}

/// With `auto`, the live pass runs only when the live check decided `on`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveSetting {
    Auto,
    On,
    Off,
}

/// The live speed check that selftest last ran on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LiveCheck {
    pub decision: LiveDecision,
    pub p90_delay_s: f64,
    pub at: String,
    /// The selftest report, relative to the library folder.
    pub selftest: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LiveDecision {
    On,
    Off,
}

/// The contents of `glossary.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Glossary {
    pub schema: String,
    pub terms: Vec<GlossaryTerm>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlossaryTerm {
    pub term: String,
    /// Phrases the speech model writes instead of `term`.
    pub heard_as: Vec<String>,
    pub note: Option<String>,
}

/// A held lock. Dropping it closes the lock file, which releases the lock.
#[derive(Debug)]
pub struct Lock {
    _file: File,
}

impl Library {
    /// Opens the library at `root`, which may not exist yet.
    ///
    /// A `recording` or `passing` meeting whose `.lock` no one holds was cut
    /// off by a crash, so this moves it back to `recorded` and lists it in
    /// [`Library::cut_off`]. The capture helper's `audio/writer.lock` is not
    /// checked yet, because nothing writes `audio/` before the recorder exists.
    pub fn open(root: &Path) -> Result<Library, Error> {
        let mut library = Library {
            root: root.to_path_buf(),
            cut_off: Vec::new(),
        };
        for listed in library.list_meetings()? {
            if !is_recording_or_passing(listed.state) {
                continue;
            }
            let _lock = match library.lock_meeting(&listed.id) {
                Ok(lock) => lock,
                Err(error) if error.code == ErrorCode::Busy => continue,
                Err(error) => return Err(error),
            };
            // A pass may have finished between the listing and the lock.
            let mut meeting = library.read_meeting(&listed.id)?;
            if !is_recording_or_passing(meeting.state) {
                continue;
            }
            meeting.state = MeetingState::Recorded;
            library.write_meeting(&meeting)?;
            library.cut_off.push(meeting.id);
        }
        Ok(library)
    }

    /// Ids of the meetings that [`Library::open`] moved back to `recorded`.
    pub fn cut_off(&self) -> &[String] {
        &self.cut_off
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// All meetings, newest first. Folders without a `meeting.json` are skipped.
    pub fn list_meetings(&self) -> Result<Vec<Meeting>, Error> {
        let entries = match fs::read_dir(&self.root) {
            Ok(entries) => entries,
            Err(cause) if cause.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(cause) => return Err(Error::file(&self.root, cause)),
        };
        let mut meetings: Vec<Meeting> = Vec::new();
        for entry in entries {
            let entry = entry.map_err(|cause| Error::file(&self.root, cause))?;
            let meeting_file = entry.path().join(MEETING_FILE);
            if meeting_file.is_file() {
                meetings.push(read_json(&meeting_file)?);
            }
        }
        // Ids are local start times, so the largest id is the newest meeting.
        meetings.sort_by_key(|meeting| Reverse(meeting.id.clone()));
        Ok(meetings)
    }

    pub fn read_meeting(&self, id: &str) -> Result<Meeting, Error> {
        read_json(&self.meeting_dir(id)?.join(MEETING_FILE))
    }

    /// The folder of meeting `id`. An id that is not a plain folder name,
    /// such as `../x`, is `not_found`.
    pub fn meeting_dir(&self, id: &str) -> Result<PathBuf, Error> {
        let mut parts = Path::new(id).components();
        match (parts.next(), parts.next()) {
            (Some(Component::Normal(_)), None) => Ok(self.root.join(id)),
            _ => Err(Error::new(ErrorCode::NotFound, format!("no meeting {id}"))),
        }
    }

    /// Creates a meeting's folder and `meeting.json`, and returns them with
    /// the meeting's `.lock` held.
    ///
    /// The id is the local start time, with `-2`, `-3` and so on added on a
    /// clash. A `recording` meeting starts in `recording` and an `import` one
    /// in `recorded`. The lock is taken before `meeting.json` is written, so
    /// [`Library::open`] in another process never takes the new meeting for
    /// one cut off by a crash.
    pub fn create_meeting(
        &self,
        source: Source,
        started_at: &Zoned,
    ) -> Result<(Meeting, Lock), Error> {
        fs::create_dir_all(&self.root).map_err(|cause| Error::file(&self.root, cause))?;
        let time_id = started_at.strftime("%Y-%m-%d-%H%M").to_string();
        let mut id = time_id.clone();
        let mut clash_count = 1;
        // `create_dir` fails on an existing folder, so two processes never get the same id.
        loop {
            let dir = self.root.join(&id);
            match fs::create_dir(&dir) {
                Ok(()) => break,
                Err(cause) if cause.kind() == io::ErrorKind::AlreadyExists => {
                    clash_count += 1;
                    id = format!("{time_id}-{clash_count}");
                }
                Err(cause) => return Err(Error::file(&dir, cause)),
            }
        }
        let lock = self.lock_meeting(&id)?;
        let state = match source {
            Source::Recording => MeetingState::Recording,
            Source::Import => MeetingState::Recorded,
        };
        let meeting = Meeting {
            schema: "scrb.meeting.v1".to_string(),
            id,
            title: None,
            source,
            started_at: started_at.strftime("%Y-%m-%dT%H:%M:%S%:z").to_string(),
            ended_at: None,
            state,
            live: Live::Off,
            pass: None,
        };
        self.write_meeting(&meeting)?;
        Ok((meeting, lock))
    }

    /// Moves meeting `id` to `next` and returns the meeting.
    ///
    /// States move only forward, from `recording` to `recorded` to `passing`
    /// to `ready` or `failed`, and from `failed` to `passing` again. The one
    /// way back is `ready` to `passing`, which only `transcribe --force` asks
    /// for. Any other move is `bad_state` and leaves `meeting.json` as it
    /// was. The caller holds the meeting's `.lock`.
    pub fn move_meeting(&self, id: &str, next: MeetingState) -> Result<Meeting, Error> {
        self.move_meeting_and_set_pass(id, next, None)
    }

    /// Moves meeting `id` to `next` as [`Library::move_meeting`] does, and
    /// replaces its `pass` in the same write.
    pub fn move_meeting_with_pass(
        &self,
        id: &str,
        next: MeetingState,
        pass: Pass,
    ) -> Result<Meeting, Error> {
        self.move_meeting_and_set_pass(id, next, Some(pass))
    }

    fn move_meeting_and_set_pass(
        &self,
        id: &str,
        next: MeetingState,
        pass: Option<Pass>,
    ) -> Result<Meeting, Error> {
        let mut meeting = self.read_meeting(id)?;
        if !can_move(meeting.state, next) {
            return Err(Error::new(
                ErrorCode::BadState,
                format!(
                    "meeting {id} is {:?} and cannot move to {next:?}",
                    meeting.state
                ),
            ));
        }
        meeting.state = next;
        if pass.is_some() {
            meeting.pass = pass;
        }
        self.write_meeting(&meeting)?;
        Ok(meeting)
    }

    /// Takes meeting `id`'s `.lock`, which stays held until the returned
    /// [`Lock`] is dropped. Another holder, in this process or another,
    /// makes this `busy`.
    pub fn lock_meeting(&self, id: &str) -> Result<Lock, Error> {
        let dir = self.meeting_dir(id)?;
        if !dir.is_dir() {
            return Err(Error::new(ErrorCode::NotFound, format!("no meeting {id}")));
        }
        lock_file(&dir.join(LOCK_FILE))
    }

    /// The machine settings, or the defaults when `settings.json` does not exist yet.
    pub fn read_settings(&self) -> Result<Settings, Error> {
        read_json_or_default(&self.root.join(SETTINGS_FILE))
    }

    /// The glossary, or an empty one when `glossary.json` does not exist yet.
    pub fn read_glossary(&self) -> Result<Glossary, Error> {
        read_json_or_default(&self.root.join(GLOSSARY_FILE))
    }

    /// Adds `term` to the glossary under a short library-level lock.
    ///
    /// When the glossary already holds `term`, ignoring case, the new
    /// `heard_as` phrases join its old ones and `note`, if given, replaces
    /// its old note.
    pub fn add_glossary_term(
        &self,
        term: &str,
        heard_as: &[String],
        note: Option<&str>,
    ) -> Result<Glossary, Error> {
        fs::create_dir_all(&self.root).map_err(|cause| Error::file(&self.root, cause))?;
        let _lock = lock_file(&self.root.join(GLOSSARY_LOCK_FILE))?;
        let mut glossary = self.read_glossary()?;
        let known_index = glossary
            .terms
            .iter()
            .position(|known| same_words(&known.term, term));
        let entry = match known_index {
            Some(index) => &mut glossary.terms[index],
            None => {
                glossary.terms.push(GlossaryTerm {
                    term: term.to_string(),
                    heard_as: Vec::new(),
                    note: None,
                });
                glossary.terms.last_mut().expect("a term was just pushed")
            }
        };
        for phrase in heard_as {
            if !entry.heard_as.iter().any(|known| same_words(known, phrase)) {
                entry.heard_as.push(phrase.clone());
            }
        }
        if let Some(note) = note {
            entry.note = Some(note.to_string());
        }
        write_json_safely(&self.root.join(GLOSSARY_FILE), &glossary)?;
        Ok(glossary)
    }

    fn write_meeting(&self, meeting: &Meeting) -> Result<(), Error> {
        write_json_safely(&self.meeting_dir(&meeting.id)?.join(MEETING_FILE), meeting)
    }
}

impl Default for Settings {
    fn default() -> Settings {
        Settings {
            schema: "scrb.settings.v1".to_string(),
            mic: "default".to_string(),
            model: "parakeet-tdt-0.6b-v3".to_string(),
            diarizer: "pyannote-community-1".to_string(),
            live: LiveSetting::Auto,
            live_check: None,
        }
    }
}

impl Default for Glossary {
    fn default() -> Glossary {
        Glossary {
            schema: "scrb.glossary.v1".to_string(),
            terms: Vec::new(),
        }
    }
}

fn is_recording_or_passing(state: MeetingState) -> bool {
    matches!(state, MeetingState::Recording | MeetingState::Passing)
}

/// Whether `from` may move to `next`. Crash recovery moves meetings back
/// without asking this.
fn can_move(from: MeetingState, next: MeetingState) -> bool {
    matches!(
        (from, next),
        (MeetingState::Recording, MeetingState::Recorded)
            | (MeetingState::Recorded, MeetingState::Passing)
            | (MeetingState::Passing, MeetingState::Ready)
            | (MeetingState::Passing, MeetingState::Failed)
            | (MeetingState::Failed, MeetingState::Passing)
            | (MeetingState::Ready, MeetingState::Passing)
    )
}

fn same_words(a: &str, b: &str) -> bool {
    a.to_lowercase() == b.to_lowercase()
}

/// Takes the lock on `path`, creating the file if needed.
fn lock_file(path: &Path) -> Result<Lock, Error> {
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)
        .map_err(|cause| Error::file(path, cause))?;
    match file.try_lock() {
        Ok(()) => Ok(Lock { _file: file }),
        Err(TryLockError::WouldBlock) => Err(Error::new(
            ErrorCode::Busy,
            format!("{} is held by another writer", path.display()),
        )),
        Err(TryLockError::Error(cause)) => Err(Error::file(path, cause)),
    }
}

/// Reads a JSON file. A missing file is `not_found`.
pub(crate) fn read_json<T: DeserializeOwned>(path: &Path) -> Result<T, Error> {
    let bytes = fs::read(path).map_err(|cause| match cause.kind() {
        io::ErrorKind::NotFound => Error::new(
            ErrorCode::NotFound,
            format!("{} does not exist", path.display()),
        ),
        _ => Error::file(path, cause),
    })?;
    serde_json::from_slice(&bytes).map_err(|cause| Error::file(path, cause))
}

fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> Result<T, Error> {
    match read_json(path) {
        Err(error) if error.code == ErrorCode::NotFound => Ok(T::default()),
        result => result,
    }
}

/// Replaces `path` with `value` as JSON through [`write_file_safely`].
pub(crate) fn write_json_safely<T: Serialize>(path: &Path, value: &T) -> Result<(), Error> {
    let mut json = serde_json::to_vec_pretty(value).map_err(|cause| Error::file(path, cause))?;
    json.push(b'\n');
    write_file_safely(path, &json)
}

/// Replaces `path` with `contents`, so a crash leaves either the whole old
/// file or the whole new one, never half of one.
pub(crate) fn write_file_safely(path: &Path, contents: &[u8]) -> Result<(), Error> {
    let temp_path = write_temp_file(path, contents).map_err(|cause| Error::file(path, cause))?;
    replace_file(&temp_path, path).map_err(|cause| Error::file(path, cause))
}

/// Writes `contents` to a temporary file in `path`'s folder and flushes it
/// to disk. A rename within one folder is atomic, which a rename across
/// file systems is not.
fn write_temp_file(path: &Path, contents: &[u8]) -> io::Result<PathBuf> {
    let file_name = path.file_name().unwrap_or_default().to_string_lossy();
    let temp_path = path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
    let mut file = File::create(&temp_path)?;
    file.write_all(contents)?;
    file.sync_all()?;
    Ok(temp_path)
}

/// Renames `temp_path` over `path`, and removes `temp_path` if that fails.
fn replace_file(temp_path: &Path, path: &Path) -> io::Result<()> {
    let mut attempts = 1;
    loop {
        match fs::rename(temp_path, path) {
            Ok(()) => return Ok(()),
            // On Windows the rename fails for as long as a reader holds the old file open.
            Err(_) if cfg!(windows) && attempts < RENAME_ATTEMPTS => {
                attempts += 1;
                thread::sleep(RENAME_RETRY_WAIT);
            }
            Err(cause) => {
                // The rename error is the one to report, so a failed removal is ignored.
                let _ = fs::remove_file(temp_path);
                return Err(cause);
            }
        }
    }
}

/// Appends `value` as one JSON line to `path` and flushes it to disk, so a
/// crash loses at most the line being written. A partial last line left by
/// such a crash is ended first, so it does not swallow the new line.
pub(crate) fn append_json_line<T: Serialize>(path: &Path, value: &T) -> Result<(), Error> {
    let mut line = serde_json::to_vec(value).map_err(|cause| Error::file(path, cause))?;
    line.push(b'\n');
    let mut file = OpenOptions::new()
        .create(true)
        .read(true)
        .append(true)
        .open(path)
        .map_err(|cause| Error::file(path, cause))?;
    if ends_in_partial_line(&mut file).map_err(|cause| Error::file(path, cause))? {
        line.insert(0, b'\n');
    }
    file.write_all(&line)
        .map_err(|cause| Error::file(path, cause))?;
    file.sync_data().map_err(|cause| Error::file(path, cause))
}

/// Whether `file` is not empty and its last byte is not a newline.
fn ends_in_partial_line(file: &mut File) -> io::Result<bool> {
    if file.metadata()?.len() == 0 {
        return Ok(false);
    }
    let mut last_byte = [0u8; 1];
    file.seek(SeekFrom::End(-1))?;
    file.read_exact(&mut last_byte)?;
    Ok(last_byte[0] != b'\n')
}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};
    use tempfile::TempDir;

    use super::*;

    /// A fixed local start time, so meeting ids are known in advance.
    fn ten_am() -> Zoned {
        "2026-11-17T10:00:12-05:00[-05:00]"
            .parse()
            .expect("the start time is valid")
    }

    /// An empty library in a temporary folder that is removed on drop.
    fn empty_library() -> (TempDir, Library) {
        let folder = TempDir::new().expect("a temporary folder");
        let library = Library::open(folder.path()).expect("an empty library opens");
        (folder, library)
    }

    /// A meeting that moved back would lose its transcript to a rerun, or
    /// show a finished recording as still recording.
    #[test]
    fn move_meeting_allows_only_forward_moves() {
        let (_folder, library) = empty_library();
        let (meeting, _lock) = library
            .create_meeting(Source::Recording, &ten_am())
            .unwrap();
        let path = [
            MeetingState::Recorded,
            MeetingState::Passing,
            MeetingState::Failed,
            MeetingState::Passing,
            MeetingState::Ready,
        ];
        for next in path {
            library.move_meeting(&meeting.id, next).unwrap();
        }

        let refused = library
            .move_meeting(&meeting.id, MeetingState::Recorded)
            .unwrap_err();

        assert_eq!(refused.code, ErrorCode::BadState);
        assert_eq!(
            library.read_meeting(&meeting.id).unwrap().state,
            MeetingState::Ready
        );
    }

    /// Two meetings started in the same minute must get two folders, or the
    /// second would write over the first one's `meeting.json`.
    #[test]
    fn create_meeting_adds_suffix_when_id_clashes() {
        let (_folder, library) = empty_library();
        let (first, _first_lock) = library
            .create_meeting(Source::Recording, &ten_am())
            .unwrap();

        let (second, _second_lock) = library.create_meeting(Source::Import, &ten_am()).unwrap();

        assert_eq!(first.id, "2026-11-17-1000");
        assert_eq!(second.id, "2026-11-17-1000-2");
        assert_eq!(
            library.read_meeting(&first.id).unwrap().state,
            MeetingState::Recording
        );
    }

    /// An id from the command line, such as `../x`, must not reach files
    /// outside the library folder.
    #[test]
    fn meeting_dir_rejects_ids_outside_library() {
        let (_folder, library) = empty_library();

        for id in ["../x", "/etc", "a/b", ".."] {
            let refused = library.meeting_dir(id).unwrap_err();

            assert_eq!(refused.code, ErrorCode::NotFound, "{id}");
        }
    }

    /// Meetings cut off by a crash must go back to `recorded` so their pass
    /// runs again, while a meeting whose lock is held is still running and
    /// must be left alone.
    #[test]
    fn library_open_recovers_cut_off_meetings() {
        let (folder, library) = empty_library();
        let (crashed_recording, lock) = library
            .create_meeting(Source::Recording, &ten_am())
            .unwrap();
        drop(lock);
        let (crashed_pass, lock) = library.create_meeting(Source::Import, &ten_am()).unwrap();
        library
            .move_meeting(&crashed_pass.id, MeetingState::Passing)
            .unwrap();
        drop(lock);
        let (running_pass, _held_lock) = library.create_meeting(Source::Import, &ten_am()).unwrap();
        library
            .move_meeting(&running_pass.id, MeetingState::Passing)
            .unwrap();

        let reopened = Library::open(folder.path()).unwrap();

        let state_of = |id: &str| reopened.read_meeting(id).unwrap().state;
        assert_eq!(state_of(&crashed_recording.id), MeetingState::Recorded);
        assert_eq!(state_of(&crashed_pass.id), MeetingState::Recorded);
        assert_eq!(state_of(&running_pass.id), MeetingState::Passing);
        let mut cut_off = reopened.cut_off().to_vec();
        cut_off.sort();
        assert_eq!(cut_off, [crashed_recording.id, crashed_pass.id]);
    }

    /// A crash after the new contents are written but before the rename must
    /// leave the old file whole, or a reader would find half a `meeting.json`.
    #[test]
    fn write_json_safely_leaves_old_file_whole() {
        let folder = TempDir::new().unwrap();
        let path = folder.path().join("meeting.json");
        let old = json!({"state": "recorded"});
        write_json_safely(&path, &old).unwrap();

        // Stop where a crash before the rename would.
        let temp_path = write_temp_file(&path, br#"{"state": "pass"#).unwrap();

        assert_eq!(read_json::<Value>(&path).unwrap(), old);
        assert_eq!(temp_path.parent(), path.parent());
    }

    /// A term added twice must stay one entry, or the pass would apply it
    /// twice and the glossary Codex reads would keep growing.
    #[test]
    fn add_glossary_term_merges_into_existing_term() {
        let (_folder, library) = empty_library();
        library
            .add_glossary_term("Kubeflow", &["cube flow".to_string()], None)
            .unwrap();

        library
            .add_glossary_term(
                "kubeflow",
                &["Cube Flow".to_string(), "cubeflow".to_string()],
                Some("ML platform"),
            )
            .unwrap();

        let glossary = library.read_glossary().unwrap();
        assert_eq!(glossary.terms.len(), 1);
        assert_eq!(glossary.terms[0].heard_as, ["cube flow", "cubeflow"]);
        assert_eq!(glossary.terms[0].note.as_deref(), Some("ML platform"));
    }
}
