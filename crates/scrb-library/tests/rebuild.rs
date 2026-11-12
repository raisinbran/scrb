mod common;

use std::fs;
use std::path::Path;

use common::{NOW, TempFolder, meeting_id, recording, snapshot};
use scrb_library::{Library, RebuildReport};
use scrb_transcript::{Speaker, Transcript};
use serde_json::{Value, json};

/// A library with two meetings, a copy of the first one's folder whose name sorts before it, a
/// folder holding only audio, one with a broken `meeting.json`, and an empty one.
fn messy_library(folder: &TempFolder) -> Library {
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    library.create_meeting(&recording(2, "Planning")).unwrap();
    let meetings = folder.path().join("meetings");
    let copy = meetings.join("2026-11-12 A copy of Weekly sync");
    fs::create_dir(&copy).unwrap();
    for file in ["meeting.json", "transcript.json"] {
        fs::copy(weekly.join(file), copy.join(file)).unwrap();
    }
    fs::create_dir_all(meetings.join("Audio only/audio/system")).unwrap();
    fs::write(
        meetings.join("Audio only/audio/system/000001.opus"),
        b"OggS",
    )
    .unwrap();
    fs::create_dir(meetings.join("Broken")).unwrap();
    fs::write(meetings.join("Broken/meeting.json"), "{").unwrap();
    fs::create_dir(meetings.join("Empty")).unwrap();
    library
}

/// A speaker as the final pass would write it, with no name yet.
fn speaker(id: &str) -> Speaker {
    Speaker {
        id: id.to_owned(),
        label: id.to_owned(),
        name: None,
        profile_id: None,
        user_named: false,
        merged_into: None,
    }
}

/// Changes one meeting's `meeting.json` the way a user or a sync client might.
fn edit_meeting_json(folder: &Path, edit: impl FnOnce(&mut Value)) {
    let path = folder.join("meeting.json");
    let mut file: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    edit(&mut file);
    fs::write(&path, serde_json::to_vec(&file).unwrap()).unwrap();
}

/// The index holds nothing the folders do not, so losing it must lose nothing. A rebuild from
/// the folders alone gives back the same meeting list.
#[test]
fn rebuild_index_gives_same_meeting_list() {
    let folder = TempFolder::new("same-list");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    for (n, date) in [(1, "2026-11-10T09:00:00Z"), (2, "2026-11-12T09:00:00Z")] {
        let mut meeting = recording(n, "Weekly sync");
        meeting.date = date.to_owned();
        library.create_meeting(&meeting).unwrap();
    }
    let planning = library.create_meeting(&recording(3, "Planning")).unwrap();
    let mut transcript = Transcript::new(meeting_id(3).as_str());
    transcript.speakers = vec![speaker("s1"), speaker("s2")];
    let bytes = serde_json::to_vec(&transcript).unwrap();
    fs::write(planning.join("transcript.json"), bytes).unwrap();
    library.rebuild_index().unwrap();
    let before = library.meetings().unwrap();
    drop(library);
    fs::remove_file(folder.path().join("index.sqlite")).unwrap();

    let mut library = Library::open(folder.path(), NOW).unwrap();
    let report = library.rebuild_index().unwrap();

    assert_eq!(report, RebuildReport::default());
    assert_eq!(library.meetings().unwrap(), before);
}

/// The folders hold the user's meetings and audio, so a rebuild may read them but must not
/// write, move or delete anything in them, not even in folders it cannot read.
#[test]
fn rebuild_index_never_changes_meeting_folders() {
    let folder = TempFolder::new("read-only");
    let mut library = messy_library(&folder);
    let before = snapshot(&folder.path().join("meetings"));

    library.rebuild_index().unwrap();

    assert_eq!(snapshot(&folder.path().join("meetings")), before);
}

