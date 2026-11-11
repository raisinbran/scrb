use std::collections::HashMap;

use crate::file::{Correction, CorrectionState, Pass, Track, Transcript};

/// How the screens style a word.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WordState {
    Provisional,
    Final,
    Corrected,
}

/// A segment as the screens show it.
#[derive(Debug, Clone, PartialEq)]
pub struct ShownSegment {
    pub id: String,
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

        let mut shown = Vec::new();
        for segment in &self.segments {
            let model_state = match segment.pass {
                Pass::Live => WordState::Provisional,
                Pass::Final => WordState::Final,
            };
            let mut words = Vec::new();
            for word in &segment.words {
                match by_word.get(word.id.as_str()) {
                    None => words.push(ShownWord {
                        id: word.id.clone(),
                        text: word.text.clone(),
                        start_ms: word.start_ms,
                        end_ms: word.end_ms,
                        state: model_state,
                        correction_id: None,
                    }),
                    Some(correction) if correction.word_ids[0] == word.id => {
                        let last_id = correction.word_ids[correction.word_ids.len() - 1].as_str();
                        words.push(ShownWord {
                            id: word.id.clone(),
                            text: correction.text.clone(),
                            start_ms: word.start_ms,
                            end_ms: end_by_word.get(last_id).copied().unwrap_or(word.end_ms),
                            state: WordState::Corrected,
                            correction_id: Some(correction.id.clone()),
                        });
                    }
                    // A later word of a correction, already shown with its first word.
                    Some(_) => {}
                }
            }
            if !words.is_empty() {
                shown.push(ShownSegment {
                    id: segment.id.clone(),
                    speaker_id: segment.speaker_id.clone(),
                    track: segment.track,
                    words,
                });
            }
        }
        shown
    }
}
