//! Putting new model text into the transcript without losing a correction.
//!
//! A pass replaces model words, but each run of frozen words keeps its ids and text. The merge
//! finds where each run belongs in the new text, drops the new words there, and gives the run
//! the times of the words it replaced. It works one track at a time.

use std::collections::{HashMap, HashSet};
use std::ops::Range;

use unicode_normalization::UnicodeNormalization;

use crate::error::TranscriptError;
use crate::file::{CorrectionState, Pass, Segment, Speaker, Track, Transcript, Word};

/// How many unfrozen words on each side of a frozen run are looked for in the new text.
const CONTEXT_WORDS: usize = 8;
/// How far from a frozen run's old time its side words are looked for.
const SEARCH_WINDOW_MS: i64 = 20_000;
/// How much longer than the frozen run the region between its matched side words may be.
/// Past it the side words are not trusted, and time decides.
const REGION_SLACK_MS: i64 = 5_000;

/// A run of words from the speech model, which carries no ids.
#[derive(Debug, Clone, PartialEq)]
pub struct ModelSegment {
    /// Words with the same label in one pass belong to one speaker, such as "Speaker 2".
    pub speaker_label: String,
    pub track: Track,
    pub words: Vec<ModelWord>,
}

/// One word from the speech model. Times are milliseconds on the meeting clock.
#[derive(Debug, Clone, PartialEq)]
pub struct ModelWord {
    pub text: String,
    pub start_ms: u64,
    pub end_ms: u64,
}

impl Transcript {
    /// Replaces all model text with the final pass's text, keeping every frozen word.
    ///
    /// Each label in `segments` becomes a new speaker. The old speakers stay in the file, each
    /// merged into its heir among the new ones. Undo and redo entries that touch a speaker or
    /// override, or name a word that is gone, are dropped.
    ///
    /// # Errors
    ///
    /// Returns [`TranscriptError::CorrectionLost`] if the merge would lose a frozen word or
    /// split an active correction.
    pub fn apply_final_pass(
        &self,
        segments: &[ModelSegment],
    ) -> Result<Transcript, TranscriptError> {
        let mut next = self.clone();
        let mut speakers = HashMap::new();
        for segment in segments {
            if !speakers.contains_key(&segment.speaker_label) {
                let id = next.add_speaker(&segment.speaker_label);
                speakers.insert(segment.speaker_label.clone(), id);
            }
        }
        let replaced = std::mem::take(&mut next.segments);
        next.merge_model_text(self, replaced, segments, &speakers, Pass::Final)?;
        next.link_speakers_to_heirs(self);
        next.keep_history_safe_after_pass();
        // The merge counts a revision only when it changed the text or the speakers.
        if next.revision == self.revision && next != *self {
            next.revision += 1;
        }
        Ok(next)
    }

    /// Adds live text, replacing the live segments named in `replaced_segment_ids`.
    ///
    /// A label takes the first speaker that has it, or a new one. Live text adds nothing to the
    /// undo history. A revision that cannot keep every correction whole is dropped, and the
    /// transcript comes back unchanged with the same `revision`, because the final pass replaces
    /// that text anyway.
    pub fn apply_live_pass(
        &self,
        replaced_segment_ids: &[String],
        segments: &[ModelSegment],
    ) -> Transcript {
        let mut next = self.clone();
        let mut speakers = HashMap::new();
        for segment in segments {
            let label = &segment.speaker_label;
            if !speakers.contains_key(label) {
                let known = next.speakers.iter().find(|speaker| &speaker.label == label);
                let id = match known {
                    Some(speaker) => speaker.id.clone(),
                    None => next.add_speaker(label),
                };
                speakers.insert(label.clone(), id);
            }
        }
        let (replaced, kept) = std::mem::take(&mut next.segments)
            .into_iter()
            .partition(|segment| replaced_segment_ids.contains(&segment.id));
        next.segments = kept;
        match next.merge_model_text(self, replaced, segments, &speakers, Pass::Live) {
            Ok(()) => next,
            Err(_) => self.clone(),
        }
    }

    fn add_speaker(&mut self, label: &str) -> String {
        let id = self.take_id('s');
        self.speakers.push(Speaker {
            id: id.clone(),
            label: label.to_owned(),
            name: None,
            profile_id: None,
            user_named: false,
            merged_into: None,
        });
        id
    }

