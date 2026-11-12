use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};

use rusqlite::{Connection, ErrorCode};

use crate::LibraryError;

const LIBRARY_DATABASE: &str = "library.sqlite";
const INDEX_DATABASE: &str = "index.sqlite";

/// The schema version this app writes into each file's `user_version`.
const SCHEMA_VERSION: u32 = 1;

/// The first 16 bytes of every SQLite database file.
const SQLITE_HEADER: &[u8] = b"SQLite format 3\0";

const LIBRARY_TABLES: &str = "
CREATE TABLE main.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL -- JSON
);";

const INDEX_TABLES: &str = "
CREATE TABLE idx.meetings (
  id               TEXT PRIMARY KEY,
  folder           TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  date             TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  duration_ms      INTEGER NOT NULL,
  origin           TEXT NOT NULL CHECK (origin IN ('recorded', 'imported')),
  status           TEXT NOT NULL,
  summary_state    TEXT NOT NULL,
  speaker_count    INTEGER NOT NULL,
  audio_deleted_at TEXT,
  files_seen       TEXT NOT NULL
);
CREATE INDEX idx.meetings_date ON meetings(date);";

/// Opens `library.sqlite` with `index.sqlite` attached as `idx`, so one transaction can change
/// both files at once, and makes either file on first use.
///
/// A damaged file is first renamed to `<file>.damaged-<now>` and replaced with an empty one.
/// Returns the connection and the new names of the damaged files.
pub(crate) fn open_databases(
    root: &Path,
    now: &str,
) -> Result<(Connection, Vec<PathBuf>), LibraryError> {
    let index_path = root.join(INDEX_DATABASE);
    let Some(index_path_text) = index_path.to_str() else {
        let error = io::Error::new(io::ErrorKind::InvalidInput, "the library path is not UTF-8");
        return Err(error.into());
    };
    // Both files are checked before either is renamed, so an error on the second, such as
    // `NewerSchema`, leaves the first in place for the next open to report.
    let mut found = Vec::new();
    for name in [LIBRARY_DATABASE, INDEX_DATABASE] {
        if is_damaged(root, name)? {
            found.push(name);
        }
    }
    let mut damaged = Vec::new();
    for name in found {
        damaged.push(set_aside(root, name, now)?);
    }

    let mut connection = Connection::open(root.join(LIBRARY_DATABASE))?;
    connection.execute("ATTACH DATABASE ?1 AS idx", [index_path_text])?;
    let library_version = user_version(&connection, "main")?;
    let index_version = user_version(&connection, "idx")?;
    // SQLite turns foreign keys off on every new connection. WAL would need shared memory, which
    // breaks on network folders, so both files keep the rollback journal.
    connection.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA main.journal_mode = DELETE;
         PRAGMA idx.journal_mode = DELETE;
         PRAGMA main.synchronous = FULL;
         PRAGMA idx.synchronous = FULL;",
    )?;
    if library_version == 0 {
        create_tables(&mut connection, "main", LIBRARY_TABLES)?;
    }
    if index_version == 0 {
        create_tables(&mut connection, "idx", INDEX_TABLES)?;
    }
    Ok((connection, damaged))
}

/// Whether the database `name` in `root` is not a database or fails its integrity check.
///
/// Fails with `NewerSchema`, changing nothing, when the header or `-wal` file shows a newer app's
/// version. A missing file is not damaged. Any other error, such as an unreachable network folder,
/// is returned instead, so a passing fault never resets the user's settings.
fn is_damaged(root: &Path, name: &'static str) -> Result<bool, LibraryError> {
    let path = root.join(name);
    let mut start = Vec::new();
    match File::open(&path) {
        Ok(file) => file.take(100).read_to_end(&mut start)?,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.into()),
    };
    // Opening a file that is not a database would make SQLite play the journal beside it and
    // then delete that journal, so the header is checked before SQLite sees the file.
    if !start.is_empty() && !start.starts_with(SQLITE_HEADER) {
        return Ok(true);
    }
    // The header holds `user_version` at byte 60. It is read before SQLite opens the file, which
    // would play back a journal beside it and so change a newer app's file.
    if let Some(&[a, b, c, d]) = start.get(60..64)
        && u32::from_be_bytes([a, b, c, d]) > SCHEMA_VERSION
    {
        return Err(LibraryError::NewerSchema(name));
    }
    let check = Connection::open(&path).and_then(|connection| {
        // The version goes first, as a newer `-wal` file may hold a schema the check rejects.
        let result = user_version(&connection, "main").and_then(|version| {
            if version > SCHEMA_VERSION {
                return Ok(None);
            }
            connection
                .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .map(Some)
        });
        // Windows cannot rename a file that is still open.
        connection.close().map_err(|(_, error)| error)?;
        result
    });
    match check {
        Ok(None) => Err(LibraryError::NewerSchema(name)),
        Ok(Some(result)) => Ok(result != "ok"),
        Err(error)
            if matches!(
                error.sqlite_error_code(),
                Some(ErrorCode::NotADatabase | ErrorCode::DatabaseCorrupt)
            ) =>
        {
            Ok(true)
        }
        Err(error) => Err(error.into()),
    }
}

/// Renames the damaged database `name`, and any rollback journal beside it, to
/// `<name>.damaged-<now>`. Nothing is deleted, so the user's data can still be rescued by hand.
fn set_aside(root: &Path, name: &str, now: &str) -> io::Result<PathBuf> {
    let stamp: String = now
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let mut target = root.join(format!("{name}.damaged-{stamp}"));
    let mut copy = 1;
    // Renaming over an older damaged file or its journal would delete it.
    while target.try_exists()? || journal_of(&target).try_exists()? {
        copy += 1;
        target = root.join(format!("{name}.damaged-{stamp}-{copy}"));
    }

    // The journal goes first. A journal left beside a fresh file would be played into it, while
    // a crash before the second rename leaves a damaged file the next open sets aside again.
    let journal = root.join(format!("{name}-journal"));
    if journal.try_exists()? {
        fs::rename(journal, journal_of(&target))?;
    }
    fs::rename(root.join(name), &target)?;
    Ok(target)
}

/// The name of the rollback journal beside the database at `path`.
fn journal_of(path: &Path) -> PathBuf {
    let mut journal = path.as_os_str().to_owned();
    journal.push("-journal");
    journal.into()
}

/// The `user_version` of `schema` after SQLite plays back any journal and reads any `-wal` file,
/// which can change the header's version. The schema is not parsed. Version 0 is a new file.
fn user_version(connection: &Connection, schema: &str) -> rusqlite::Result<u32> {
    connection.query_row(&format!("PRAGMA {schema}.user_version"), [], |row| {
        row.get(0)
    })
}

/// Creates the tables of a new file and stamps its version, in one transaction.
fn create_tables(
    connection: &mut Connection,
    schema: &str,
    tables: &str,
) -> Result<(), LibraryError> {
    let transaction = connection.transaction()?;
    transaction.execute_batch(tables)?;
    transaction.execute_batch(&format!("PRAGMA {schema}.user_version = {SCHEMA_VERSION}"))?;
    transaction.commit()?;
    Ok(())
}
