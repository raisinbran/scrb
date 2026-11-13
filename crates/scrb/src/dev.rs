//! Fakes for tests. A sample meeting, and a fake engine that speaks the
//! engine protocol and can fail in each way the real one can.

use std::fs::{self, OpenOptions};
use std::io::{self, BufRead, Write};
use std::path::Path;
use std::str::FromStr;
use std::thread;
use std::time::Duration;

use jiff::Zoned;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::Error;
use crate::audio::wav_seconds;
use crate::library::{Library, MeetingState, Source, read_json, write_json_safely};
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

/// One `--fault OP:KIND[:after=N]` of the fake engine. It fires once, on the
/// request of `op` that follows `after` earlier ones.
#[derive(Debug, Clone)]
pub struct Fault {
    op: String,
    kind: FaultKind,
    after: usize,
}

#[derive(Debug, Clone)]
enum FaultKind {
    /// An error reply with this code, such as `model_missing`.
    ErrorReply(String),
    /// Exit after one progress line, before the reply.
    Crash,
    /// Read input until it closes, and never reply.
    Hang,
    /// Write a line that is not JSON instead of the reply.
    Malformed,
    /// Send progress lines 0.2 s apart before the reply.
    Slow,
}

impl FromStr for Fault {
    type Err = String;

    fn from_str(text: &str) -> Result<Fault, String> {
        let mut parts = text.split(':');
        let (Some(op), Some(kind)) = (parts.next(), parts.next()) else {
            return Err(format!("{text}: expected OP:KIND[:after=N]"));
        };
        let kind = match kind {
            "model_missing" | "bad_audio" | "out_of_memory" | "bad_request" | "internal" => {
                FaultKind::ErrorReply(kind.to_string())
            }
            "crash" => FaultKind::Crash,
            "hang" => FaultKind::Hang,
            "malformed" => FaultKind::Malformed,
            "slow" => FaultKind::Slow,
            _ => return Err(format!("{text}: unknown fault kind {kind}")),
        };
        let after = match parts.next() {
            None => 0,
            Some(after) => after
                .strip_prefix("after=")
                .and_then(|count| count.parse().ok())
                .ok_or_else(|| format!("{text}: expected after=N"))?,
        };
        Ok(Fault {
            op: op.to_string(),
            kind,
            after,
        })
    }
}

/// A `.ref.json` file, with the words and speaker turns of a clip.
#[derive(Deserialize)]
struct Reference {
    words: Vec<ReferenceWord>,
    turns: Vec<ReferenceTurn>,
}

#[derive(Deserialize)]
struct ReferenceWord {
    start: f64,
    end: f64,
    text: String,
}

#[derive(Deserialize)]
struct ReferenceTurn {
    start: f64,
    end: f64,
    speaker: String,
}

/// Runs the fake engine on stdin and stdout until stdin closes.
///
/// With `reference`, `diarize` returns its turns and `transcribe` the words
/// whose middle falls inside each span. Without it, `diarize` returns one
/// speaker for the whole file and `transcribe` returns `speech`. A worker
/// restarted after a fault counts requests from zero, so a fault fires again,
/// unless `count_file` keeps the count across restarts.
pub fn run_fake_engine(
    reference: Option<&Path>,
    faults: &[Fault],
    count_file: Option<&Path>,
) -> Result<(), Error> {
    let reference: Option<Reference> = reference.map(read_json).transpose()?;
    let mut seen_ops: Vec<String> = match count_file {
        Some(path) => fs::read_to_string(path)
            .unwrap_or_default()
            .lines()
            .map(str::to_string)
            .collect(),
        None => Vec::new(),
    };
    // A real worker has no model to run before `load`, so neither has this one.
    let mut loaded = false;
    let mut lines = io::stdin().lock().lines();
    while let Some(Ok(line)) = lines.next() {
        let request: Value = serde_json::from_str(&line).unwrap_or(Value::Null);
        let id = request["id"].clone();
        let op = request["op"].as_str().unwrap_or_default().to_string();
        let earlier = seen_ops.iter().filter(|seen| **seen == op).count();
        seen_ops.push(op.clone());
        if let Some(path) = count_file {
            let mut file = OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
                .map_err(|cause| Error::file(path, cause))?;
            writeln!(file, "{op}").map_err(|cause| Error::file(path, cause))?;
        }
        let fault = faults
            .iter()
            .find(|fault| fault.op == op && fault.after == earlier);
        match fault.map(|fault| &fault.kind) {
            Some(FaultKind::ErrorReply(code)) => {
                let error = json!({ "code": code, "message": "set by --fault" });
                println!("{}", json!({ "id": id, "ok": false, "error": error }));
                continue;
            }
            Some(FaultKind::Crash) => {
                println!("{}", progress_line(&id, 1, 2));
                std::process::exit(1);
            }
            Some(FaultKind::Hang) => {
                for _ in lines.by_ref() {}
                return Ok(());
            }
            Some(FaultKind::Malformed) => {
                println!("this line is not JSON");
                continue;
            }
            Some(FaultKind::Slow) => {
                for done in 1..=3 {
                    println!("{}", progress_line(&id, done, 3));
                    thread::sleep(Duration::from_millis(200));
                }
            }
            None => {}
        }
        loaded |= op == "load";
        println!(
            "{}",
            fake_reply(&id, &op, &request, reference.as_ref(), loaded)
        );
    }
    Ok(())
}

