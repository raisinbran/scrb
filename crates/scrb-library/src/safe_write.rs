use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::Path;
use std::thread;
use std::time::Duration;

use crate::id::random_u64;
use crate::os;

/// What sits between a file's name and the random part of its temporary file's name.
const TEMP_MARKER: &str = ".tmp-";

/// How many times a rename is tried again while another program holds the file.
const RENAME_RETRIES: u32 = 6;

/// Replaces `path` with `bytes` so that a reader, or the file after a crash, holds the old
/// contents or the new ones, never a mix or a short file.
///
/// The bytes go to `<file>.tmp-<random>` in the same folder, reach the drive, and then the
/// temporary file is renamed over `path`. A failed write removes its temporary file.
pub(crate) fn write_file_safely(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let (Some(folder), Some(name)) = (path.parent(), path.file_name()) else {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "not a file path",
        ));
    };
    let mut temp_name = name.to_os_string();
    temp_name.push(format!("{TEMP_MARKER}{:016x}", random_u64()));
    let temp = folder.join(temp_name);

    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)?;
    let written = write_and_sync(file, bytes).and_then(|()| rename_when_free(&temp, path));
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written?;
    // The new file is already in place, so a folder that cannot be flushed does not fail the
    // save.
    let _ = os::sync_folder(folder);
    Ok(())
}

/// Writes `bytes` to the new temporary file, waits until they reach the drive, and closes it.
fn write_and_sync(mut file: File, bytes: &[u8]) -> io::Result<()> {
    file.write_all(bytes)?;
    file.sync_all()
}

/// Renames `from` over `to`, waiting a little longer after each failure while antivirus, the
/// search indexer or a sync client holds the file.
fn rename_when_free(from: &Path, to: &Path) -> io::Result<()> {
    let mut wait = Duration::from_millis(10);
    for _ in 0..RENAME_RETRIES {
        match fs::rename(from, to) {
            Err(error) if os::is_held_by_another_program(&error) => {
                thread::sleep(wait);
                wait *= 2;
            }
            other => return other,
        }
    }
    fs::rename(from, to)
}

/// Removes the temporary files a crash left in `folder`. Only names a safe write makes, ending
/// in `.tmp-` and 16 lowercase hex digits, are touched. Only failing to list `folder` is an
/// error. A file that cannot be read or removed, such as one another program holds, stays until
/// the next open.
pub(crate) fn remove_temp_files(folder: &Path) -> io::Result<()> {
    for entry in fs::read_dir(folder)?.flatten() {
        let is_file = entry.file_type().is_ok_and(|kind| kind.is_file());
        if is_file && is_temp_name(&entry.file_name().to_string_lossy()) {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

/// Whether `name` is a safe write's temporary file, such as `meeting.json.tmp-00ff00ff00ff00ff`.
fn is_temp_name(name: &str) -> bool {
    name.rsplit_once(TEMP_MARKER).is_some_and(|(_, random)| {
        let is_lower_hex = |c: char| c.is_ascii_digit() || ('a'..='f').contains(&c);
        random.len() == 16 && random.chars().all(is_lower_hex)
    })
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::write_file_safely;

    /// A write in place can leave a short file after a crash. Replacing the file by rename
    /// leaves a second name of the old file untouched, which a write in place would change.
    #[test]
    fn write_file_safely_never_writes_in_place() {
        let folder = std::env::temp_dir().join(format!("scrb-safe-write-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let path = folder.join("meeting.json");
        fs::write(&path, "old").unwrap();
        let second_name = folder.join("second name.json");
        fs::hard_link(&path, &second_name).unwrap();

        let written = write_file_safely(&path, b"new");
        let (new, old) = (fs::read(&path), fs::read(&second_name));
        fs::remove_dir_all(&folder).unwrap();

        written.unwrap();
        assert_eq!(new.unwrap(), b"new");
        assert_eq!(old.unwrap(), b"old");
    }

    /// A save that fails must leave what was at the path and no temporary file, or the user loses
    /// the old file or open later finds a stray one. A folder at the path makes the rename fail.
    #[cfg(unix)]
    #[test]
    fn write_file_safely_failure_leaves_only_original() {
        let folder = std::env::temp_dir().join(format!("scrb-failed-write-{}", std::process::id()));
        let path = folder.join("meeting.json");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("audio.opus"), "OggS").unwrap();

        let written = write_file_safely(&path, b"new");
        let kept = fs::read(path.join("audio.opus"));
        let entries = fs::read_dir(&folder).unwrap().count();
        fs::remove_dir_all(&folder).unwrap();

        assert!(written.is_err());
        assert_eq!(kept.unwrap(), b"OggS");
        assert_eq!(entries, 1);
    }
}