    /// Merges `incoming` in place of `replaced`, adding the result to `self.segments`, then
    /// checks the result against `before` and counts one revision if anything changed.
    fn merge_model_text(
        &mut self,
        before: &Transcript,
        replaced: Vec<Segment>,
        incoming: &[ModelSegment],
        speakers: &HashMap<String, String>,
        pass: Pass,
    ) -> Result<(), TranscriptError> {
        let mut new_segments = Vec::new();
        for model in incoming.iter().filter(|model| !model.words.is_empty()) {
            let id = self.take_id('g');
            let words = model
                .words
                .iter()
                .map(|word| Word {
                    id: self.take_id('w'),
                    text: word.text.clone(),
                    start_ms: word.start_ms,
                    end_ms: word.end_ms,
                })
                .collect();
            new_segments.push(Segment {
                id,
                speaker_id: speakers[&model.speaker_label].clone(),
                track: model.track,
                pass,
                words,
            });
        }

        let frozen = before.frozen_word_ids();
        for track in [Track::Microphone, Track::System] {
            let merged = self.merge_track(&replaced, &new_segments, track, &frozen, pass);
            self.segments.extend(merged);
        }
        self.segments.retain(|segment| !segment.words.is_empty());
        self.segments
            .sort_by_key(|segment| segment.words[0].start_ms);
        check_corrections_kept(before, self)?;
        if *self != *before {
            self.revision += 1;
        }
        Ok(())
    }

    /// One track's new segments, with each frozen run of `replaced` put in its place.
    fn merge_track(
        &mut self,
        replaced: &[Segment],
        incoming: &[Segment],
        track: Track,
        frozen: &HashSet<&str>,
        pass: Pass,
    ) -> Vec<Segment> {
        let old = words_of_track(replaced, track);
        let mut new = words_of_track(incoming, track);
        new.sort_by_key(|(_, word)| word.start_ms);
        let new_words: Vec<&Word> = new.iter().map(|(_, word)| *word).collect();

        // Place the runs in reading order. A run never takes words an earlier run took, and
        // never starts before the earlier run ends.
        let mut placed: Vec<(usize, usize, Vec<Word>)> = Vec::new();
        let mut taken = vec![false; new.len()];
        let mut claimed = 0;
        let mut floor_ms = 0;
        for run in frozen_runs(&old, frozen) {
            let run_words: Vec<&Word> = old[run.clone()].iter().map(|(_, word)| *word).collect();
            let region = locate_run(&old, run.clone(), &new_words, frozen);
            let lo = region.lo.max(claimed);
            let hi = region.hi.max(lo);
            let words = retime_run(&run_words, &new_words, lo..hi, region.shift_ms, floor_ms);
            taken[lo..hi].fill(true);
            claimed = hi;
            floor_ms = words.last().map_or(floor_ms, |word| word.end_ms as i64);
            placed.push((lo, old[run.start].0, words));
        }

        // Rebuild the segments in new-word order. A run inside a segment joins it; a run between
        // segments, or with no new text near it, stands alone as its own segment.
        let mut out: Vec<Segment> = Vec::new();
        let mut slots: HashMap<usize, usize> = HashMap::new();
        let mut placed = placed.into_iter().peekable();
        for i in 0..=new.len() {
            while let Some((_, old_segment, words)) = placed.next_if(|(lo, _, _)| *lo == i) {
                let inside = i < new.len() && (taken[i] || (i > 0 && new[i].0 == new[i - 1].0));
                if inside {
                    let slot = slot_for(&mut out, &mut slots, incoming, new[i].0);
                    out[slot].words.extend(words);
                } else {
                    out.push(Segment {
                        id: self.take_id('g'),
                        speaker_id: replaced[old_segment].speaker_id.clone(),
                        track,
                        pass,
                        words,
                    });
                }
            }
            if i < new.len() && !taken[i] {
                let slot = slot_for(&mut out, &mut slots, incoming, new[i].0);
                out[slot].words.push(new[i].1.clone());
            }
        }
        out
    }
}

/// One track's words in reading order, each with the index of its segment in `segments`.
fn words_of_track(segments: &[Segment], track: Track) -> Vec<(usize, &Word)> {
    segments
        .iter()
        .enumerate()
        .filter(|(_, segment)| segment.track == track)
        .flat_map(|(index, segment)| segment.words.iter().map(move |word| (index, word)))
        .collect()
}

/// The position in `out` of the copy of `incoming[index]`, made with no words on first use.
fn slot_for(
    out: &mut Vec<Segment>,
    slots: &mut HashMap<usize, usize>,
    incoming: &[Segment],
    index: usize,
) -> usize {
    *slots.entry(index).or_insert_with(|| {
        out.push(Segment {
            words: Vec::new(),
            ..incoming[index].clone()
        });
        out.len() - 1
    })
}

