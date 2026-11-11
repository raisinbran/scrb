//! Steps that differ by operating system.

// Linux runs only in development. It uses the macOS code, which needs nothing beyond Unix.
#[cfg(unix)]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(unix)]
pub(crate) use macos::{is_held_by_another_program, sync_folder};
#[cfg(windows)]
pub(crate) use windows::{is_held_by_another_program, sync_folder};
