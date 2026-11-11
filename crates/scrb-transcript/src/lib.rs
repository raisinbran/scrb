//! The transcript of one meeting, as stored in its `transcript.json`.
//!
//! Every function here is pure. It takes a [`Transcript`] and its inputs, and returns a new
//! transcript or an error, without touching files, the clock or a random source. The caller
//! passes the current time, and new ids come from the file's own `nextId` counter, so the same
//! edits always give the same file. A function that changes the transcript returns it with
//! `revision` one higher; one that changes nothing returns it with the same `revision`.
//!
//! Start with [`Transcript::apply_correction`], [`Transcript::revert_correction`] and
//! [`Transcript::shown_segments`].

mod corrections;
mod error;
mod file;
mod shown;

pub use error::TranscriptError;
pub use file::{
    Correction, CorrectionState, EditKind, History, HistoryEntry, Original, Pass, Patch, Segment,
    Speaker, SpeakerOverride, Track, Transcript, Word,
};
pub use shown::{ShownSegment, ShownWord, WordState};
