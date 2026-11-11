mod common;

use std::fs;

use common::{NOW, TempFolder, meeting_id, recording, set_status, snapshot};
use rusqlite::Connection;
use scrb_library::{DeleteReport, Library, LibraryError, MeetingStatus};

/// A deleted meeting must leave nothing the user could find again, not its folder, its cached
/// files or its entry in the list. Another meeting's folder must stay exactly as it was.
#[test]
fn delete_meeting_removes_only_that_meeting() {
    let folder = TempFolder::new("delete");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let planning = library.create_meeting(&recording(2, "Planning")).unwrap();
    set_status(&weekly, "ready");
    let cache = folder.path().join("cache").join(meeting_id(1).as_str());
    fs::create_dir_all(&cache).unwrap();
    fs::write(cache.join("peaks.bin"), b"peaks").unwrap();
    let planning_before = snapshot(&planning);

    let report = library.delete_meeting(&meeting_id(1)).unwrap();

    let nothing_left = DeleteReport {
        verified: true,
        remaining: Vec::new(),
    };
    assert_eq!(report, nothing_left);
    assert!(!weekly.exists());
    assert!(!cache.exists());
    let meetings = fs::read_dir(folder.path().join("meetings")).unwrap();
    assert_eq!(meetings.count(), 1);
    assert_eq!(snapshot(&planning), planning_before);
    let listed: Vec<_> = library
        .meetings()
        .unwrap()
        .into_iter()
        .map(|m| m.id)
        .collect();
    assert_eq!(listed, [meeting_id(2)]);
}

/// While a meeting is recorded or made, another part of the app writes its files, so a delete
/// must be refused and remove nothing.
#[test]
fn delete_meeting_refuses_meeting_in_progress() {
    let folder = TempFolder::new("delete-in-progress");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let cases = [
        ("recording", MeetingStatus::Recording),
        ("paused", MeetingStatus::Paused),
        ("importing", MeetingStatus::Importing),
        ("finalPassRunning", MeetingStatus::FinalPassRunning),
    ];

    for (name, status) in cases {
        set_status(&made, name);

        let deleted = library.delete_meeting(&meeting_id(1));

        assert!(
            matches!(deleted, Err(LibraryError::Conflict(refused)) if refused == status),
            "status {name}"
        );
        assert!(made.join("meeting.json").exists(), "status {name}");
    }
    assert_eq!(library.meetings().unwrap().len(), 1);
}

/// The index is a file a user or a bad copy can change, so a folder name in it that leads out of
/// `meetings/` must never lead a delete to the user's other files.
#[test]
fn delete_meeting_refuses_folder_outside_meetings() {
    let folder = TempFolder::new("delete-outside");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    drop(library);
    let outside = folder.path().join("outside");
    fs::create_dir(&outside).unwrap();
    fs::write(outside.join("notes.txt"), "keep").unwrap();
    let index = Connection::open(folder.path().join("index.sqlite")).unwrap();
    index
        .execute(
            "UPDATE meetings SET folder = '../outside', status = 'ready'",
            [],
        )
        .unwrap();
    drop(index);
    let mut library = Library::open(folder.path(), NOW).unwrap();

    let deleted = library.delete_meeting(&meeting_id(1));

    assert!(matches!(deleted, Err(LibraryError::UnsafeFolder(_))));
    assert_eq!(fs::read(outside.join("notes.txt")).unwrap(), b"keep");
}

/// A folder whose `meeting.json` was replaced by another meeting's, as by a copy or a sync
/// client, now holds that meeting, so deleting the first meeting must not remove it.
#[test]
fn delete_meeting_refuses_folder_of_other_meeting() {
    let folder = TempFolder::new("delete-other");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let planning = library.create_meeting(&recording(2, "Planning")).unwrap();
    set_status(&planning, "ready");
    fs::copy(planning.join("meeting.json"), weekly.join("meeting.json")).unwrap();

    let deleted = library.delete_meeting(&meeting_id(1));

    assert!(matches!(deleted, Err(LibraryError::NotFound(_))));
    assert!(weekly.join("transcript.json").exists());
    assert!(planning.join("transcript.json").exists());
}

