use std::collections::{HashMap, HashSet};

use crate::error::TranscriptError;
use crate::file::{
    Correction, CorrectionState, EditKind, Original, Patch, Segment, Track, Transcript, Word,
};

impl Transcript {
    /// Replaces the selected words' text with `text`, beside the model's words.
    ///
    /// Selecting exactly the words of an active correction edits that correction and keeps its
    /// first original. A wider selection makes the active corrections inside it `Superseded`.
    /// `now` is stored as given in `createdAt` and `updatedAt`.
    ///
    /// # Errors
    ///
    /// Refuses an empty selection, a missing word, words that are not consecutive on one track,
    /// and a selection that covers only part of an active correction.
    pub fn apply_correction(
        &self,
        word_ids: &[String],
        text: &str,
        remember: bool,
        now: &str,
    ) -> Result<Transcript, TranscriptError> {
        let selection = self.select_words(word_ids)?;
        let selected: HashSet<&str> = word_ids.iter().map(String::as_str).collect();
        let touched: Vec<&Correction> = self
            .corrections
            .iter()
            .filter(|correction| correction.state == CorrectionState::Active)
            .filter(|correction| {
                correction
                    .word_ids
                    .iter()
                    .any(|id| selected.contains(id.as_str()))
            })
            .collect();
        let inside = |correction: &Correction| {
            correction
                .word_ids
                .iter()
                .all(|id| selected.contains(id.as_str()))
        };

        let mut next = self.clone();
        if let Some(same) = touched
            .iter()
            .find(|correction| correction.word_ids.len() == word_ids.len() && inside(correction))
        {
            let edited = Correction {
                text: text.to_owned(),
                remember,
                updated_at: now.to_owned(),
                ..(*same).clone()
            };
            next.put_correction(edited.clone());
            next.record_edit(
                EditKind::EditCorrection,
                vec![patch(same, &edited)],
                Vec::new(),
                Vec::new(),
            );
            next.revision += 1;
            return Ok(next);
        }
        if let Some(cut) = touched.iter().find(|correction| !inside(correction)) {
            return Err(TranscriptError::CutsThroughCorrection(cut.id.clone()));
        }

        let (first_segment, first_word) = selection[0];
        let (_, last_word) = selection[selection.len() - 1];
        let correction = Correction {
            id: next.take_id('c'),
            word_ids: word_ids.to_vec(),
            text: text.to_owned(),
            original: Original {
                text: selection
                    .iter()
                    .map(|(_, word)| word.text.as_str())
                    .collect::<Vec<_>>()
                    .join(" "),
                start_ms: first_word.start_ms,
                end_ms: last_word.end_ms,
                speaker_id: first_segment.speaker_id.clone(),
                track: first_segment.track,
            },
            remember,
            state: CorrectionState::Active,
            superseded_by: None,
            created_at: now.to_owned(),
            updated_at: now.to_owned(),
        };
        let mut patches = Vec::new();
        for absorbed in touched {
            let superseded = Correction {
                state: CorrectionState::Superseded,
                superseded_by: Some(correction.id.clone()),
                updated_at: now.to_owned(),
                ..absorbed.clone()
            };
            next.put_correction(superseded.clone());
            patches.push(patch(absorbed, &superseded));
        }
        patches.push(Patch {
            id: correction.id.clone(),
            before: None,
            after: Some(correction.clone()),
        });
        next.corrections.push(correction);
        next.record_edit(EditKind::Correct, patches, Vec::new(), Vec::new());
        next.revision += 1;
        Ok(next)
    }

    /// Sets an active correction to `Reverted`, which frees its words, and makes the corrections
    /// it had absorbed active again. A correction that is not active is left as it is.
    ///
    /// # Errors
    ///
    /// Returns [`TranscriptError::CorrectionNotFound`] when no correction has this id.
    pub fn revert_correction(
        &self,
        correction_id: &str,
        now: &str,
    ) -> Result<Transcript, TranscriptError> {
        let target = self
            .corrections
            .iter()
            .find(|correction| correction.id == correction_id)
            .ok_or_else(|| TranscriptError::CorrectionNotFound(correction_id.to_owned()))?;
        if target.state != CorrectionState::Active {
            return Ok(self.clone());
        }

        let mut next = self.clone();
        let mut patches = Vec::new();
        for correction in &self.corrections {
            let changed = if correction.id == correction_id {
                Correction {
                    state: CorrectionState::Reverted,
                    ..correction.clone()
                }
            } else if correction.superseded_by.as_deref() == Some(correction_id) {
                Correction {
                    state: CorrectionState::Active,
                    superseded_by: None,
                    ..correction.clone()
                }
            } else {
                continue;
            };
            let changed = Correction {
                updated_at: now.to_owned(),
                ..changed
            };
            next.put_correction(changed.clone());
            patches.push(patch(correction, &changed));
        }
        next.record_edit(EditKind::RevertCorrection, patches, Vec::new(), Vec::new());
        next.revision += 1;
        Ok(next)
    }

    /// The words of `active` and `superseded` corrections.
    pub(crate) fn frozen_word_ids(&self) -> HashSet<&str> {
        self.corrections
            .iter()
            .filter(|correction| correction.state != CorrectionState::Reverted)
            .flat_map(|correction| correction.word_ids.iter().map(String::as_str))
            .collect()
    }

    /// The selected words with their segments, if they are consecutive on one track.
    pub(crate) fn select_words(
        &self,
        word_ids: &[String],
    ) -> Result<Vec<(&Segment, &Word)>, TranscriptError> {
        let Some(first_id) = word_ids.first() else {
            return Err(TranscriptError::EmptySelection);
        };
        let tracks: HashMap<&str, Track> = self
            .segments
            .iter()
            .flat_map(|segment| {
                segment
                    .words
                    .iter()
                    .map(|word| (word.id.as_str(), segment.track))
            })
            .collect();
        if let Some(missing) = word_ids.iter().find(|id| !tracks.contains_key(id.as_str())) {
            return Err(TranscriptError::WordNotFound(missing.clone()));
        }

        let words = self.track_words(tracks[first_id.as_str()]);
        let start = words
            .iter()
            .position(|(_, word)| &word.id == first_id)
            .unwrap_or_default();
        let run: Vec<(&Segment, &Word)> =
            words.into_iter().skip(start).take(word_ids.len()).collect();
        let consecutive = run.len() == word_ids.len()
            && run
                .iter()
                .zip(word_ids)
                .all(|((_, word), id)| &word.id == id);
        if !consecutive {
            return Err(TranscriptError::NotConsecutive);
        }
        Ok(run)
    }

    /// Replaces the correction that has `correction.id`.
    fn put_correction(&mut self, correction: Correction) {
        if let Some(slot) = self
            .corrections
            .iter_mut()
            .find(|old| old.id == correction.id)
        {
            *slot = correction;
        }
    }
}

/// A history patch from one existing correction to its new value.
fn patch(before: &Correction, after: &Correction) -> Patch<Correction> {
    Patch {
        id: before.id.clone(),
        before: Some(before.clone()),
        after: Some(after.clone()),
    }
}
