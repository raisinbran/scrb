mod common;

use common::{
    NOW, SENTENCE, correct, live_transcript, live_transcript_from, shown_text, system_ids, word_ids,
};
use scrb_transcript::{CorrectionState, Track, TranscriptError};

/// The user must always be able to see and play what the model heard, so a correction keeps
/// the original beside its text and never edits the model's words. The revision moves up by
/// one, because the screens use it to notice changes they missed.
#[test]
fn apply_correction_keeps_original_and_raises_revision() {
    let transcript = live_transcript(SENTENCE);
    let ids = system_ids(&transcript, 3..5);

    let corrected = correct(&transcript, &ids, "John Smythe");

    assert_eq!(
        shown_text(&corrected),
        "we should ask John Smythe about the budget before friday"
    );
    let original = &corrected.corrections[0].original;
    assert_eq!(original.text, "jon smith");
    assert_eq!((original.start_ms, original.end_ms), (1500, 2400));
    assert_eq!(original.speaker_id, transcript.segments[0].speaker_id);
    assert_eq!(original.track, Track::System);
    assert_eq!(corrected.segments, transcript.segments);
    assert_eq!(corrected.revision, transcript.revision + 1);
}

/// A correction must cover one unbroken run of one track, or the screens could not show it as
/// one word; each bad selection is refused with its reason.
#[test]
fn apply_correction_refuses_selection_not_one_run() {
    let transcript = live_transcript_from(&[
        ("Speaker ?", Track::System, SENTENCE, 0),
        ("You", Track::Microphone, "hello there", 500),
    ]);
    let system = system_ids(&transcript, 0..3);
    let mic = word_ids(&transcript, Track::Microphone, 0..1);
    let cases = [
        (
            "gap",
            vec![system[0].clone(), system[2].clone()],
            TranscriptError::NotConsecutive,
        ),
        (
            "missing word",
            vec!["w999".to_owned()],
            TranscriptError::WordNotFound("w999".to_owned()),
        ),
        ("no words", vec![], TranscriptError::EmptySelection),
        (
            "both tracks",
            vec![system[0].clone(), mic[0].clone()],
            TranscriptError::NotConsecutive,
        ),
    ];

    for (case, ids, expected) in cases {
        let result = transcript.apply_correction(&ids, "x", false, NOW);

        assert_eq!(result, Err(expected), "{case}");
    }
}

/// Fixing a fix must not pile up corrections or lose what the model first heard.
#[test]
fn apply_correction_again_edits_same_correction() {
    let transcript = live_transcript(SENTENCE);
    let ids = system_ids(&transcript, 3..5);
    let first = correct(&transcript, &ids, "John Smith");

    let second = correct(&first, &ids, "John Smythe");

    assert_eq!(second.corrections.len(), 1);
    assert_eq!(second.corrections[0].id, first.corrections[0].id);
    assert_eq!(second.corrections[0].text, "John Smythe");
    assert_eq!(second.corrections[0].original.text, "jon smith");
}

/// Two texts cannot both win over the same words, so a selection that covers part of a
/// correction is refused instead of breaking it.
#[test]
fn apply_correction_refuses_cutting_through_a_correction() {
    let transcript = live_transcript(SENTENCE);
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");

    let result = corrected.apply_correction(&system_ids(&transcript, 4..6), "x", false, NOW);

    assert_eq!(
        result,
        Err(TranscriptError::CutsThroughCorrection(
            corrected.corrections[0].id.clone()
        ))
    );
}

/// Taking back a wide fix must bring back the smaller fixes it absorbed, and taking those back
/// too must show the model text again.
#[test]
fn revert_correction_reactivates_absorbed_corrections() {
    let transcript = live_transcript(SENTENCE);
    let inner = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let wide = correct(&inner, &system_ids(&transcript, 2..6), "WIDE");
    let (inner_id, wide_id) = (&wide.corrections[0].id, &wide.corrections[1].id);
    assert_eq!(wide.corrections[0].state, CorrectionState::Superseded);

    let reverted = wide
        .revert_correction(wide_id, NOW)
        .expect("the correction exists");

    assert_eq!(reverted.corrections[0].state, CorrectionState::Active);
    assert_eq!(reverted.corrections[0].superseded_by, None);
    assert_eq!(
        shown_text(&reverted),
        "we should ask John about the budget before friday"
    );
    let all_back = reverted
        .revert_correction(inner_id, NOW)
        .expect("the correction exists");
    assert_eq!(shown_text(&all_back), SENTENCE);
}

/// Reverting only acts on an active correction. Reverting a superseded one must not bring back
/// the fixes under an active wider fix, or the same words would show two fixes; a second
/// revert or an unknown id must not add a history entry or move the revision.
#[test]
fn revert_correction_changes_nothing_without_active_correction() {
    let transcript = live_transcript(SENTENCE);
    let inner = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let wide = correct(&inner, &system_ids(&transcript, 2..6), "WIDE");
    let reverted = inner
        .revert_correction(&inner.corrections[0].id, NOW)
        .expect("the correction exists");
    let cases = [
        (
            "superseded",
            &wide,
            wide.corrections[0].id.as_str(),
            Ok(wide.clone()),
        ),
        (
            "already reverted",
            &reverted,
            reverted.corrections[0].id.as_str(),
            Ok(reverted.clone()),
        ),
        (
            "unknown id",
            &wide,
            "c999",
            Err(TranscriptError::CorrectionNotFound("c999".to_owned())),
        ),
    ];

    for (case, before, id, expected) in cases {
        let result = before.revert_correction(id, NOW);

        assert_eq!(result, expected, "{case}");
    }
}

/// The undo list must stop growing at 200 entries by dropping the oldest, so a long meeting's
/// file stays bounded and the newest edits can still be undone.
#[test]
fn apply_correction_keeps_newest_200_history_entries() {
    let text = vec!["word"; 201].join(" ");
    let mut transcript = live_transcript(&text);
    let ids = system_ids(&transcript, 0..201);
    let mut entry_ids = Vec::new();

    for id in &ids {
        transcript = correct(&transcript, std::slice::from_ref(id), "fix");
        entry_ids.push(transcript.history.undo.last().expect("an entry").id.clone());
    }

    let kept: Vec<&String> = transcript
        .history
        .undo
        .iter()
        .map(|entry| &entry.id)
        .collect();
    assert_eq!(kept.len(), 200);
    assert_eq!(kept[0], &entry_ids[1]);
    assert_eq!(kept[199], &entry_ids[200]);
}
