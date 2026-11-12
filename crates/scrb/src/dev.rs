//! Fakes for tests.

use jiff::Zoned;

use crate::Error;
use crate::library::{Library, MeetingState, Source, write_json_safely};
use crate::transcript::{
    EngineInfo, Segment, Speaker, TRANSCRIPT_FILE, Transcript, TranscriptKind,
};

/// Adds a `ready` meeting with id `2026-11-17-1000` and returns its id.
///
/// Its invented `transcript.json` has three segments, `s0001` to `s0003`.
/// Speaker `S1` is named Dana and speaker `S2` has no name yet. Segment
/// `s0002`, by `S2`, reads "the cube flow cost is up".
pub fn write_sample_meeting(library: &Library) -> Result<String, Error> {
    let started_at: Zoned = "2026-11-17T10:00:12-05:00[-05:00]"
        .parse()
        .expect("the sample start time is valid");
    let (meeting, _lock) = library.create_meeting(Source::Import, &started_at)?;
    library.move_meeting(&meeting.id, MeetingState::Passing)?;
    let transcript_path = library.meeting_dir(&meeting.id)?.join(TRANSCRIPT_FILE);
    write_json_safely(&transcript_path, &sample_transcript(&meeting.id))?;
    library.move_meeting(&meeting.id, MeetingState::Ready)?;
    Ok(meeting.id)
}

/// The invented transcript of the sample meeting.
fn sample_transcript(meeting_id: &str) -> Transcript {
    let segment = |id: &str, start: f64, end: f64, speaker: &str, text: &str| Segment {
        id: id.to_string(),
        start,
        end,
        speaker: Some(speaker.to_string()),
        text: text.to_string(),
    };
    Transcript {
        schema: "scrb.transcript.v1".to_string(),
        meeting_id: meeting_id.to_string(),
        kind: TranscriptKind::Pass,
        duration_s: 20.0,
        engine: EngineInfo {
            asr: "parakeet-tdt-0.6b-v3".to_string(),
            diarizer: Some("pyannote-community-1".to_string()),
            engine_version: "0.1.0".to_string(),
            scrb_version: env!("CARGO_PKG_VERSION").to_string(),
        },
        speakers: vec![
            Speaker {
                id: "S1".to_string(),
                name: Some("Dana".to_string()),
            },
            Speaker {
                id: "S2".to_string(),
                name: None,
            },
        ],
        segments: vec![
            segment(
                "s0001",
                3.42,
                9.8,
                "S1",
                "Okay, let's start with the Kubeflow budget.",
            ),
            segment("s0002", 10.1, 13.0, "S2", "the cube flow cost is up"),
            segment(
                "s0003",
                13.5,
                16.2,
                "S1",
                "Then we can retire the old cluster.",
            ),
        ],
        gaps: Vec::new(),
        glossary_applied: Vec::new(),
    }
}
