use std::fs::File;
use std::io;
use std::path::Path;

/// Flushes `folder` itself, so a rename inside it survives power loss.
pub(crate) fn sync_folder(folder: &Path) -> io::Result<()> {
    File::open(folder)?.sync_all()
}

/// Nothing on a local macOS drive holds a file in a way that blocks a rename. An SMB share can
/// block one, and the write then fails and the old file stays.
pub(crate) fn is_held_by_another_program(_error: &io::Error) -> bool {
    false
}
