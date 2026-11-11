//! Speaker edits, the speaker the screens show, and heirs after a final pass.
//!
//! An edit never changes a segment's `speakerId`. A merge sets `mergedInto`, and a reassigned
//! or split span becomes a speaker override. An override names a track and a time span, not
//! word ids, so it still applies after a final pass replaces the words.

use std::collections::{BTreeMap, HashSet};

use crate::error::TranscriptError;
use crate::file::{EditKind, Patch, Segment, Speaker, SpeakerOverride, Transcript};

impl Transcript {
    /// Gives a speaker the name the user typed and marks it `userNamed`.
    ///
    /// # Errors
    ///
    /// Returns [`TranscriptError::SpeakerNotFound`] when no speaker has this id.
    pub fn rename_speaker(
        &self,
        speaker_id: &str,
        name: &str,
    ) -> Result<Transcript, TranscriptError> {
        let speaker = self.find_speaker(speaker_id)?;
        let renamed = Speaker {
            name: Some(name.to_owned()),
            user_named: true,
            ..speaker.clone()
        };
        Ok(self.with_speaker_edit(EditKind::RenameSpeaker, speaker, renamed))
    }

    /// Merges speaker `from_id` into `into_id`, so the screens show `from_id`'s words as the
    /// speaker `into_id` leads to.
    ///
    /// # Errors
    ///
    /// Returns [`TranscriptError::SpeakerNotFound`] for an unknown id, and
    /// [`TranscriptError::MergeLoop`] when `into_id`'s `mergedInto` already leads to `from_id`,
    /// including when they are the same speaker.
    pub fn merge_speakers(
        &self,
        from_id: &str,
        into_id: &str,
    ) -> Result<Transcript, TranscriptError> {
        let from = self.find_speaker(from_id)?;
        self.find_speaker(into_id)?;
        if self.merge_chain(into_id).contains(&from_id) {
            return Err(TranscriptError::MergeLoop);
        }
        let merged = Speaker {
            merged_into: Some(into_id.to_owned()),
            ..from.clone()
        };
        Ok(self.with_speaker_edit(EditKind::MergeSpeakers, from, merged))
    }

    /// Shows the selected words as `speaker_id` by adding an override from the first word's
    /// start to the last word's end on their track.
    ///
    /// # Errors
    ///
    /// Refuses an unknown speaker, and a selection that is empty, names a missing word, or is
    /// not consecutive on one track.
    pub fn reassign_speaker(
        &self,
        word_ids: &[String],
        speaker_id: &str,
    ) -> Result<Transcript, TranscriptError> {
        self.find_speaker(speaker_id)?;
        let mut next = self.clone();
        let speaker_override = next.override_for(word_ids, speaker_id)?;
        next.speaker_overrides.push(speaker_override.clone());
        let patch = make_added_patch(speaker_override.id.clone(), speaker_override.clone());
        next.record_edit(
            EditKind::ReassignSpeaker,
            Vec::new(),
            Vec::new(),
            vec![patch],
        );
        next.revision += 1;
        Ok(next)
    }

    /// Moves the selected words to a new speaker, through a new override. The new speaker takes
    /// `new_label`, the name the user typed, as its label and its name, marked `userNamed`, and
    /// is the last in `speakers`.
    ///
    /// # Errors
    ///
    /// Refuses a selection that is empty, names a missing word, or is not consecutive on one
    /// track, and [`TranscriptError::SpanCatchesOtherWords`] when another word on the track has
    /// its midpoint inside the selection's span, since the override would move it too.
    pub fn split_speaker(
        &self,
        word_ids: &[String],
        new_label: &str,
    ) -> Result<Transcript, TranscriptError> {
        let mut next = self.clone();
        let speaker = Speaker {
            id: next.take_id('s'),
            label: new_label.to_owned(),
            name: Some(new_label.to_owned()),
            profile_id: None,
            user_named: true,
            merged_into: None,
        };
        let speaker_override = next.override_for(word_ids, &speaker.id)?;
        let selected: HashSet<&str> = word_ids.iter().map(String::as_str).collect();
        if let Some((_, caught)) = self
            .track_words(speaker_override.track)
            .into_iter()
            .filter(|(_, word)| !selected.contains(word.id.as_str()))
            .find(|(_, word)| covers_midpoint(&speaker_override, word.start_ms, word.end_ms))
        {
            return Err(TranscriptError::SpanCatchesOtherWords(caught.id.clone()));
        }
        next.speakers.push(speaker.clone());
        next.speaker_overrides.push(speaker_override.clone());
        let override_patch = make_added_patch(speaker_override.id.clone(), speaker_override);
        next.record_edit(
            EditKind::SplitSpeaker,
            Vec::new(),
            vec![make_added_patch(speaker.id.clone(), speaker)],
            vec![override_patch],
        );
        next.revision += 1;
        Ok(next)
    }