/// The index ranges of `old` that hold unbroken runs of frozen words.
fn frozen_runs(old: &[(usize, &Word)], frozen: &HashSet<&str>) -> Vec<Range<usize>> {
    let mut runs = Vec::new();
    let mut start = None;
    for (index, (_, word)) in old.iter().enumerate() {
        match (frozen.contains(word.id.as_str()), start) {
            (true, None) => start = Some(index),
            (false, Some(from)) => {
                runs.push(from..index);
                start = None;
            }
            _ => {}
        }
    }
    if let Some(from) = start {
        runs.push(from..old.len());
    }
    runs
}

/// Where a frozen run goes in the new words. `lo..hi` are the new words it replaces; when
/// empty, `lo` is the position it goes before. `shift_ms` moves the run's old times onto the
/// new text's times.
struct Region {
    lo: usize,
    hi: usize,
    shift_ms: i64,
}

/// Finds the region of `new` that a frozen run replaces, from its side words or its time.
fn locate_run(
    old: &[(usize, &Word)],
    run: Range<usize>,
    new: &[&Word],
    frozen: &HashSet<&str>,
) -> Region {
    let unfrozen = |(_, word): &&(usize, &Word)| !frozen.contains(word.id.as_str());
    let mut before: Vec<&Word> = old[..run.start]
        .iter()
        .rev()
        .filter(unfrozen)
        .take(CONTEXT_WORDS)
        .map(|(_, w)| *w)
        .collect();
    before.reverse();
    let after: Vec<&Word> = old[run.end..]
        .iter()
        .filter(unfrozen)
        .take(CONTEXT_WORDS)
        .map(|(_, w)| *w)
        .collect();
    let run_start = old[run.start].1.start_ms as i64;
    let run_end = old[run.end - 1].1.end_ms as i64;

    let window_start = new
        .iter()
        .position(|word| word.end_ms as i64 >= run_start - SEARCH_WINDOW_MS)
        .unwrap_or(new.len());
    let window_end = window_start
        + new[window_start..]
            .iter()
            .take_while(|word| word.start_ms as i64 <= run_end + SEARCH_WINDOW_MS)
            .count();
    let old_tokens: Vec<String> = before
        .iter()
        .chain(&after)
        .map(|word| fold(&word.text))
        .collect();
    let new_tokens: Vec<String> = new[window_start..window_end]
        .iter()
        .map(|word| fold(&word.text))
        .collect();
    let pairs = common_subsequence(&old_tokens, &new_tokens);
    let (before_pairs, after_pairs): (Vec<_>, Vec<_>) = pairs
        .into_iter()
        .partition(|(old_index, _)| *old_index < before.len());
    // A side's matches count only when 2 of its words match, or its only word does.
    let trusted = |matches: usize, side: usize| side > 0 && matches >= side.min(2);
    let last_before = before_pairs
        .last()
        .filter(|_| trusted(before_pairs.len(), before.len()));
    let first_after = after_pairs
        .first()
        .filter(|_| trusted(after_pairs.len(), after.len()));

    let by_time =
        |shift_ms: i64| region_by_time(new, run_start + shift_ms, run_end + shift_ms, shift_ms);
    match (last_before, first_after) {
        (Some(&(b_old, b_new)), Some(&(_, a_new))) => {
            let lo = window_start + b_new + 1;
            let hi = window_start + a_new;
            let shift_ms = new[lo - 1].end_ms as i64 - before[b_old].end_ms as i64;
            let region_ms = if lo < hi {
                new[hi - 1].end_ms as i64 - new[lo].start_ms as i64
            } else {
                0
            };
            if region_ms <= run_end - run_start + REGION_SLACK_MS {
                Region { lo, hi, shift_ms }
            } else {
                by_time(shift_ms)
            }
        }
        (Some(&(b_old, b_new)), None) => {
            by_time(new[window_start + b_new].end_ms as i64 - before[b_old].end_ms as i64)
        }
        (None, Some(&(a_old, a_new))) => {
            let side_word = after[a_old - before.len()];
            by_time(new[window_start + a_new].start_ms as i64 - side_word.start_ms as i64)
        }
        (None, None) => by_time(0),
    }
}