/// A copied folder would show one meeting twice, and an unreadable one cannot be listed, so
/// both stay out of the list and are reported for the screens. An empty folder holds nothing to
/// report.
#[test]
fn rebuild_index_reports_duplicate_and_unreadable_folders() {
    let folder = TempFolder::new("left-out");
    let mut library = messy_library(&folder);

    let mut report = library.rebuild_index().unwrap();

    report.unreadable.sort();
    assert_eq!(report.duplicates, ["2026-11-12 A copy of Weekly sync"]);
    assert_eq!(report.unreadable, ["Audio only", "Broken"]);
    let listed: Vec<_> = library
        .meetings()
        .unwrap()
        .into_iter()
        .map(|m| m.folder)
        .collect();
    assert_eq!(listed, ["2026-11-12 Weekly sync", "2026-11-12 Planning"]);
}

/// A listed folder whose `meeting.json` is replaced by another listed meeting's must not take
/// that meeting, even when its name sorts first, or later saves would go to the copy.
#[test]
fn rebuild_index_keeps_unchanged_folder_over_copy() {
    let folder = TempFolder::new("changed-copy");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let planning = library.create_meeting(&recording(2, "Planning")).unwrap();
    fs::copy(weekly.join("meeting.json"), planning.join("meeting.json")).unwrap();

    let report = library.rebuild_index().unwrap();

    assert_eq!(report.duplicates, ["2026-11-12 Planning"]);
    let listed: Vec<_> = library
        .meetings()
        .unwrap()
        .into_iter()
        .map(|m| (m.id, m.folder))
        .collect();
    assert_eq!(
        listed,
        [(meeting_id(1), "2026-11-12 Weekly sync".to_owned())]
    );
}

/// A listed meeting whose `meeting.json` cannot be read for a moment, as while a sync client
/// writes it, or whose folder was emptied, still has a folder. It stays listed and is reported,
/// since removing its row would hide the meeting and, once delete exists, drop its voice data.
#[test]
fn rebuild_index_keeps_row_of_unreadable_folder() {
    let folder = TempFolder::new("unreadable-known");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let planning = library.create_meeting(&recording(2, "Planning")).unwrap();
    fs::write(weekly.join("meeting.json"), "{").unwrap();
    for file in ["meeting.json", "transcript.json"] {
        fs::remove_file(planning.join(file)).unwrap();
    }

    let mut report = library.rebuild_index().unwrap();

    report.unreadable.sort();
    assert_eq!(
        report.unreadable,
        ["2026-11-12 Planning", "2026-11-12 Weekly sync"]
    );
    assert_eq!(library.meetings().unwrap().len(), 2);
}

/// The folders are the source of truth, so a folder removed, edited or added outside the app
/// must show in the list after a rebuild. The added folder has no `transcript.json`, as after a
/// crash inside a create, and is still listed.
#[test]
fn rebuild_index_follows_folders_changed_outside_app() {
    let folder = TempFolder::new("changed");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let weekly = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let planning = library.create_meeting(&recording(2, "Planning")).unwrap();
    library.rebuild_index().unwrap();
    fs::remove_dir_all(&planning).unwrap();
    let added = folder.path().join("meetings/2026-11-12 Added by hand");
    fs::create_dir(&added).unwrap();
    fs::copy(weekly.join("meeting.json"), added.join("meeting.json")).unwrap();
    edit_meeting_json(&added, |file| {
        file["id"] = json!(meeting_id(3).as_str());
        file["title"] = json!("Added by hand");
    });
    edit_meeting_json(&weekly, |file| {
        file["title"] = json!("Weekly sync, renamed")
    });

    library.rebuild_index().unwrap();

    let listed: Vec<_> = library
        .meetings()
        .unwrap()
        .into_iter()
        .map(|m| (m.id, m.title))
        .collect();
    let expected = [
        (meeting_id(1), "Weekly sync, renamed".to_owned()),
        (meeting_id(3), "Added by hand".to_owned()),
    ];
    assert_eq!(listed, expected);
}

/// A network folder that is briefly unreachable must not look like a library with no meetings,
/// or the rebuild would empty the list.
#[test]
fn rebuild_index_keeps_rows_when_meetings_unlisted() {
    let folder = TempFolder::new("unlisted");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let meetings = folder.path().join("meetings");
    fs::rename(&meetings, folder.path().join("away")).unwrap();

    let rebuilt = library.rebuild_index();

    assert!(rebuilt.is_err());
    assert_eq!(library.meetings().unwrap().len(), 1);
}
