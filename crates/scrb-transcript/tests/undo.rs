mod common;

use common::{
    NOW, SENTENCE, correct, final_pass, live_transcript, live_transcript_from, shown_text,
    system_ids,
};
use scrb_transcript::{Correction, CorrectionState, EditKind, HistoryEntry, Track};

/// The label of each history entry, oldest first.
fn labels(entries: &[HistoryEntry]) -> Vec<EditKind> {
    entries.iter().map(|entry| entry.label).collect()
}

/// A fix over words from two segments must show as one word over their whole time, and undo
/// must bring back what the model heard in both segments.
#[test]
fn apply_correction_across_segments_spans_and_undoes() {
    let transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, "we should ask jon", 0),
        ("Speaker 2", Track::System, "smith about the budget", 2000),
    ]);

    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John Smythe");

    let shown = corrected.shown_segments();
    let fix = shown
        .iter()
        .flat_map(|segment| &segment.words)
        .find(|word| word.correction_id.is_some())
        .expect("the fix is shown");
    assert_eq!((fix.start_ms, fix.end_ms), (1500, 2400));
    assert_eq!(
        shown_text(&corrected.undo()),
        "we should ask jon smith about the budget"
    );
}

/// Undoing a wide fix must bring back the smaller fixes it absorbed, or the user loses them.
#[test]
fn undo_reactivates_corrections_a_wider_one_absorbed() {
    let transcript = live_transcript(SENTENCE);
    let inner = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let wide = correct(&inner, &system_ids(&transcript, 2..6), "WIDE");

    let undone = wide.undo();

    assert_eq!(undone.corrections.len(), 1);
    assert_eq!(undone.corrections[0].state, CorrectionState::Active);
    assert_eq!(undone.corrections[0].superseded_by, None);
    assert_eq!(
        shown_text(&undone),
        "we should ask John about the budget before friday"
    );
}

/// Undo takes back the newest edit first and redo makes them again in the order they were
/// made, corrections and speaker renames alike, so the user can step back and forth safely.
#[test]
fn undo_and_redo_step_through_edits() {
    let transcript = live_transcript(SENTENCE);
    let speaker = transcript.speakers[0].id.clone();
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let renamed = corrected
        .rename_speaker(&speaker, "Ana")
        .expect("the speaker exists");

    let once = renamed.undo();
    let twice = once.undo();
    let redone_once = twice.redo();
    let redone_twice = redone_once.redo();

    let fixed = "we should ask John about the budget before friday";
    assert_eq!(
        (once.speakers[0].name.as_deref(), shown_text(&once)),
        (None, fixed.to_owned())
    );
    assert_eq!(shown_text(&twice), SENTENCE);
    assert_eq!(
        (
            redone_once.speakers[0].name.as_deref(),
            shown_text(&redone_once)
        ),
        (None, fixed.to_owned())
    );
    assert_eq!(redone_twice.speakers, renamed.speakers);
    assert_eq!(redone_twice.corrections, renamed.corrections);
    assert_eq!(
        labels(&redone_twice.history.undo),
        [EditKind::Correct, EditKind::RenameSpeaker]
    );
    assert_eq!(redone_twice.revision, renamed.revision + 4);
}

/// A new edit clears the redo list, so redo never makes an old edit on top of text it was not
/// made on.
#[test]
fn rename_speaker_after_undo_clears_redo() {
    let transcript = live_transcript(SENTENCE);
    let speaker = transcript.speakers[0].id.clone();
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let undone = corrected.undo();

    let renamed = undone
        .rename_speaker(&speaker, "Ana")
        .expect("the speaker exists");

    assert_eq!(undone.history.redo.len(), 1);
    assert!(renamed.history.redo.is_empty());
}

/// With nothing to undo or redo, the transcript and its revision stay as they were, so the
/// app saves nothing and announces no change.
#[test]
fn undo_and_redo_without_entries_change_nothing() {
    let transcript = live_transcript(SENTENCE);

    assert_eq!(transcript.undo(), transcript);
    assert_eq!(transcript.redo(), transcript);
}

/// A final pass keeps a fix's history entry while the fix's words survive, so the user can
/// still undo and redo it. It drops a speaker edit's entry, since the pass replaced that
/// speaker, and the entries of a taken-back fix whose words are gone, since undoing them would
/// bring back a fix over missing words.
#[test]
fn undo_after_final_pass_skips_speaker_edits() {
    let transcript = live_transcript(SENTENCE);
    let kept = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let fixed = correct(&kept, &system_ids(&transcript, 9..10), "Monday");
    let edited = fixed
        .revert_correction(&fixed.corrections[1].id, NOW)
        .and_then(|t| t.rename_speaker(&transcript.speakers[0].id, "Ana"))
        .expect("the correction and speaker exist");
    let merged = final_pass(
        &edited,
        "we should ask jon smith about the budget before sunday",
        0,
    );

    let undone = merged.undo();
    let redone = undone.redo();

    assert_eq!(labels(&merged.history.undo), [EditKind::Correct]);
    assert_eq!(
        shown_text(&undone),
        "we should ask jon smith about the budget before sunday"
    );
    assert_eq!(
        shown_text(&redone),
        "we should ask John about the budget before sunday"
    );
}

/// Undo puts back each patch's `before` and redo its `after`, so an edit in place must record
/// the old and new text and a revert the old and new state, or undo restores the wrong fix.
#[test]
fn history_entry_records_edit_and_revert_values() {
    let transcript = live_transcript(SENTENCE);
    let ids = system_ids(&transcript, 3..5);
    let first = correct(&transcript, &ids, "John");
    let edited = correct(&first, &ids, "Johnny");

    let reverted = edited
        .revert_correction(&edited.corrections[0].id, NOW)
        .expect("the correction exists");

    let entries = &reverted.history.undo;
    assert_eq!(
        labels(entries),
        [
            EditKind::Correct,
            EditKind::EditCorrection,
            EditKind::RevertCorrection
        ]
    );
    let text = |value: &Option<Correction>| value.as_ref().map(|c| c.text.clone());
    let edit = &entries[1].corrections[0];
    assert_eq!(
        (text(&edit.before), text(&edit.after)),
        (Some("John".to_owned()), Some("Johnny".to_owned()))
    );
    let state = |value: &Option<Correction>| value.as_ref().map(|c| c.state);
    let revert = &entries[2].corrections[0];
    assert_eq!(
        (state(&revert.before), state(&revert.after)),
        (
            Some(CorrectionState::Active),
            Some(CorrectionState::Reverted)
        )
    );
}