    /// The speaker the screens show for a word of `segment` from `start_ms` to `end_ms`. This
    /// is the speaker of the latest override covering that word's midpoint, or else the
    /// segment's speaker, followed through `mergedInto`.
    pub(crate) fn shown_speaker_of<'a>(
        &'a self,
        segment: &'a Segment,
        start_ms: u64,
        end_ms: u64,
    ) -> &'a str {
        let assigned = self
            .speaker_overrides
            .iter()
            .rev()
            .find(|o| o.track == segment.track && covers_midpoint(o, start_ms, end_ms))
            .map_or(segment.speaker_id.as_str(), |o| o.speaker_id.as_str());
        self.shown_speaker(assigned)
    }

    /// After a final pass, links each speaker of `before` to its heir, the new speaker whose
    /// segments overlap it most in time on the same track, so ids in overrides and voice links
    /// keep working.
    ///
    /// A speaker the user named, or that others were merged into, gives its heir its name,
    /// `profileId` and `userNamed`. A speaker that already has `mergedInto` keeps it. A new
    /// speaker whose best match the user had merged away is merged into the speaker that match
    /// now leads to, so the user's merges survive.
    pub(crate) fn link_speakers_to_heirs(&mut self, before: &Transcript) {
        let old_ids: HashSet<&str> = before.speakers.iter().map(|s| s.id.as_str()).collect();
        // Overlap in milliseconds, keyed by (old speaker, new speaker). A BTreeMap keeps ties
        // in one order, so the same pass always picks the same heir.
        let mut overlap: BTreeMap<(String, String), u64> = BTreeMap::new();
        for old in &before.segments {
            for new in &self.segments {
                if new.track != old.track || old_ids.contains(new.speaker_id.as_str()) {
                    continue;
                }
                let (old_start, old_end) = span_of(old);
                let (new_start, new_end) = span_of(new);
                let shared = old_end
                    .min(new_end)
                    .saturating_sub(old_start.max(new_start));
                if shared > 0 {
                    let key = (old.speaker_id.clone(), new.speaker_id.clone());
                    *overlap.entry(key).or_default() += shared;
                }
            }
        }

        let merged_into_others: HashSet<&str> = before
            .speakers
            .iter()
            .filter_map(|s| s.merged_into.as_deref())
            .collect();
        let mut heirs: Vec<(&Speaker, String, u64)> = before
            .speakers
            .iter()
            .filter_map(|old| {
                let (key, ms) = overlap
                    .iter()
                    .filter(|((old_id, _), _)| *old_id == old.id)
                    .max_by_key(|(_, ms)| **ms)?;
                Some((old, key.1.clone(), *ms))
            })
            .collect();
        // When two old speakers pass a name to one heir, the one overlapping it most wins.
        heirs.sort_by_key(|(_, _, ms)| *ms);
        for (old, heir_id, _) in heirs {
            let confirmed = old.user_named || merged_into_others.contains(old.id.as_str());
            if let Some(heir) = self.speaker_mut(&heir_id).filter(|_| confirmed) {
                heir.name.clone_from(&old.name);
                heir.profile_id.clone_from(&old.profile_id);
                heir.user_named = old.user_named;
            }
            if let Some(linked) = self
                .speaker_mut(&old.id)
                .filter(|s| s.merged_into.is_none())
            {
                linked.merged_into = Some(heir_id);
            }
        }

        let new_ids: Vec<String> = self
            .speakers
            .iter()
            .filter(|s| !old_ids.contains(s.id.as_str()))
            .map(|s| s.id.clone())
            .collect();
        for new_id in new_ids {
            let best_match = overlap
                .iter()
                .filter(|((_, id), _)| *id == new_id)
                .max_by_key(|(_, ms)| **ms)
                .map(|((old_id, _), _)| old_id.as_str());
            let Some(old) = best_match.and_then(|id| before.speakers.iter().find(|s| s.id == id))
            else {
                continue;
            };
            if old.merged_into.is_none() {
                continue;
            }
            let target = self.shown_speaker(&old.id).to_owned();
            if let Some(speaker) = self.speaker_mut(&new_id).filter(|_| target != new_id) {
                speaker.merged_into = Some(target);
            }
        }
    }

    /// The speaker `speaker_id`'s `mergedInto` leads to, or `speaker_id` itself.
    fn shown_speaker<'a>(&'a self, speaker_id: &'a str) -> &'a str {
        let chain = self.merge_chain(speaker_id);
        chain[chain.len() - 1]
    }

    /// `speaker_id`, then each speaker its `mergedInto` leads to, stopping before a repeat.
    fn merge_chain<'a>(&'a self, speaker_id: &'a str) -> Vec<&'a str> {
        let mut chain = vec![speaker_id];
        let mut current = speaker_id;
        while let Some(next) = self
            .speakers
            .iter()
            .find(|s| s.id == current)
            .and_then(|s| s.merged_into.as_deref())
        {
            if chain.contains(&next) {
                break;
            }
            chain.push(next);
            current = next;
        }
        chain
    }

    fn find_speaker(&self, speaker_id: &str) -> Result<&Speaker, TranscriptError> {
        self.speakers
            .iter()
            .find(|s| s.id == speaker_id)
            .ok_or_else(|| TranscriptError::SpeakerNotFound(speaker_id.to_owned()))
    }

    fn speaker_mut(&mut self, speaker_id: &str) -> Option<&mut Speaker> {
        self.speakers.iter_mut().find(|s| s.id == speaker_id)
    }

    /// The transcript with `before` replaced by `after`, recorded as one edit.
    fn with_speaker_edit(&self, label: EditKind, before: &Speaker, after: Speaker) -> Transcript {
        let mut next = self.clone();
        if let Some(slot) = next.speaker_mut(&before.id) {
            *slot = after.clone();
        }
        let patch = Patch {
            id: before.id.clone(),
            before: Some(before.clone()),
            after: Some(after),
        };
        next.record_edit(label, Vec::new(), vec![patch], Vec::new());
        next.revision += 1;
        next
    }

    /// A new override for the selected words' track and times, naming `speaker_id`.
    fn override_for(
        &mut self,
        word_ids: &[String],
        speaker_id: &str,
    ) -> Result<SpeakerOverride, TranscriptError> {
        let selection = self.select_words(word_ids)?;
        let (first_segment, first_word) = selection[0];
        let (_, last_word) = selection[selection.len() - 1];
        let (track, start_ms, end_ms) =
            (first_segment.track, first_word.start_ms, last_word.end_ms);
        Ok(SpeakerOverride {
            id: self.take_id('o'),
            track,
            start_ms,
            end_ms,
            speaker_id: speaker_id.to_owned(),
        })
    }
}

/// Whether a word from `start_ms` to `end_ms` has its midpoint inside the override's span,
/// ends included.
fn covers_midpoint(speaker_override: &SpeakerOverride, start_ms: u64, end_ms: u64) -> bool {
    let midpoint_x2 = start_ms + end_ms;
    2 * speaker_override.start_ms <= midpoint_x2 && midpoint_x2 <= 2 * speaker_override.end_ms
}

/// A segment's first word's start and last word's end, or zeros for a segment with no words.
fn span_of(segment: &Segment) -> (u64, u64) {
    let start = segment.words.first().map_or(0, |word| word.start_ms);
    let end = segment.words.last().map_or(0, |word| word.end_ms);
    (start, end)
}

/// A patch recording that the edit added `record`.
fn make_added_patch<T>(id: String, record: T) -> Patch<T> {
    Patch {
        id,
        before: None,
        after: Some(record),
    }
}
