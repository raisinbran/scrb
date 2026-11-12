mod common;

use std::fs;

use common::{NOW, TempFolder, recording};
use scrb_library::Library;

/// A crash during a safe write leaves its temporary file beside the old file. Opening the
/// library removes such files and keeps the old file and the user's own files, even ones whose
/// names look alike.
#[test]
fn library_open_removes_only_crash_temp_files() {
    let folder = TempFolder::new("temp-files");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let meeting = library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    drop(library);
    let transcript_bytes = fs::read(meeting.join("transcript.json")).unwrap();
    let cut_off = meeting.join("transcript.json.tmp-00ff00ff00ff00ff");
    fs::write(&cut_off, "{\"version\": 1, \"meet").unwrap();
    let root_temp = folder.path().join("library.json.tmp-0123456789abcdef");
    fs::write(&root_temp, "{").unwrap();
    let users_file = meeting.join("notes.tmp-draft.txt");
    fs::write(&users_file, "my notes").unwrap();

    let _library = Library::open(folder.path(), NOW).unwrap();

    assert!(!cut_off.exists());
    assert!(!root_temp.exists());
    assert_eq!(fs::read_to_string(&users_file).unwrap(), "my notes");
    assert_eq!(
        fs::read(meeting.join("transcript.json")).unwrap(),
        transcript_bytes
    );
}

/// Opening the library must keep an empty meeting folder. A sync client may have made it and not
/// filled it yet, and removing it could lose that meeting on every synced copy.
#[test]
fn library_open_keeps_empty_meeting_folders() {
    let folder = TempFolder::new("empty-folders");
    let empty = folder.path().join("meetings/2026-11-12 Weekly sync");
    fs::create_dir_all(&empty).unwrap();

    let _library = Library::open(folder.path(), NOW).unwrap();

    assert!(empty.exists());
}

/// A leftover that cannot be removed, such as a temporary file another program holds, must not
/// stop the library from opening, or the user could not record at all. This holds in the library
/// folder as well as in a meeting folder.
#[cfg(unix)]
#[test]
fn library_open_skips_leftovers_it_cannot_remove() {
    use std::os::unix::fs::PermissionsExt;

    let folder = TempFolder::new("stuck-leftover");
    // The first open makes `scrb.lock` and `meetings/`, so the second makes no file in the
    // read-only library folder.
    drop(Library::open(folder.path(), NOW).unwrap());
    let meeting = folder.path().join("meetings/2026-11-12 Weekly sync");
    fs::create_dir(&meeting).unwrap();
    fs::write(folder.path().join("library.json.tmp-0123456789abcdef"), "{").unwrap();
    fs::write(meeting.join("transcript.json.tmp-00ff00ff00ff00ff"), "{").unwrap();
    fs::set_permissions(folder.path(), fs::Permissions::from_mode(0o555)).unwrap();
    fs::set_permissions(&meeting, fs::Permissions::from_mode(0o555)).unwrap();

    let opened = Library::open(folder.path(), NOW);
    // Restored before the assertion, so the folders can be removed even when it fails.
    fs::set_permissions(folder.path(), fs::Permissions::from_mode(0o755)).unwrap();
    fs::set_permissions(&meeting, fs::Permissions::from_mode(0o755)).unwrap();

    assert!(opened.is_ok());
}
