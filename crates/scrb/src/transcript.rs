//! The transcript JSON format, the edits Codex makes to a meeting's current
//! `transcript.json`, the edit log and the summary, and export as Markdown or
//! plain text.
//!
//! Each edit holds the meeting's `.lock` while it runs, rewrites
//! `transcript.json` with `kind` set to `refined` and appends one line to
//! `edits.jsonl`. `pass-transcript.json` is never edited.

use std::mem;

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::library::{Library, append_json_line, read_json, write_json_safely};
use crate::{Error, ErrorCode};

pub(crate) const TRANSCRIPT_FILE: &str = "transcript.json";
const EDITS_FILE: &str = "edits.jsonl";
const SUMMARY_FILE: &str = "summary.json";

/// A live, pass or current transcript. Times are seconds on the meeting's
/// timeline, and segments are sorted by time and never overlap.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Transcript {
    pub schema: String,
    pub meeting_id: String,
    pub kind: TranscriptKind,
    pub duration_s: f64,
    pub engine: EngineInfo,
    pub speakers: Vec<Speaker>,
    pub segments: Vec<Segment>,
    pub gaps: Vec<Gap>,
    pub glossary_applied: Vec<GlossaryReplacement>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TranscriptKind {
    Live,
    Pass,
    Refined,
}

/// The models and versions that made a transcript.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EngineInfo {
    pub asr: String,
    pub diarizer: Option<String>,
    pub engine_version: String,
    pub scrb_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Speaker {
    pub id: String,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Segment {
    /// `s` plus a number, assigned by the pass and never changed after.
    pub id: String,
    pub start: f64,
    pub end: f64,
    /// Null in live transcripts and when no diarizer ran.
    pub speaker: Option<String>,
    pub text: String,
}

/// Audio the capture helper marked missing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gap {
    pub start: f64,
    pub end: f64,
    pub cause: String,
}

/// One glossary replacement the pass made in a segment.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlossaryReplacement {
    pub segment: String,
    pub from: String,
    pub to: String,
}

/// The contents of `summary.json`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub schema: String,
    pub text: String,
    pub action_items: Vec<ActionItem>,
    pub by: String,
    pub at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionItem {
    pub text: String,
    pub owner: Option<String>,
    pub due: Option<String>,
}

/// One line of `edits.jsonl`.
#[derive(Serialize)]
struct Edit {
    at: String,
    by: String,
    #[serde(flatten)]
    change: Change,
}

#[derive(Serialize)]
#[serde(tag = "op", rename_all = "snake_case")]
enum Change {
    FixPassage {
        segment: String,
        before: String,
        after: String,
    },
    NameSpeaker {
        speaker: String,
        before: Option<String>,
        after: String,
    },
}

/// Reads a meeting's current `transcript.json`.
pub fn read_transcript(library: &Library, meeting_id: &str) -> Result<Transcript, Error> {
    read_json(&library.meeting_dir(meeting_id)?.join(TRANSCRIPT_FILE))
}

/// Replaces the text of segment `segment_id` with `text`, if the segment
/// still holds `expected_text`.
///
/// Otherwise the edit is `stale` and changes nothing, so an edit based on an
/// old read never overwrites a newer one. While a pass holds the meeting's
/// `.lock`, the edit is `busy`.
pub fn fix_passage(
    library: &Library,
    meeting_id: &str,
    segment_id: &str,
    expected_text: &str,
    text: &str,
    by: &str,
) -> Result<Transcript, Error> {
    let _lock = library.lock_meeting(meeting_id)?;
    let mut transcript = read_transcript(library, meeting_id)?;
    let segment = transcript
        .segments
        .iter_mut()
        .find(|segment| segment.id == segment_id)
        .ok_or_else(|| {
            Error::new(
                ErrorCode::NotFound,
                format!("no segment {segment_id} in {meeting_id}"),
            )
        })?;
    if segment.text != expected_text {
        return Err(Error::new(
            ErrorCode::Stale,
            format!("segment {segment_id} no longer holds the expected text"),
        ));
    }
    let before = mem::replace(&mut segment.text, text.to_string());
    let change = Change::FixPassage {
        segment: segment_id.to_string(),
        before,
        after: text.to_string(),
    };
    save_edit(library, meeting_id, &mut transcript, by, change)?;
    Ok(transcript)
}

