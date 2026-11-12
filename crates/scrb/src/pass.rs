//! The after-meeting pass diarizes the audio, merges speaker turns,
//! transcribes each turn, applies the glossary and writes the transcript.
//!
//! [`transcribe_meeting`] runs it on a meeting in the library and
//! [`transcribe_file`] on a file, with nothing in the library. Both call
//! [`run_pass`]. [`import_file`] makes a meeting from a file first.

use std::fs;
use std::io;
use std::path::Path;

use jiff::{Timestamp, Zoned};
use regex::{NoExpand, RegexBuilder};
use tempfile::TempDir;

use crate::audio::{read_audio_16k_mono, wav_seconds, write_wav_16k};
use crate::engine::Engine;
use crate::library::{Glossary, Library, Lock, MeetingState, Pass, Source, write_json_safely};
use crate::transcript::{
    EDITS_FILE, EngineInfo, GlossaryReplacement, SUMMARY_FILE, Segment, Speaker, TRANSCRIPT_FILE,
    Transcript, TranscriptKind,
};
use crate::{Error, ErrorCode};

const PASS_TRANSCRIPT_FILE: &str = "pass-transcript.json";
const IMPORT_AUDIO: &str = "audio/import.wav";
const MIX_AUDIO: &str = "audio/mix.wav";
const SUPERSEDED_DIR: &str = "superseded";
/// Neighbouring turns of one speaker merge when the gap between them is
/// shorter than this and the merged turn stays shorter than 30 seconds.
const MERGE_GAP_S: f64 = 1.0;
const MAX_MERGED_TURN_S: f64 = 30.0;

/// The models a pass asks the engine to load. `diarizer` is `None` for
/// `--diarizer none`, which finds speech with `vad` and leaves speakers null.
pub struct PassModels {
    pub asr: String,
    pub diarizer: Option<String>,
}

/// A stretch of audio to transcribe, with the engine's speaker label.
struct SpeakerTurn {
    start: f64,
    end: f64,
    speaker: Option<String>,
}

/// Makes an imported meeting from a WAV or FLAC file and returns its id
/// with the meeting's `.lock` held.
///
/// The file is read before the meeting is made, so a file that is not audio
/// leaves no meeting behind. Its 16 kHz mono copy goes to `audio/import.wav`.
pub fn import_file(library: &Library, file: &Path) -> Result<(String, Lock), Error> {
    let samples = read_audio_16k_mono(file)?;
    let (meeting, lock) = library.create_meeting(Source::Import, &Zoned::now())?;
    let audio = library.meeting_dir(&meeting.id)?.join(IMPORT_AUDIO);
    let audio_dir = audio.parent().expect("the import audio is inside audio/");
    fs::create_dir_all(audio_dir).map_err(|cause| Error::file(audio_dir, cause))?;
    write_wav_16k(&audio, &samples)?;
    Ok((meeting.id, lock))
}

/// Runs the pass on meeting `id`, whose `.lock` the caller holds, and writes
/// `pass-transcript.json` and `transcript.json`.
///
/// A `ready` meeting is `bad_state` and stays untouched unless `force` is
/// set, and `new_engine` is called only after that check. The meeting moves
/// to `passing` and the pass runs. When it succeeds, any earlier transcript,
/// edits and summary move to `superseded/<time>/` and the meeting moves to
/// `ready`. When it fails, they stay in place and the meeting moves to
/// `failed` with the error code in `meeting.json`'s `pass.error`.
pub fn transcribe_meeting(
    library: &Library,
    id: &str,
    _lock: &Lock,
    models: &PassModels,
    force: bool,
    new_engine: impl FnOnce() -> Result<Engine, Error>,
) -> Result<Transcript, Error> {
    let meeting = library.read_meeting(id)?;
    if meeting.state == MeetingState::Ready && !force {
        return Err(Error::new(
            ErrorCode::BadState,
            format!("meeting {id} is ready; pass --force to run the pass again"),
        ));
    }
    let mut engine = new_engine()?;
    let glossary = library.read_glossary()?;
    let dir = library.meeting_dir(id)?;
    let audio = match meeting.source {
        Source::Import => dir.join(IMPORT_AUDIO),
        Source::Recording => dir.join(MIX_AUDIO),
    };
    let mut pass = Pass {
        model: models.asr.clone(),
        diarizer: models.diarizer.clone(),
        started_at: now_utc(),
        finished_at: None,
        error: None,
    };
    library.move_meeting_with_pass(id, MeetingState::Passing, pass.clone())?;
    // Old files move only after the pass succeeds, so a failed pass keeps them.
    // They move whatever the state, since a crash mid-pass leaves a
    // `recorded` meeting that still has them.
    let outcome = run_pass(&mut engine, &audio, id, models, &glossary).and_then(|transcript| {
        supersede_transcript(library, id)?;
        write_json_safely(&dir.join(PASS_TRANSCRIPT_FILE), &transcript)?;
        write_json_safely(&dir.join(TRANSCRIPT_FILE), &transcript)?;
        Ok(transcript)
    });
    pass.finished_at = Some(now_utc());
    match outcome {
        Ok(transcript) => {
            library.move_meeting_with_pass(id, MeetingState::Ready, pass)?;
            Ok(transcript)
        }
        Err(error) => {
            pass.error = serde_json::to_value(error.code)
                .ok()
                .and_then(|code| code.as_str().map(str::to_string));
            library.move_meeting_with_pass(id, MeetingState::Failed, pass)?;
            Err(error)
        }
    }
}

