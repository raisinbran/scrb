//! The library folder, with its lock, its meeting folders, their `meeting.json` files and the two
//! databases.
//!
//! The meeting folders are the source of truth for meetings. `index.sqlite` holds the meeting list
//! and can be rebuilt from the folders at any time. `library.sqlite` holds settings, which only the
//! user can recreate. Every JSON file is replaced with a safe write, so a crash leaves the old file
//! or the new one, never a short one.
//!
//! Start with [`Library::open`], then [`Library::rebuild_index`], [`Library::create_meeting`],
//! [`Library::meetings`], [`Library::search`] and [`Library::delete_meeting`].

mod database;
mod delete;
mod error;
mod folder;
mod id;
mod index;
mod library;
mod meeting;
mod os;
mod safe_write;
mod search;

pub use delete::DeleteReport;
pub use error::LibraryError;
pub use id::MeetingId;
pub use index::{IndexedMeeting, RebuildReport};
pub use library::Library;
pub use meeting::{MeetingFile, MeetingStatus, NewMeeting, Origin};
pub use search::{MeetingMatches, SearchResults, TranscriptMatch};
