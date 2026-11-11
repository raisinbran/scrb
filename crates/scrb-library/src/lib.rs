//! The library folder, with its lock, its meeting folders and their `meeting.json` files.
//!
//! The meeting folders are the source of truth for meetings. Every JSON file is replaced with a
//! safe write, so a crash leaves the old file or the new one, never a short one.
//!
//! Start with [`Library::open`] and [`Library::create_meeting`].

mod error;
mod folder;
mod id;
mod library;
mod meeting;
mod os;
mod safe_write;

pub use error::LibraryError;
pub use id::MeetingId;
pub use library::Library;
pub use meeting::{MeetingFile, MeetingStatus, NewMeeting, Origin};
