use serde::{Deserialize, Serialize};

/// The longest the undo and redo lists get. Past it the oldest entry is dropped, so a long
/// meeting's file stops growing.
const HISTORY_LIMIT: usize = 200;

/// The contents of one meeting's `transcript.json`, version 1.
///
/// The model's words stay as the speech model heard them. User corrections sit beside them in
/// `corrections` and win in [`Transcript::shown_segments`].
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Transcript {
    pub version: u32,
    pub meeting_id: String,
    /// Goes up by one with every change and never goes down.
    pub revision: u64,
    /// The number in the next new id. It never goes down, so no id is used twice.
    pub next_id: u64,
    pub speakers: Vec<Speaker>,
    /// Sorted by the start of their first word.
    pub segments: Vec<Segment>,
    pub corrections: Vec<Correction>,
    pub speaker_overrides: Vec<SpeakerOverride>,
    pub history: History,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Speaker {
    pub id: String,
    /// "You" or "Speaker 2", from the pass that found this speaker.
    pub label: String,
    /// Set by the user or a voice profile.
    pub name: Option<String>,
    pub profile_id: Option<String>,
    pub user_named: bool,
    /// The speaker this one was merged into. Follow it until it is `None` to find the speaker
    /// the screens show.
    pub merged_into: Option<String>,
}

/// A run of words from one track and one speaker, made by one pass of the speech model.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Segment {
    pub id: String,
    pub speaker_id: String,
    pub track: Track,
    pub pass: Pass,
    pub words: Vec<Word>,
}

/// One word the model heard. Times are milliseconds on the meeting clock.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Word {
    pub id: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Track {
    Microphone,
    /// The whole computer's sound.
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Pass {
    Live,
    Final,
}

/// A user's replacement text for consecutive words of one track.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Correction {
    pub id: String,
    /// In reading order.
    pub word_ids: Vec<String>,
    pub text: String,
    /// What the model heard when the correction was first made. Editing the correction keeps it.
    pub original: Original,
    /// The user wants this correction added to the vocabulary.
    pub remember: bool,
    pub state: CorrectionState,
    /// The wider correction that absorbed this one.
    pub superseded_by: Option<String>,
    /// The time text the caller passed in.
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Original {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker_id: String,
    pub track: Track,
}

/// The words of an `Active` or `Superseded` correction are frozen. No pass may change their ids
/// or text, only their times. A `Reverted` correction stays in the file for the history and
/// freezes nothing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CorrectionState {
    Active,
    Superseded,
    Reverted,
}

/// A user's choice that a time span on one track belongs to a given speaker.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeakerOverride {
    pub id: String,
    pub track: Track,
    pub start_ms: u64,
    pub end_ms: u64,
    pub speaker_id: String,
}

/// Undo and redo, newest entry last.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    pub undo: Vec<HistoryEntry>,
    pub redo: Vec<HistoryEntry>,
}

/// One user edit, as the before and after of each record it changed.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub label: EditKind,
    pub corrections: Vec<Patch<Correction>>,
    pub speakers: Vec<Patch<Speaker>>,
    pub overrides: Vec<Patch<SpeakerOverride>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EditKind {
    Correct,
    EditCorrection,
    RevertCorrection,
    RenameSpeaker,
    MergeSpeakers,
    ReassignSpeaker,
    SplitSpeaker,
}

/// One record's value before and after an edit. `None` means the record did not exist.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Patch<T> {
    pub id: String,
    pub before: Option<T>,
    pub after: Option<T>,
}

impl Transcript {
    /// An empty transcript for a new meeting.
    pub fn new(meeting_id: &str) -> Self {
        Self {
            version: 1,
            meeting_id: meeting_id.to_owned(),
            revision: 0,
            next_id: 1,
            speakers: Vec::new(),
            segments: Vec::new(),
            corrections: Vec::new(),
            speaker_overrides: Vec::new(),
            history: History::default(),
        }
    }

    /// Takes the next number from `next_id` and puts `kind` before it, as in `w12` for a word.
    pub(crate) fn take_id(&mut self, kind: char) -> String {
        let id = format!("{kind}{}", self.next_id);
        self.next_id += 1;
        id
    }

    /// One track's words in reading order, segment by segment and then word by word, each with
    /// its segment.
    pub(crate) fn track_words(&self, track: Track) -> Vec<(&Segment, &Word)> {
        self.segments
            .iter()
            .filter(|segment| segment.track == track)
            .flat_map(|segment| segment.words.iter().map(move |word| (segment, word)))
            .collect()
    }

    /// Adds a user edit to the undo list and clears the redo list.
    pub(crate) fn record_edit(
        &mut self,
        label: EditKind,
        corrections: Vec<Patch<Correction>>,
        speakers: Vec<Patch<Speaker>>,
        overrides: Vec<Patch<SpeakerOverride>>,
    ) {
        let entry = HistoryEntry {
            id: self.take_id('h'),
            label,
            corrections,
            speakers,
            overrides,
        };
        push_entry(&mut self.history.undo, entry);
        self.history.redo.clear();
    }
}

/// Adds `entry` as the newest in an undo or redo list, dropping the oldest past the limit.
pub(crate) fn push_entry(list: &mut Vec<HistoryEntry>, entry: HistoryEntry) {
    list.push(entry);
    if list.len() > HISTORY_LIMIT {
        list.remove(0);
    }
}
