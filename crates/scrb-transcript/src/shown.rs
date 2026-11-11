use std::collections::HashMap;

use crate::file::{Correction, CorrectionState, Pass, Track, Transcript};

/// How the screens style a word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WordState {
    Provisional,
    Final,
    Corrected,
}

/// A segment, or one run of a segment's words with one speaker, as the screens show it.
#[derive(Debug, Clone, PartialEq)]
pub struct ShownSegment {
    /// The segment's id, or for a later run of it the id with `-1`, `-2` and so on added.
    pub id: String,
    /// The speaker the screens show, after overrides and `mergedInto`.
    pub speaker_id: String,
    pub track: Track,
    pub words: Vec<ShownWord>,
}

/// A model word, or one active correction shown as a single word.
#[derive(Debug, Clone, PartialEq)]
pub struct ShownWord {
    /// The model word's id, or a correction's first word id.
    pub id: String,
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
    pub state: WordState,
    pub correction_id: Option<String>,
}

impl Transcript {
    /// The text as the screens show it, which search also reads.
    ///
    /// Each active correction replaces its words with one word that runs from its first word's
    /// start to its last word's end. It appears in the segment that holds its first word.
    ///
    /// Each word shows the speaker of the latest override covering its midpoint, or else its
    /// segment's speaker, followed through `mergedInto`. A segment splits into one shown segment
    /// per run of words with the same speaker.
    pub fn shown_segments(&self) -> Vec<ShownSegment> {
        let mut by_word: HashMap<&str, &Correction> = HashMap::new();
        for correction in &self.corrections {
            if correction.state == CorrectionState::Active {
                for id in &correction.word_ids {
                    by_word.insert(id.as_str(), correction);
                }
            }
        }
        let end_by_word: HashMap<&str, u64> = self
            .segments
            .iter()
            .flat_map(|segment| &segment.words)
            .map(|word| (word.id.as_str(), word.end_ms))
            .collect();

        let mut shown: Vec<ShownSegment> = Vec::new();
        for segment in &self.segments {
            let model_state = match segment.pass {
                Pass::Live => WordState::Provisional,
                Pass::Final => WordState::Final,
            };
            let first_run = shown.len();
            for word in &segment.words {
                let shown_word = match by_word.get(word.id.as_str()) {
                    None => ShownWord {
                        id: word.id.clone(),
                        text: word.text.clone(),
                        start_ms: word.start_ms,
                        end_ms: word.end_ms,
                        state: model_state,
                        correction_id: None,
                    },
                    Some(correction) if correction.word_ids[0] == word.id => {
                        let last_id = correction.word_ids[correction.word_ids.len() - 1].as_str();
                        ShownWord {
                            id: word.id.clone(),
                            text: correction.text.clone(),
                            start_ms: word.start_ms,
                            end_ms: end_by_word.get(last_id).copied().unwrap_or(word.end_ms),
                            state: WordState::Corrected,
                            correction_id: Some(correction.id.clone()),
                        }
                    }
                    // A later word of a correction, already shown with its first word.
                    Some(_) => continue,
                };
                // A corrected word takes the speaker of its first model word.
                let speaker_id = self.shown_speaker_of(segment, word.start_ms, word.end_ms);
                let same_run = shown.len() > first_run
                    && shown.last().is_some_and(|run| run.speaker_id == speaker_id);
                if !same_run {
                    let part = shown.len() - first_run;
                    shown.push(ShownSegment {
                        id: if part == 0 {
                            segment.id.clone()
                        } else {
                            format!("{}-{part}", segment.id)
                        },
                        speaker_id: speaker_id.to_owned(),
                        track: segment.track,
                        words: Vec::new(),
                    });
                }
                if let Some(run) = shown.last_mut() {
                    run.words.push(shown_word);
                }
            }
        }
        shown
    }
}
