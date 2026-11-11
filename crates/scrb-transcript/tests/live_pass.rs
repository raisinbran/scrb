mod common;

use common::{SENTENCE, correct, live_transcript, model_segment, shown_text, system_ids};
use scrb_transcript::{Track, Transcript};

/// The live pass revises its recent text under the same freeze rule as the final pass, and a
/// revision is not a user edit, so the undo list stays as it was.
#[test]
fn apply_live_pass_keeps_correction_and_history() {
    let transcript = live_transcript(SENTENCE);
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let revised = model_segment(
        "Speaker ?",
        Track::System,
        "we should ask jon smith about budgets",
        0,
    );

    let merged = corrected.apply_live_pass(&[corrected.segments[0].id.clone()], &[revised]);

    assert_eq!(shown_text(&merged), "we should ask John about budgets");
    assert_eq!(merged.history, corrected.history);
}

/// A revision that would split a fix across other words is dropped whole, leaving the
/// transcript and its revision as they were, since the final pass redoes that text anyway.
#[test]
fn apply_live_pass_drops_correction_splitting_revision() {
    let first = model_segment("Speaker ?", Track::System, "please ask", 0);
    let second = model_segment("Speaker ?", Track::System, "john today", 1000);
    let transcript = Transcript::new("m1").apply_live_pass(&[], &[first, second]);
    let corrected = correct(&transcript, &system_ids(&transcript, 1..3), "ask Jane");
    let revised = model_segment("Speaker ?", Track::System, "please ask him", 0);

    let merged = corrected.apply_live_pass(&[corrected.segments[0].id.clone()], &[revised]);

    assert_eq!(merged, corrected);
}

/// A live pass with no new words leaves the transcript as it was, `revision` included, so the
/// app does not save and announce a change for every stretch of silence.
#[test]
fn apply_live_pass_without_words_changes_nothing() {
    let transcript = live_transcript(SENTENCE);

    let merged = transcript.apply_live_pass(&[], &[]);

    assert_eq!(merged, transcript);
}