/// The new words whose midpoints fall within `start_ms..=end_ms`.
fn region_by_time(new: &[&Word], start_ms: i64, end_ms: i64, shift_ms: i64) -> Region {
    let midpoint_x2 = |word: &&Word| (word.start_ms + word.end_ms) as i64;
    let lo = new
        .iter()
        .position(|word| midpoint_x2(word) >= 2 * start_ms)
        .unwrap_or(new.len());
    let hi = lo
        + new[lo..]
            .iter()
            .take_while(|word| midpoint_x2(word) <= 2 * end_ms)
            .count();
    Region { lo, hi, shift_ms }
}

/// The frozen run's words with new times and their own ids and text. The run takes the times
/// of the words it replaces, or its shifted old times when it replaces none, and starts no
/// earlier than `floor_ms`. Its words keep their relative spacing.
fn retime_run(
    run: &[&Word],
    new: &[&Word],
    region: Range<usize>,
    shift_ms: i64,
    floor_ms: i64,
) -> Vec<Word> {
    let old_start = run[0].start_ms as i64;
    let old_length = run[run.len() - 1].end_ms as i64 - old_start;
    let (start, end) = if region.is_empty() {
        let start = old_start + shift_ms;
        let mut end = start + old_length;
        if let Some(next) = new.get(region.start) {
            end = end.min((next.start_ms as i64).max(start));
        }
        (start, end)
    } else {
        (
            new[region.start].start_ms as i64,
            new[region.end - 1].end_ms as i64,
        )
    };
    let start = start.max(floor_ms).max(0);
    let end = end.max(start);
    let scaled = |ms: u64| {
        if old_length == 0 {
            return start as u64;
        }
        let offset = (ms as i64 - old_start) * (end - start);
        (start + (offset + old_length / 2) / old_length) as u64
    };
    run.iter()
        .map(|word| Word {
            start_ms: scaled(word.start_ms),
            end_ms: scaled(word.end_ms),
            ..(*word).clone()
        })
        .collect()
}

/// The text with case, accents and punctuation removed, so "Café," matches "cafe".
fn fold(text: &str) -> String {
    text.nfkd()
        .filter(|c| c.is_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

/// The index pairs of a longest common subsequence of `a` and `b`. Empty tokens never match.
fn common_subsequence(a: &[String], b: &[String]) -> Vec<(usize, usize)> {
    let same = |i: usize, j: usize| !a[i].is_empty() && a[i] == b[j];
    // lengths[i][j] is the length of the longest common subsequence of a[i..] and b[j..].
    let mut lengths = vec![vec![0u32; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            lengths[i][j] = if same(i, j) {
                lengths[i + 1][j + 1] + 1
            } else {
                lengths[i + 1][j].max(lengths[i][j + 1])
            };
        }
    }
    let mut pairs = Vec::new();
    let (mut i, mut j) = (0, 0);
    while i < a.len() && j < b.len() {
        if same(i, j) {
            pairs.push((i, j));
            i += 1;
            j += 1;
        } else if lengths[i + 1][j] >= lengths[i][j + 1] {
            i += 1;
        } else {
            j += 1;
        }
    }
    pairs
}

/// Checks that every frozen word of `before` is in `after` exactly once with the same text, and
/// that each active correction's words still follow each other on one track.
fn check_corrections_kept(before: &Transcript, after: &Transcript) -> Result<(), TranscriptError> {
    let old_text: HashMap<&str, &str> = before
        .segments
        .iter()
        .flat_map(|segment| &segment.words)
        .map(|word| (word.id.as_str(), word.text.as_str()))
        .collect();
    let mut places: HashMap<&str, (Track, usize, &str)> = HashMap::new();
    let mut repeated: HashSet<&str> = HashSet::new();
    for track in [Track::Microphone, Track::System] {
        for (position, (_, word)) in after.track_words(track).into_iter().enumerate() {
            if places
                .insert(word.id.as_str(), (track, position, word.text.as_str()))
                .is_some()
            {
                repeated.insert(word.id.as_str());
            }
        }
    }

    for correction in &before.corrections {
        if correction.state == CorrectionState::Reverted {
            continue;
        }
        let lost = || TranscriptError::CorrectionLost(correction.id.clone());
        let mut previous: Option<(Track, usize)> = None;
        for id in &correction.word_ids {
            let &(track, position, text) = places.get(id.as_str()).ok_or_else(lost)?;
            if repeated.contains(id.as_str()) || old_text.get(id.as_str()) != Some(&text) {
                return Err(lost());
            }
            let follows = previous.is_none_or(|(t, p)| t == track && p + 1 == position);
            if correction.state == CorrectionState::Active && !follows {
                return Err(lost());
            }
            previous = Some((track, position));
        }
    }
    Ok(())
}