/// Runs the pass on a WAV or FLAC file and writes the transcript to `out`,
/// with nothing in the library. Its `meeting_id` is the file's name without
/// the extension.
pub fn transcribe_file(
    file: &Path,
    out: &Path,
    models: &PassModels,
    glossary: &Glossary,
    engine: &mut Engine,
) -> Result<Transcript, Error> {
    let samples = read_audio_16k_mono(file)?;
    let scratch =
        TempDir::new().map_err(|cause| Error::new(ErrorCode::Internal, cause.to_string()))?;
    let audio = scratch.path().join("audio.wav");
    write_wav_16k(&audio, &samples)?;
    let name = file
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_default();
    let transcript = run_pass(engine, &audio, &name, models, glossary)?;
    write_json_safely(out, &transcript)?;
    Ok(transcript)
}

/// Runs the pass on the 16 kHz mono WAV at `audio` and returns a `pass`
/// transcript for `meeting_id`, without writing it.
pub fn run_pass(
    engine: &mut Engine,
    audio: &Path,
    meeting_id: &str,
    models: &PassModels,
    glossary: &Glossary,
) -> Result<Transcript, Error> {
    // The engine is a separate process, so it gets an absolute path.
    let audio = std::path::absolute(audio).map_err(|cause| Error::file(audio, cause))?;
    let duration_s = wav_seconds(&audio)?;
    let engine_version = engine.hello()?;
    engine.load(&models.asr, models.diarizer.as_deref())?;
    let turns: Vec<SpeakerTurn> = match models.diarizer {
        Some(_) => engine
            .diarize(&audio, duration_s)?
            .into_iter()
            .map(|turn| SpeakerTurn {
                start: turn.start,
                end: turn.end,
                speaker: Some(turn.speaker),
            })
            .collect(),
        None => engine
            .vad(&audio, duration_s)?
            .into_iter()
            .map(|[start, end]| SpeakerTurn {
                start,
                end,
                speaker: None,
            })
            .collect(),
    };
    let turns = merge_turns(turns);
    let spans: Vec<[f64; 2]> = turns.iter().map(|turn| [turn.start, turn.end]).collect();
    let texts = engine.transcribe(&audio, &spans, duration_s)?;
    let (speakers, mut segments) = number_segments(turns, texts);
    let glossary_applied = apply_glossary(&mut segments, glossary);
    Ok(Transcript {
        schema: "scrb.transcript.v1".to_string(),
        meeting_id: meeting_id.to_string(),
        kind: TranscriptKind::Pass,
        duration_s,
        engine: EngineInfo {
            asr: models.asr.clone(),
            diarizer: models.diarizer.clone(),
            engine_version,
            scrb_version: env!("CARGO_PKG_VERSION").to_string(),
        },
        speakers,
        segments,
        gaps: Vec::new(),
        glossary_applied,
    })
}

