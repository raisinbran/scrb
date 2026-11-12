mod common;

use std::fs;

use common::{NOW, TempFolder, snapshot};
use rusqlite::Connection;
use scrb_library::{Library, LibraryError};
use serde_json::{Map, Value, json};

/// Settings in a damaged database may still be rescued by hand, so each damaged file is renamed
/// aside with its journal, never deleted, and never renamed over an older damaged file. The
/// index has a valid header and a damaged page, which only the integrity check finds.
#[test]
fn library_open_sets_aside_damaged_databases() {
    let folder = TempFolder::new("damaged");
    let root = folder.path();
    drop(Library::open(root, NOW).unwrap());
    let library_bytes = b"not a database, but the user's settings".repeat(100);
    fs::write(root.join("library.sqlite"), &library_bytes).unwrap();
    fs::write(
        root.join("library.sqlite-journal"),
        b"the journal beside it",
    )
    .unwrap();
    // Page 2 of the index holds the meetings table.
    let mut index_bytes = fs::read(root.join("index.sqlite")).unwrap();
    index_bytes[4096..4296].fill(0x55);
    fs::write(root.join("index.sqlite"), &index_bytes).unwrap();
    let older = root.join("library.sqlite.damaged-2026-11-11T09-00-00Z");
    fs::write(&older, b"set aside before").unwrap();

    let library = Library::open(root, NOW).unwrap();

    let library_aside = root.join("library.sqlite.damaged-2026-11-11T09-00-00Z-2");
    let index_aside = root.join("index.sqlite.damaged-2026-11-11T09-00-00Z");
    assert_eq!(
        library.damaged_files(),
        [library_aside.clone(), index_aside.clone()]
    );
    assert_eq!(fs::read(&library_aside).unwrap(), library_bytes);
    let journal_aside = root.join("library.sqlite.damaged-2026-11-11T09-00-00Z-2-journal");
    assert_eq!(fs::read(journal_aside).unwrap(), b"the journal beside it");
    assert_eq!(fs::read(&index_aside).unwrap(), index_bytes);
    assert_eq!(fs::read(&older).unwrap(), b"set aside before");
    assert_eq!(library.settings().unwrap(), Map::new());
}

/// Settings are the user's own choices, so each saved field must still be there after the app
/// restarts.
#[test]
fn update_settings_survives_reopening() {
    let folder = TempFolder::new("settings");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let saved = json!({"theme": "dark", "transcriptFontPx": 18});
    library.update_settings(saved.as_object().unwrap()).unwrap();
    drop(library);

    let library = Library::open(folder.path(), NOW).unwrap();

    assert_eq!(Value::Object(library.settings().unwrap()), saved);
}

/// The screens send only the fields the user changed, so an update must not reset the others.
#[test]
fn update_settings_keeps_unnamed_fields() {
    let folder = TempFolder::new("unnamed");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let first = json!({"theme": "dark", "transcriptFontPx": 18});
    library.update_settings(first.as_object().unwrap()).unwrap();

    library
        .update_settings(json!({"theme": "light"}).as_object().unwrap())
        .unwrap();

    let expected = json!({"theme": "light", "transcriptFontPx": 18});
    assert_eq!(Value::Object(library.settings().unwrap()), expected);
}

/// Gives `database` a newer app's version and a table this SQLite cannot read.
fn write_newer_schema(database: &Connection) {
    database
        .execute_batch(
            "PRAGMA user_version = 2;
             PRAGMA writable_schema = ON;
             INSERT INTO sqlite_master VALUES ('table', 'later', 'later', 0, 'CREATE TABLE later (');",
        )
        .unwrap();
}

/// An older app that opened a newer database could write rows the newer app misreads, so it
/// must refuse to open the library and leave both files as they were. A schema it cannot read
/// must not make it set the file aside as damaged.
#[test]
fn library_open_refuses_database_from_newer_app() {
    for file in ["library.sqlite", "index.sqlite"] {
        let folder = TempFolder::new(&format!("newer-{file}"));
        drop(Library::open(folder.path(), NOW).unwrap());
        write_newer_schema(&Connection::open(folder.path().join(file)).unwrap());
        let before = snapshot(folder.path());

        let opened = Library::open(folder.path(), NOW);

        assert!(
            matches!(opened, Err(LibraryError::NewerSchema(name)) if name == file),
            "{file}"
        );
        assert_eq!(snapshot(folder.path()), before, "{file}");
    }
}

/// A newer app in WAL mode keeps its new version and schema in the `-wal` file while it is open,
/// so the open must refuse the file there too, not set it aside as damaged.
#[test]
fn library_open_refuses_newer_version_in_wal() {
    let folder = TempFolder::new("newer-wal");
    drop(Library::open(folder.path(), NOW).unwrap());
    let newer_app = Connection::open(folder.path().join("index.sqlite")).unwrap();
    newer_app
        .execute_batch("PRAGMA journal_mode = WAL")
        .unwrap();
    write_newer_schema(&newer_app);

    let opened = Library::open(folder.path(), NOW);

    assert!(matches!(
        opened,
        Err(LibraryError::NewerSchema("index.sqlite"))
    ));
}
