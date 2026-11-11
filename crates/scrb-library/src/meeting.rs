use serde::{Deserialize, Serialize};

use crate::MeetingId;

/// The contents of one meeting's `meeting.json`, version 1.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingFile {
    pub version: u32,
    pub id: MeetingId,
    pub title: String,
    /// The date the screens show, ISO 8601. The user may change it.
    pub date: String,
    /// When the meeting entered the library. It never changes.
    pub created_at: String,
    pub origin: Origin,
    pub status: MeetingStatus,
    pub duration_ms: u64,
    /// Where the recording ended, on a recovered meeting only.
    pub recovered_end_ms: Option<u64>,
    pub audio_deleted_at: Option<String>,
    /// The user chose to learn voices from this imported file.
    pub build_voice_profiles: bool,
    /// One of a fixed set of messages that are safe to show the user.
    pub transcription_failure: Option<String>,
    /// Paused spans and lost audio. Kept as written until recording gives them types.
    pub gaps: Vec<serde_json::Value>,
    /// Device changes during recording. Kept as written until recording gives them types.
    pub devices: Vec<serde_json::Value>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Origin {
    Recorded,
    Imported,
}

/// The status names the screens show. This crate never writes `deleting`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MeetingStatus {
    Recording,
    Paused,
    Importing,
    FinalPassRunning,
    TranscriptionFailed,
    Ready,
    Recovered,
}

/// What a recording or import knows when it starts its meeting.
#[derive(Debug, Clone)]
pub struct NewMeeting {
    pub id: MeetingId,
    pub title: String,
    /// The date the screens show, ISO 8601, such as `2026-11-12T09:30:00Z`. Its first ten
    /// characters name the folder.
    pub date: String,
    pub origin: Origin,
    /// The current time, stored as `createdAt`.
    pub now: String,
}

impl MeetingFile {
    /// The `meeting.json` of a meeting that is just starting, with status `recording`, or
    /// `importing` for an import.
    pub(crate) fn starting(meeting: &NewMeeting) -> Self {
        let status = match meeting.origin {
            Origin::Recorded => MeetingStatus::Recording,
            Origin::Imported => MeetingStatus::Importing,
        };
        Self {
            version: 1,
            id: meeting.id.clone(),
            title: meeting.title.clone(),
            date: meeting.date.clone(),
            created_at: meeting.now.clone(),
            origin: meeting.origin,
            status,
            duration_ms: 0,
            recovered_end_ms: None,
            audio_deleted_at: None,
            build_voice_profiles: false,
            transcription_failure: None,
            gaps: Vec::new(),
            devices: Vec::new(),
        }
    }
}
