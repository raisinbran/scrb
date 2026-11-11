mod common;

use std::fs;

use common::{TempFolder, recording};
use scrb_library::{Library, LibraryError};

/// Two cores writing one library would overwrite each other's meetings, so a second open must
/// fail while the first library is open, and work again once it closes.
#[test]
fn library_open_refuses_second_open_until_dropped() {
    let folder = TempFolder::new("lock");
    let first = Library::open(folder.path()).unwrap();

    let second = Library::open(folder.path());
    drop(first);
    let third = Library::open(folder.path());

    assert!(matches!(second, Err(LibraryError::Busy)));
    assert!(third.is_ok());
}

/// Open's cleanup must wait for the lock, or a second core would remove the temporary file of a
/// save the first core is making, and that save would fail.
#[test]
fn library_open_keeps_temp_files_when_busy() {
    let folder = TempFolder::new("busy-cleanup");
    let mut first = Library::open(folder.path()).unwrap();
    let meeting = first.create_meeting(&recording(1, "Weekly sync")).unwrap();
    let saving = meeting.join("transcript.json.tmp-00ff00ff00ff00ff");
    fs::write(&saving, "{").unwrap();

    let second = Library::open(folder.path());

    assert!(matches!(second, Err(LibraryError::Busy)));
    assert!(saving.exists());
}
