mod common;

use common::{
    SENTENCE, final_pass, live_transcript, live_transcript_from, model_segment, shown_runs,
    speaker, speaker_id, system_ids,
};
use scrb_transcript::{Track, TranscriptError};

/// Moving a few words to another speaker must show them as their own run between the first
/// speaker's runs, and undo must join the segment again.
#[test]
fn reassign_speaker_shows_three_runs_until_undone() {
    let transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, SENTENCE, 0),
        ("Speaker 2", Track::System, "sounds good", 6000),
    ]);
    let other = speaker_id(&transcript, "Speaker 2");

    let reassigned = transcript
        .reassign_speaker(&system_ids(&transcript, 3..5), &other)
        .expect("the selection is valid");

    assert_eq!(
        shown_runs(&reassigned),
        [
            "Speaker 1: we should ask",
            "Speaker 2: jon smith",
            "Speaker 1: about the budget before friday",
            "Speaker 2: sounds good",
        ]
    );
    assert_eq!(
        shown_runs(&reassigned.undo()),
        [&format!("Speaker 1: {SENTENCE}"), "Speaker 2: sounds good"]
    );
}

/// When the user moves the same words twice, the newest choice must win, or the screen would
/// ignore what the user did last.
#[test]
fn shown_segments_takes_latest_override_covering_word() {
    let transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, SENTENCE, 0),
        ("Speaker 2", Track::System, "sounds good", 6000),
        ("Speaker 3", Track::System, "me too", 8000),
    ]);
    let first = transcript
        .reassign_speaker(
            &system_ids(&transcript, 3..5),
            &speaker_id(&transcript, "Speaker 2"),
        )
        .expect("the selection is valid");

    let second = first
        .reassign_speaker(
            &system_ids(&transcript, 3..4),
            &speaker_id(&transcript, "Speaker 3"),
        )
        .expect("the selection is valid");

    assert_eq!(
        shown_runs(&second)[..4],
        [
            "Speaker 1: we should ask",
            "Speaker 3: jon",
            "Speaker 2: smith",
            "Speaker 1: about the budget before friday",
        ]
    );
}

/// After merging A into B and B into C every word of A shows as C, and merging C into A is
/// refused, since a loop would leave no speaker to show.
#[test]
fn merge_speakers_shows_one_and_refuses_loop() {
    let transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, "hello there", 0),
        ("Speaker 2", Track::System, "hi again", 2000),
        ("Speaker 3", Track::System, "good day", 4000),
    ]);
    let [a, b, c] = ["Speaker 1", "Speaker 2", "Speaker 3"].map(|l| speaker_id(&transcript, l));

    let merged = transcript
        .merge_speakers(&a, &b)
        .and_then(|t| t.merge_speakers(&b, &c))
        .expect("no loop");

    assert_eq!(shown_runs(&merged)[0], "Speaker 3: hello there");
    let looped = merged.merge_speakers(&c, &a);
    assert_eq!(looped, Err(TranscriptError::MergeLoop));
}

/// Splitting off words makes a new speaker that shows only for those words, and undo must
/// take back both the speaker and its override, or the words show a speaker that is gone.
#[test]
fn split_speaker_moves_span_until_undone() {
    let transcript = live_transcript(SENTENCE);

    let split = transcript
        .split_speaker(&system_ids(&transcript, 3..5), "Guest")
        .expect("the selection is valid");

    assert_eq!(
        shown_runs(&split),
        [
            "Speaker ?: we should ask",
            "Guest: jon smith",
            "Speaker ?: about the budget before friday",
        ]
    );
    assert_eq!(shown_runs(&split.undo()), shown_runs(&transcript));
}

/// A split is a time span, so when another speaker talks inside that time on the same track,
/// the split would take those words too; it is refused instead.
#[test]
fn split_speaker_refuses_span_catching_other_words() {
    let transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, "hello there friend", 0),
        ("Speaker 2", Track::System, "yes", 600),
    ]);
    let yes = system_ids(&transcript, 3..4)[0].clone();

    let result = transcript.split_speaker(&system_ids(&transcript, 0..2), "Guest");

    assert_eq!(result, Err(TranscriptError::SpanCatchesOtherWords(yes)));
}

/// A final pass gives every speaker a new id, yet the user's names, merges, reassignments and
/// splits must survive it. A split speaker has no segment, so it keeps its record and typed
/// name.
#[test]
fn apply_final_pass_keeps_speaker_edits() {
    let mut transcript = live_transcript_from(&[
        ("Speaker 1", Track::System, SENTENCE, 0),
        ("Speaker 2", Track::System, "can we talk", 6000),
        ("Speaker 3", Track::System, "sure thing", 9000),
    ]);
    let [a, b, c] = ["Speaker 1", "Speaker 2", "Speaker 3"].map(|l| speaker_id(&transcript, l));
    // Speaker 2 stands for one a voice profile named, which the user did not.
    transcript.speakers[1].name = Some("Bea".to_owned());
    transcript.speakers[1].profile_id = Some("p1".to_owned());
    let edited = transcript
        .rename_speaker(&a, "Ana")
        .and_then(|t| t.merge_speakers(&c, &b))
        .and_then(|t| t.reassign_speaker(&system_ids(&t, 3..5), &b))
        .and_then(|t| t.split_speaker(&system_ids(&t, 9..10), "Dana"))
        .expect("the edits are valid");

    // Speaker A overlaps Speaker 1 most; Speaker B overlaps Speaker 1 a little and all of
    // Speaker 2; Speaker C overlaps Speaker 3, which the user merged into Speaker 2.
    let merged = edited
        .apply_final_pass(&[
            model_segment(
                "Speaker A",
                Track::System,
                "we should ask jon smith about the budget",
                0,
            ),
            model_segment(
                "Speaker B",
                Track::System,
                "before friday can we talk",
                4000,
            ),
            model_segment("Speaker C", Track::System, "sure thing", 9000),
        ])
        .expect("no correction is lost");

    assert_eq!(
        shown_runs(&merged),
        [
            "Speaker A: we should ask",
            "Speaker B: jon smith",
            "Speaker A: about the budget",
            "Speaker B: before",
            "Dana: friday",
            "Speaker B: can we talk",
            "Speaker B: sure thing",
        ]
    );
    let heir_a = speaker(&merged, "Speaker A");
    assert_eq!(
        (heir_a.name.as_deref(), heir_a.user_named),
        (Some("Ana"), true)
    );
    let heir_b = speaker(&merged, "Speaker B");
    assert_eq!(
        (
            heir_b.name.as_deref(),
            heir_b.profile_id.as_deref(),
            heir_b.user_named
        ),
        (Some("Bea"), Some("p1"), false)
    );
    let split_off = speaker(&merged, "Dana");
    assert_eq!(
        (split_off.name.as_deref(), split_off.user_named),
        (Some("Dana"), true)
    );
}

/// When two named speakers overlap one new speaker, it must take the name of the one it
/// overlaps most, since most of its words are that speaker's.
#[test]
fn apply_final_pass_names_heir_after_largest_overlap() {
    let transcript = live_transcript_from(&[
        ("Live 1", Track::System, "hello there", 0),
        ("Live 2", Track::System, "hi again friend", 1000),
    ]);
    let named = transcript
        .rename_speaker(&speaker_id(&transcript, "Live 1"), "Ana")
        .and_then(|t| t.rename_speaker(&speaker_id(&t, "Live 2"), "Bea"))
        .expect("the speakers exist");

    let merged = final_pass(&named, "hello there hi again friend", 0);

    assert_eq!(speaker(&merged, "Speaker 1").name.as_deref(), Some("Bea"));
}
