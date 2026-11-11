use std::io;
use std::path::Path;

/// The Windows error for a file another program has open.
const ERROR_SHARING_VIOLATION: i32 = 32;
/// The Windows error for a file that cannot be changed now, such as one an antivirus scans.
const ERROR_ACCESS_DENIED: i32 = 5;

/// Windows cannot flush a folder this way. A rename lost to power loss leaves the old file.
pub(crate) fn sync_folder(_folder: &Path) -> io::Result<()> {
    Ok(())
}

/// Whether a rename or removal failed only because another program holds the file for now.
pub(crate) fn is_held_by_another_program(error: &io::Error) -> bool {
    matches!(
        error.raw_os_error(),
        Some(ERROR_SHARING_VIOLATION | ERROR_ACCESS_DENIED)
    )
}