/// Sets the name of speaker `speaker_id`. While a pass holds the meeting's
/// `.lock`, the edit is `busy`.
pub fn name_speaker(
    library: &Library,
    meeting_id: &str,
    speaker_id: &str,
    name: &str,
    by: &str,
) -> Result<Transcript, Error> {
    let _lock = library.lock_meeting(meeting_id)?;
    let mut transcript = read_transcript(library, meeting_id)?;
    let speaker = transcript
        .speakers
        .iter_mut()
        .find(|speaker| speaker.id == speaker_id)
        .ok_or_else(|| {
            Error::new(
                ErrorCode::NotFound,
                format!("no speaker {speaker_id} in {meeting_id}"),
            )
        })?;
    let before = speaker.name.replace(name.to_string());
    let change = Change::NameSpeaker {
        speaker: speaker_id.to_string(),
        before,
        after: name.to_string(),
    };
    save_edit(library, meeting_id, &mut transcript, by, change)?;
    Ok(transcript)
}

/// Reads a meeting's `summary.json`, or `None` when no summary was written.
pub fn read_summary(library: &Library, meeting_id: &str) -> Result<Option<Summary>, Error> {
    match read_json(&library.meeting_dir(meeting_id)?.join(SUMMARY_FILE)) {
        Ok(summary) => Ok(Some(summary)),
        Err(error) if error.code == ErrorCode::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Writes a meeting's `summary.json`, replacing any earlier summary. While a
/// pass holds the meeting's `.lock`, this is `busy`.
pub fn write_summary(
    library: &Library,
    meeting_id: &str,
    text: &str,
    action_items: Vec<ActionItem>,
    by: &str,
) -> Result<Summary, Error> {
    let _lock = library.lock_meeting(meeting_id)?;
    let summary = Summary {
        schema: "scrb.summary.v1".to_string(),
        text: text.to_string(),
        action_items,
        by: by.to_string(),
        at: now_utc(),
    };
    write_json_safely(
        &library.meeting_dir(meeting_id)?.join(SUMMARY_FILE),
        &summary,
    )?;
    Ok(summary)
}

/// The meeting as Markdown, with the title, the summary and its action items,
/// then each segment with its speaker's name and start time.
pub fn to_markdown(title: &str, transcript: &Transcript, summary: Option<&Summary>) -> String {
    let mut out = format!("# {title}\n");
    if let Some(summary) = summary {
        out += &format!("\n## Summary\n\n{}\n", summary.text);
        if !summary.action_items.is_empty() {
            out += "\n### Action items\n\n";
        }
        for item in &summary.action_items {
            out += &format!("- {}\n", describe_action_item(item));
        }
    }
    out += "\n## Transcript\n\n";
    for line in export_lines(transcript) {
        let time = format_time(line.start);
        match line.speaker {
            Some(name) => out += &format!("**{name}** [{time}] {}\n\n", line.text),
            None => out += &format!("[{time}] {}\n\n", line.text),
        }
    }
    out
}

/// The meeting as plain text, in the same order as [`to_markdown`].
pub fn to_text(title: &str, transcript: &Transcript, summary: Option<&Summary>) -> String {
    let mut out = format!("{title}\n");
    if let Some(summary) = summary {
        out += &format!("\nSummary\n{}\n", summary.text);
        for item in &summary.action_items {
            out += &format!("- {}\n", describe_action_item(item));
        }
    }
    out += "\nTranscript\n";
    for line in export_lines(transcript) {
        let time = format_time(line.start);
        match line.speaker {
            Some(name) => out += &format!("{name} [{time}] {}\n", line.text),
            None => out += &format!("[{time}] {}\n", line.text),
        }
    }
    out
}

/// Logs the edit, then writes the edited transcript as `refined` in the
/// folder of `meeting_id`, the meeting the caller locked. A failed log write
/// leaves the transcript unchanged.
fn save_edit(
    library: &Library,
    meeting_id: &str,
    transcript: &mut Transcript,
    by: &str,
    change: Change,
) -> Result<(), Error> {
    let dir = library.meeting_dir(meeting_id)?;
    let edit = Edit {
        at: now_utc(),
        by: by.to_string(),
        change,
    };
    append_json_line(&dir.join(EDITS_FILE), &edit)?;
    transcript.kind = TranscriptKind::Refined;
    write_json_safely(&dir.join(TRANSCRIPT_FILE), transcript)
}

/// The current UTC time to the second, such as `2026-11-18T09:12:03Z`.
fn now_utc() -> String {
    Timestamp::now().strftime("%Y-%m-%dT%H:%M:%SZ").to_string()
}

/// One segment or gap as export prints it.
struct ExportLine {
    start: f64,
    speaker: Option<String>,
    text: String,
}

/// Segments and gaps in time order. A gap reads "(audio missing)" instead of
/// passing for silence.
fn export_lines(transcript: &Transcript) -> Vec<ExportLine> {
    let mut lines: Vec<ExportLine> = transcript
        .segments
        .iter()
        .map(|segment| ExportLine {
            start: segment.start,
            speaker: segment
                .speaker
                .as_deref()
                .map(|id| speaker_name(transcript, id)),
            text: segment.text.clone(),
        })
        .collect();
    lines.extend(transcript.gaps.iter().map(|gap| ExportLine {
        start: gap.start,
        speaker: None,
        text: "(audio missing)".to_string(),
    }));
    lines.sort_by(|a, b| a.start.total_cmp(&b.start));
    lines
}

/// The speaker's name, or the speaker id, such as `S2`, while no one has
/// named them.
fn speaker_name(transcript: &Transcript, speaker_id: &str) -> String {
    transcript
        .speakers
        .iter()
        .find(|speaker| speaker.id == speaker_id)
        .and_then(|speaker| speaker.name.clone())
        .unwrap_or_else(|| speaker_id.to_string())
}

fn describe_action_item(item: &ActionItem) -> String {
    let mut text = item.text.clone();
    if let Some(owner) = &item.owner {
        text += &format!(" (owner {owner})");
    }
    if let Some(due) = &item.due {
        text += &format!(" (due {due})");
    }
    text
}

/// Seconds on the meeting's timeline as hours, minutes and seconds, such as `0:01:05`.
fn format_time(seconds: f64) -> String {
    let whole_seconds = seconds.max(0.0) as u64;
    format!(
        "{}:{:02}:{:02}",
        whole_seconds / 3600,
        whole_seconds / 60 % 60,
        whole_seconds % 60
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::Value;
    use tempfile::TempDir;

    use super::*;
    use crate::dev::write_sample_meeting;

    /// A library holding the sample meeting, and that meeting's id.
    fn sample_library() -> (TempDir, Library, String) {
        let folder = TempDir::new().expect("a temporary folder");
        let library = Library::open(folder.path()).expect("an empty library opens");
        let meeting_id = write_sample_meeting(&library).expect("the sample meeting is written");
        (folder, library, meeting_id)
    }

    /// An edit based on an old read must not overwrite a newer one, so
    /// neither the transcript nor the edit log may change.
    #[test]
    fn fix_passage_refuses_stale_expected_text() {
        let (_folder, library, meeting_id) = sample_library();

        let refused = fix_passage(
            &library,
            &meeting_id,
            "s0002",
            "an older reading",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap_err();

        assert_eq!(refused.code, ErrorCode::Stale);
        let transcript = read_transcript(&library, &meeting_id).unwrap();
        assert_eq!(transcript.segments[1].text, "the cube flow cost is up");
        assert!(
            !library
                .meeting_dir(&meeting_id)
                .unwrap()
                .join(EDITS_FILE)
                .exists()
        );
    }

    /// An accepted fix must reach `transcript.json`, marked `refined`, and
    /// `edits.jsonl`.
    #[test]
    fn fix_passage_rewrites_segment_and_logs_edit() {
        let (_folder, library, meeting_id) = sample_library();

        fix_passage(
            &library,
            &meeting_id,
            "s0002",
            "the cube flow cost is up",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap();

        let transcript = read_transcript(&library, &meeting_id).unwrap();
        assert_eq!(transcript.kind, TranscriptKind::Refined);
        assert_eq!(transcript.segments[1].text, "the Kubeflow cost is up");
        let log =
            fs::read_to_string(library.meeting_dir(&meeting_id).unwrap().join(EDITS_FILE)).unwrap();
        assert_eq!(log.lines().count(), 1);
        let edit: Value = serde_json::from_str(log.trim_end()).unwrap();
        assert_eq!(edit["op"], "fix_passage");
        assert_eq!(edit["segment"], "s0002");
        assert_eq!(edit["before"], "the cube flow cost is up");
        assert_eq!(edit["after"], "the Kubeflow cost is up");
    }

    /// While a pass holds the meeting's `.lock`, an edit must be refused, or
    /// the pass would write over it.
    #[test]
    fn fix_passage_reports_busy_while_meeting_locked() {
        let (_folder, library, meeting_id) = sample_library();
        let _pass_lock = library.lock_meeting(&meeting_id).unwrap();

        let refused = fix_passage(
            &library,
            &meeting_id,
            "s0002",
            "the cube flow cost is up",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap_err();

        assert_eq!(refused.code, ErrorCode::Busy);
    }

    /// A copied meeting folder still names the original meeting in its
    /// `transcript.json`, and an edit to the copy must not overwrite the
    /// original's transcript.
    #[test]
    fn fix_passage_writes_only_its_meeting_folder() {
        let (_folder, library, meeting_id) = sample_library();
        let meeting_dir = library.meeting_dir(&meeting_id).unwrap();
        let copy_dir = library.meeting_dir("copy").unwrap();
        fs::create_dir(&copy_dir).unwrap();
        fs::copy(
            meeting_dir.join(TRANSCRIPT_FILE),
            copy_dir.join(TRANSCRIPT_FILE),
        )
        .unwrap();

        fix_passage(
            &library,
            "copy",
            "s0002",
            "the cube flow cost is up",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap();

        let original = read_transcript(&library, &meeting_id).unwrap();
        assert_eq!(original.segments[1].text, "the cube flow cost is up");
        assert!(!meeting_dir.join(EDITS_FILE).exists());
        let copy = read_transcript(&library, "copy").unwrap();
        assert_eq!(copy.segments[1].text, "the Kubeflow cost is up");
    }

    /// An edit that cannot be logged must not reach the transcript, or
    /// `edits.jsonl` would miss a change that took effect.
    #[test]
    fn fix_passage_keeps_transcript_when_log_fails() {
        let (_folder, library, meeting_id) = sample_library();
        // A folder in place of the log makes every append to it fail.
        fs::create_dir(library.meeting_dir(&meeting_id).unwrap().join(EDITS_FILE)).unwrap();

        let refused = fix_passage(
            &library,
            &meeting_id,
            "s0002",
            "the cube flow cost is up",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap_err();

        assert_eq!(refused.code, ErrorCode::Internal);
        let transcript = read_transcript(&library, &meeting_id).unwrap();
        assert_eq!(transcript.kind, TranscriptKind::Pass);
        assert_eq!(transcript.segments[1].text, "the cube flow cost is up");
    }

    /// A crash can leave half a line at the end of `edits.jsonl`, and the
    /// next edit must still be logged as a line of its own.
    #[test]
    fn fix_passage_logs_whole_line_after_partial_line() {
        let (_folder, library, meeting_id) = sample_library();
        let log_path = library.meeting_dir(&meeting_id).unwrap().join(EDITS_FILE);
        fs::write(&log_path, r#"{"at":"2026-11-18T09"#).unwrap();

        fix_passage(
            &library,
            &meeting_id,
            "s0002",
            "the cube flow cost is up",
            "the Kubeflow cost is up",
            "codex",
        )
        .unwrap();

        let log = fs::read_to_string(&log_path).unwrap();
        let last_line = log.lines().last().unwrap();
        let edit: Value = serde_json::from_str(last_line).unwrap();
        assert_eq!(edit["after"], "the Kubeflow cost is up");
    }
}
