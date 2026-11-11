mod common;

use std::fs;

use common::{NOW, TempFolder, recording};
use scrb_library::{Library, LibraryError, MeetingId};
use serde_json::json;

/// Folder names must be safe on Windows, macOS and network folders and must stay one folder
/// under `meetings/`, whatever the user types as a title.
#[test]
fn create_meeting_names_folder_with_safe_title() {
    let cases = [
        ("Weekly sync", "2026-11-12 Weekly sync"),
        ("Q4: plan / budget?", "2026-11-12 Q4 plan budget"),
        ("../../escape", "2026-11-12 escape"),
        ("...notes... ", "2026-11-12 notes"),
        ("Cafe\u{301} chat", "2026-11-12 Caf\u{e9} chat"),
        ("", "2026-11-12 Meeting"),
        // The empty title above took the plain name.
        ("con", "2026-11-12 Meeting (2)"),
        (&"x".repeat(70), &format!("2026-11-12 {}", "x".repeat(60))),
    ];
    let folder = TempFolder::new("names");
    let mut library = Library::open(folder.path(), NOW).unwrap();

    for (n, (title, expected)) in cases.into_iter().enumerate() {
        let made = library.create_meeting(&recording(n as u8, title)).unwrap();

        assert_eq!(
            made,
            folder.path().join("meetings").join(expected),
            "title {title:?}"
        );
    }
}

/// Two meetings with the same date and title must get two folders, or the second would write
/// into the first one's files.
#[test]
fn create_meeting_numbers_folder_when_name_taken() {
    let folder = TempFolder::new("taken");
    let mut library = Library::open(folder.path(), NOW).unwrap();

    let first = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let second = library
        .create_meeting(&recording(2, "Weekly sync"))
        .unwrap();

    assert!(first.ends_with("2026-11-12 Weekly sync"));
    assert!(second.ends_with("2026-11-12 Weekly sync (2)"));
}

/// The date names the folder, so a date that does not start with a plain day, such as one with
/// slashes, could make a folder somewhere else. It must be refused before any folder is made.
#[test]
fn create_meeting_refuses_date_without_leading_day() {
    let folder = TempFolder::new("bad-date");
    let mut library = Library::open(folder.path(), NOW).unwrap();

    for date in ["2026/11/12T09:30:00Z", "../../x", "../.-..-..", ""] {
        let mut meeting = recording(1, "Weekly sync");
        meeting.date = date.to_owned();
        let made = library.create_meeting(&meeting);

        assert!(
            matches!(made, Err(LibraryError::InvalidDate(_))),
            "date {date:?}"
        );
    }
    let meetings = folder.path().join("meetings");
    assert_eq!(fs::read_dir(meetings).unwrap().count(), 0);
}

/// The names and values in `meeting.json` must not change once a version 1 file is written,
/// because every later app reads them back.
#[test]
fn create_meeting_writes_version_1_meeting_json() {
    let folder = TempFolder::new("layout");
    let mut library = Library::open(folder.path(), NOW).unwrap();

    let made = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();

    let written: serde_json::Value =
        serde_json::from_slice(&fs::read(made.join("meeting.json")).unwrap()).unwrap();
    let expected = json!({
        "version": 1,
        "id": "00000000-0000-4000-8000-000000000001",
        "title": "Weekly sync",
        "date": "2026-11-12T09:30:00Z",
        "createdAt": NOW,
        "origin": "recorded",
        "status": "recording",
        "durationMs": 0,
        "recoveredEndMs": null,
        "audioDeletedAt": null,
        "buildVoiceProfiles": false,
        "transcriptionFailure": null,
        "gaps": [],
        "devices": []
    });
    assert_eq!(written, expected);
}

/// Ids name paths such as `cache/<id>`, so text that could lead out of the library, or any
/// other form, must never become an id.
#[test]
fn meeting_id_parse_refuses_all_but_uuids() {
    let refused = [
        "",
        "..",
        "../00000000-0000-4000-8000-000000000001",
        "/00000000-0000-4000-8000-00000000001",
        "00000000\\0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-00000000000A",
        "00000000-0000-4000-8000-0000000000011",
    ];

    for text in refused {
        assert!(text.parse::<MeetingId>().is_err(), "{text:?}");
    }
    assert!(
        "0b7d1f2e-4c1a-4e8b-9d6f-2a5c3e7b1f00"
            .parse::<MeetingId>()
            .is_ok()
    );
}

/// A new id that the library cannot read back would make its meeting unreadable on the next
/// rebuild, and two equal ids would merge two meetings.
#[test]
fn meeting_id_random_ids_differ_and_parse() {
    let first = MeetingId::new_random();
    let second = MeetingId::new_random();

    assert_ne!(first, second);
    assert_eq!(first.as_str().parse::<MeetingId>().unwrap(), first);
}