/// The index row goes only after the folder is renamed. A delete whose rename fails must leave
/// the meeting listed, or its files would stay with no entry in the list.
#[cfg(unix)]
#[test]
fn delete_meeting_keeps_row_when_rename_fails() {
    use std::os::unix::fs::PermissionsExt;

    let folder = TempFolder::new("delete-rename-fails");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    set_status(&made, "ready");
    let meetings = folder.path().join("meetings");
    fs::set_permissions(&meetings, fs::Permissions::from_mode(0o555)).unwrap();

    let deleted = library.delete_meeting(&meeting_id(1));
    // Restored before the assertions, so the folder can be removed even when one fails.
    fs::set_permissions(&meetings, fs::Permissions::from_mode(0o755)).unwrap();

    assert!(deleted.is_err());
    assert!(made.join("meeting.json").exists());
    assert_eq!(library.meetings().unwrap().len(), 1);
}

/// A copy of the meeting's folder made outside the app still holds its text and audio, so the
/// delete must not tell the user the meeting is gone.
#[test]
fn delete_meeting_reports_copy_left_behind() {
    let folder = TempFolder::new("delete-copy");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    set_status(&made, "ready");
    let copy = folder.path().join("meetings/Copy of Weekly sync");
    fs::create_dir(&copy).unwrap();
    fs::copy(made.join("meeting.json"), copy.join("meeting.json")).unwrap();

    let report = library.delete_meeting(&meeting_id(1)).unwrap();

    assert!(!report.verified);
    assert_eq!(report.remaining.len(), 1);
    assert!(report.remaining[0].contains("Copy of Weekly sync"));
    assert!(copy.join("meeting.json").exists());
}

/// A folder the delete could not remove may still hold the meeting's audio, and the report is
/// the user's only sign of it, so each folder left must be named.
#[cfg(unix)]
#[test]
fn delete_meeting_reports_folders_left_behind() {
    use std::os::unix::fs::PermissionsExt;

    let folder = TempFolder::new("delete-left-behind");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    set_status(&made, "ready");
    let cache = folder.path().join("cache").join(meeting_id(1).as_str());
    for locked in [made.join("audio"), cache.join("peaks")] {
        fs::create_dir_all(&locked).unwrap();
        fs::write(locked.join("kept.bin"), b"kept").unwrap();
        fs::set_permissions(&locked, fs::Permissions::from_mode(0o555)).unwrap();
    }
    let deleting = folder
        .path()
        .join("meetings")
        .join(format!(".deleting-{}", meeting_id(1).as_str()));

    let deleted = library.delete_meeting(&meeting_id(1));
    // Restored before the assertions, so the folders can be removed even when one fails.
    for locked in [
        made.join("audio"),
        deleting.join("audio"),
        cache.join("peaks"),
    ] {
        let _ = fs::set_permissions(&locked, fs::Permissions::from_mode(0o755));
    }

    let report = deleted.unwrap();
    assert!(!report.verified);
    assert_eq!(
        report.remaining,
        ["the meeting's folder", "the meeting's cached files"]
    );
}

/// A crash after the rename leaves a `.deleting-` folder that is out of the list but still holds
/// the meeting's files. The next open must finish that delete.
#[test]
fn library_open_finishes_interrupted_delete() {
    let folder = TempFolder::new("finish-delete");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    drop(library);
    let meetings = folder.path().join("meetings");
    let deleting = meetings.join(format!(".deleting-{}", meeting_id(1).as_str()));
    fs::rename(&made, &deleting).unwrap();
    let cache = folder.path().join("cache").join(meeting_id(1).as_str());
    fs::create_dir_all(&cache).unwrap();

    let library = Library::open(folder.path(), NOW).unwrap();

    assert!(!deleting.exists());
    assert!(!cache.exists());
    assert!(library.meetings().unwrap().is_empty());
}

/// The next open must leave alone a dot folder whose name is not a meeting id, since it may hold
/// the user's own files.
#[test]
fn library_open_ignores_deleting_folder_without_id() {
    let folder = TempFolder::new("open-not-a-meeting");
    drop(Library::open(folder.path(), NOW).unwrap());
    let not_a_meeting = folder.path().join("meetings").join(".deleting-notes");
    fs::create_dir(&not_a_meeting).unwrap();
    fs::write(not_a_meeting.join("notes.txt"), "keep").unwrap();

    Library::open(folder.path(), NOW).unwrap();

    assert_eq!(fs::read(not_a_meeting.join("notes.txt")).unwrap(), b"keep");
}
