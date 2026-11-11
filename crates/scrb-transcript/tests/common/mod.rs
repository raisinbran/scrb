//! Builders for the transcript tests. Model words are 400 ms long and start 500 ms apart.

// Each test file uses only some of these helpers.
#![allow(dead_code)]

use scrb_transcript::{ModelSegment, ModelWord, Pass, Segment, Speaker, Track, Transcript, Word};

/// The time every test edit is made at.
pub const NOW: &str = "2026-11-11T09:00:00Z";

/// The sentence most tests correct. "jon smith" is words 3 and 4, from 1500 to 2400 ms.
pub const SENTENCE: &str = "we should ask jon smith about the budget before friday";

/// Model words for `text`, the first starting at `start_ms`.
pub fn model_words(text: &str, start_ms: u64) -> Vec<ModelWord> {
    text.split_whitespace()
        .enumerate()
        .map(|(index, word)| {
            let start = start_ms + 500 * index as u64;
            ModelWord {
                text: word.to_owned(),
                start_ms: start,
                end_ms: start + 400,
            }
        })
        .collect()
}

/// One model segment of `text` on `track`, starting at `start_ms`.
pub fn model_segment(label: &str, track: Track, text: &str, start_ms: u64) -> ModelSegment {
    ModelSegment {
        speaker_label: label.to_owned(),
        track,
        words: model_words(text, start_ms),
    }
}

/// A meeting whose live pass heard `text` on the system track from 0 ms.
pub fn live_transcript(text: &str) -> Transcript {
    live_transcript_from(&[("Speaker ?", Track::System, text, 0)])
}

/// A meeting whose live pass heard each `(label, track, text, start_ms)` as one segment with
/// its own speaker. Give the parts in order of their start.
pub fn live_transcript_from(parts: &[(&str, Track, &str, u64)]) -> Transcript {
    let mut transcript = Transcript::new("m1");
    for &(label, track, text, start_ms) in parts {
        let speaker_id = take_id(&mut transcript, 's');
        transcript.speakers.push(Speaker {
            id: speaker_id.clone(),
            label: label.to_owned(),
            name: None,
            profile_id: None,
            user_named: false,
            merged_into: None,
        });
        let segment_id = take_id(&mut transcript, 'g');
        let mut words = Vec::new();
        for (index, word) in text.split_whitespace().enumerate() {
            let start = start_ms + 500 * index as u64;
            words.push(Word {
                id: take_id(&mut transcript, 'w'),
                text: word.to_owned(),
                start_ms: start,
                end_ms: start + 400,
            });
        }
        transcript.segments.push(Segment {
            id: segment_id,
            speaker_id,
            track,
            pass: Pass::Live,
            words,
        });
    }
    transcript
}

/// The next id from the transcript's `next_id` counter, such as `w3` for `kind` `w`.
fn take_id(transcript: &mut Transcript, kind: char) -> String {
    let id = format!("{kind}{}", transcript.next_id);
    transcript.next_id += 1;
    id
}

/// The ids of one track's words `range` in reading order.
pub fn word_ids(
    transcript: &Transcript,
    track: Track,
    range: std::ops::Range<usize>,
) -> Vec<String> {
    let ids: Vec<String> = transcript
        .segments
        .iter()
        .filter(|segment| segment.track == track)
        .flat_map(|segment| segment.words.iter().map(|word| word.id.clone()))
        .collect();
    ids[range].to_vec()
}

/// The ids of system words `range`.
pub fn system_ids(transcript: &Transcript, range: std::ops::Range<usize>) -> Vec<String> {
    word_ids(transcript, Track::System, range)
}

/// Every shown word's text, joined with spaces.
pub fn shown_text(transcript: &Transcript) -> String {
    let words: Vec<String> = transcript
        .shown_segments()
        .into_iter()
        .flat_map(|segment| segment.words)
        .map(|word| word.text)
        .collect();
    words.join(" ")
}

/// Corrects `ids` to `text` and expects it to succeed.
pub fn correct(transcript: &Transcript, ids: &[String], text: &str) -> Transcript {
    transcript
        .apply_correction(ids, text, false, NOW)
        .expect("the selection is valid")
}

/// A final pass that heard `text` on the system track from `start_ms`.
pub fn final_pass(transcript: &Transcript, text: &str, start_ms: u64) -> Transcript {
    let segment = model_segment("Speaker 1", Track::System, text, start_ms);
    transcript
        .apply_final_pass(&[segment])
        .expect("no correction is lost")
}