/// Sorts `turns` by time and merges neighbouring turns of the same speaker
/// that are less than a second apart, while the result stays under 30 s.
fn merge_turns(mut turns: Vec<SpeakerTurn>) -> Vec<SpeakerTurn> {
    turns.sort_by(|a, b| a.start.total_cmp(&b.start));
    let mut merged: Vec<SpeakerTurn> = Vec::new();
    for turn in turns {
        if let Some(last) = merged.last_mut()
            && last.speaker == turn.speaker
            && turn.start - last.end < MERGE_GAP_S
            && turn.end - last.start < MAX_MERGED_TURN_S
        {
            last.end = turn.end;
            continue;
        }
        merged.push(turn);
    }
    merged
}

/// Pairs each turn with its text, drops empty texts, numbers the segments
/// `s0001` on, and names speakers `S1`, `S2` in order of first appearance.
fn number_segments(turns: Vec<SpeakerTurn>, texts: Vec<String>) -> (Vec<Speaker>, Vec<Segment>) {
    let mut labels: Vec<String> = Vec::new();
    let mut segments: Vec<Segment> = Vec::new();
    for (turn, text) in turns.into_iter().zip(texts) {
        let text = text.trim();
        if text.is_empty() {
            continue;
        }
        let speaker = turn.speaker.map(|label| {
            let index = match labels.iter().position(|known| *known == label) {
                Some(index) => index,
                None => {
                    labels.push(label);
                    labels.len() - 1
                }
            };
            format!("S{}", index + 1)
        });
        segments.push(Segment {
            id: format!("s{:04}", segments.len() + 1),
            start: turn.start,
            end: turn.end,
            speaker,
            text: text.to_string(),
        });
    }
    let speakers = (1..=labels.len())
        .map(|number| Speaker {
            id: format!("S{number}"),
            name: None,
        })
        .collect();
    (speakers, segments)
}

/// Replaces each glossary `heard_as` phrase with its term, ignoring case and
/// matching whole words, and returns one record per replacement.
fn apply_glossary(segments: &mut [Segment], glossary: &Glossary) -> Vec<GlossaryReplacement> {
    let mut applied = Vec::new();
    for term in &glossary.terms {
        for phrase in &term.heard_as {
            // An empty phrase would match between every two words.
            if phrase.trim().is_empty() {
                continue;
            }
            let Ok(pattern) = RegexBuilder::new(&format!(r"\b{}\b", regex::escape(phrase)))
                .case_insensitive(true)
                .build()
            else {
                continue;
            };
            for segment in segments.iter_mut() {
                for found in pattern.find_iter(&segment.text) {
                    applied.push(GlossaryReplacement {
                        segment: segment.id.clone(),
                        from: found.as_str().to_string(),
                        to: term.term.clone(),
                    });
                }
                segment.text = pattern
                    .replace_all(&segment.text, NoExpand(&term.term))
                    .into_owned();
            }
        }
    }
    applied
}

/// Moves the meeting's `transcript.json`, `edits.jsonl` and `summary.json`,
/// those that exist, into a new `superseded/<UTC time>/` folder, with `-2`,
/// `-3` and so on added on a clash. It does nothing when none exists.
fn supersede_transcript(library: &Library, id: &str) -> Result<(), Error> {
    let dir = library.meeting_dir(id)?;
    let names: Vec<&str> = [TRANSCRIPT_FILE, EDITS_FILE, SUMMARY_FILE]
        .into_iter()
        .filter(|name| dir.join(name).exists())
        .collect();
    if names.is_empty() {
        return Ok(());
    }
    let superseded = dir.join(SUPERSEDED_DIR);
    fs::create_dir_all(&superseded).map_err(|cause| Error::file(&superseded, cause))?;
    let time = Timestamp::now().strftime("%Y-%m-%dT%H%M%SZ").to_string();
    let mut target = superseded.join(&time);
    let mut clash_count = 1;
    // `create_dir` fails on an existing folder, so an earlier copy is never overwritten.
    loop {
        match fs::create_dir(&target) {
            Ok(()) => break,
            Err(cause) if cause.kind() == io::ErrorKind::AlreadyExists => {
                clash_count += 1;
                target = superseded.join(format!("{time}-{clash_count}"));
            }
            Err(cause) => return Err(Error::file(&target, cause)),
        }
    }
    for name in names {
        let from = dir.join(name);
        fs::rename(&from, target.join(name)).map_err(|cause| Error::file(&from, cause))?;
    }
    Ok(())
}

/// The current UTC time to the second, such as `2026-11-18T09:12:03Z`.
fn now_utc() -> String {
    Timestamp::now().strftime("%Y-%m-%dT%H:%M:%SZ").to_string()
}