fn progress_line(id: &Value, done: u64, total: u64) -> Value {
    json!({ "id": id, "progress": { "done": done, "total": total } })
}

/// The successful reply to `request`, or an error reply when it cannot be
/// answered, such as `transcribe` before any `load`.
fn fake_reply(
    id: &Value,
    op: &str,
    request: &Value,
    reference: Option<&Reference>,
    loaded: bool,
) -> Value {
    let error = |code: &str, message: String| {
        let error = json!({ "code": code, "message": message });
        json!({ "id": id, "ok": false, "error": error })
    };
    if !loaded && matches!(op, "diarize" | "vad" | "transcribe") {
        return error("bad_request", format!("{op} before load"));
    }
    let audio_s = || {
        let path = Path::new(request["audio"].as_str().unwrap_or_default());
        wav_seconds(path).map_err(|error| error.message)
    };
    match (op, reference) {
        ("hello", _) => json!({
            "id": id, "ok": true, "engine_version": "0.0.0-fake",
            "models": [{ "name": "fake-asr", "kind": "asr", "present": true }],
            "devices": ["cpu"],
        }),
        ("load", _) => json!({ "id": id, "ok": true, "device": "cpu", "load_s": 0.0 }),
        ("diarize", Some(reference)) => {
            let turns: Vec<Value> = reference
                .turns
                .iter()
                .map(
                    |turn| json!({ "start": turn.start, "end": turn.end, "speaker": turn.speaker }),
                )
                .collect();
            json!({ "id": id, "ok": true, "turns": turns })
        }
        ("vad", Some(reference)) => {
            let spans: Vec<[f64; 2]> = reference
                .turns
                .iter()
                .map(|turn| [turn.start, turn.end])
                .collect();
            json!({ "id": id, "ok": true, "spans": spans })
        }
        ("diarize", None) => match audio_s() {
            Ok(end) => {
                let turn = json!({ "start": 0.0, "end": end, "speaker": "SPEAKER_00" });
                json!({ "id": id, "ok": true, "turns": [turn] })
            }
            Err(message) => error("bad_audio", message),
        },
        ("vad", None) => match audio_s() {
            Ok(end) => json!({ "id": id, "ok": true, "spans": [[0.0, end]] }),
            Err(message) => error("bad_audio", message),
        },
        ("transcribe", _) => {
            let Ok(spans) = serde_json::from_value::<Vec<[f64; 2]>>(request["spans"].clone())
            else {
                return error("bad_request", "transcribe needs spans".to_string());
            };
            let texts: Vec<String> = spans
                .iter()
                .map(|&[start, end]| match reference {
                    Some(reference) => words_inside(reference, start, end),
                    None => "speech".to_string(),
                })
                .collect();
            json!({ "id": id, "ok": true, "texts": texts })
        }
        _ => error("bad_request", format!("unknown op {op:?}")),
    }
}

/// The reference words whose middle falls in `start..end`, joined by spaces.
fn words_inside(reference: &Reference, start: f64, end: f64) -> String {
    reference
        .words
        .iter()
        .filter(|word| (start..end).contains(&((word.start + word.end) / 2.0)))
        .map(|word| word.text.as_str())
        .collect::<Vec<_>>()
        .join(" ")
}
