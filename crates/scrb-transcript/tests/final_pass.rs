mod common;

use std::collections::HashSet;

use common::{
    NOW, SENTENCE, correct, final_pass, live_transcript, live_transcript_from, model_segment,
    shown_text, system_ids, word_ids,
};
use scrb_transcript::{CorrectionState, Track, Transcript, TranscriptError, Word};

/// Every word of every segment, in file order.
fn all_words(transcript: &Transcript) -> Vec<&Word> {
    transcript
        .segments
        .iter()
        .flat_map(|segment| &segment.words)
        .collect()
}

/// The word with this id.
fn find_word<'a>(transcript: &'a Transcript, id: &str) -> &'a Word {
    all_words(transcript)
        .into_iter()
        .find(|word| word.id == id)
        .expect("the word is kept")
}

/// A user's fix must win over the final pass even when the model hears the words differently,
/// and what the live pass heard must stay stored beneath it.
#[test]
fn apply_final_pass_keeps_correction_heard_differently() {
    let transcript = live_transcript(SENTENCE);
    let ids = system_ids(&transcript, 3..5);
    let corrected = correct(&transcript, &ids, "J. Smythe");

    let merged = final_pass(
        &corrected,
        "we should ask john smit about the budget before friday",
        0,
    );

    assert_eq!(
        shown_text(&merged),
        "we should ask J. Smythe about the budget before friday"
    );
    assert_eq!(find_word(&merged, &ids[0]).text, "jon");
    assert_eq!(find_word(&merged, &ids[1]).text, "smith");
}

/// When the final pass's times drift by 3 seconds and its spelling differs in case, accents
/// and punctuation, the side words still place the fix, so the fixed words show once.
#[test]
fn apply_final_pass_shows_drifted_correction_once() {
    let transcript = live_transcript("José Müller jon smith Zoë's café");
    let ids = system_ids(&transcript, 2..4);
    let corrected = correct(&transcript, &ids, "John Smythe");

    let merged = final_pass(&corrected, "jose, muller john smith zoes Cafe.", 3000);

    assert_eq!(shown_text(&merged), "jose, muller John Smythe zoes Cafe.");
    let (jon, smith) = (find_word(&merged, &ids[0]), find_word(&merged, &ids[1]));
    assert_eq!((jon.text.as_str(), jon.start_ms), ("jon", 4000));
    assert_eq!((smith.text.as_str(), smith.end_ms), ("smith", 4900));
}

/// When the final pass hears much more speech between a fix's side words, the fix must not
/// swallow it; time decides which new words the fix replaces, and the rest stay.
#[test]
fn apply_final_pass_keeps_long_new_speech() {
    let transcript = live_transcript(SENTENCE);
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");
    let filler = vec!["meanwhile"; 30].join(" ");

    let merged = final_pass(
        &corrected,
        &format!("we should ask {filler} about the budget before friday"),
        0,
    );

    let kept = vec!["meanwhile"; 28].join(" ");
    assert_eq!(
        shown_text(&merged),
        format!("we should ask John {kept} about the budget before friday")
    );
}

/// A fix must survive a final pass that hears nothing near it, whether it hears nothing at all
/// or only speech ten minutes later.
#[test]
fn apply_final_pass_keeps_isolated_correction() {
    let transcript = live_transcript(SENTENCE);
    let corrected = correct(&transcript, &system_ids(&transcript, 3..5), "John");

    let empty = corrected
        .apply_final_pass(&[])
        .expect("no correction is lost");
    let far = final_pass(&corrected, "completely different words", 600_000);

    assert_eq!(shown_text(&empty), "John");
    assert_eq!(shown_text(&far), "John completely different words");
}

/// Fixes side by side and fixes far apart must keep their order through repeated final passes,
/// or the user's text would come back scrambled.
#[test]
fn apply_final_pass_keeps_correction_order_twice() {
    let transcript = live_transcript(SENTENCE);
    let first = correct(&transcript, &system_ids(&transcript, 3..4), "John");
    let second = correct(&first, &system_ids(&transcript, 4..5), "Smythe");
    let corrected = correct(&second, &system_ids(&transcript, 9..10), "Monday");

    let once = final_pass(&corrected, SENTENCE, 0);
    let twice = final_pass(
        &once,
        "we should ask jon smyth about a budget by friday",
        200,
    );

    assert_eq!(
        shown_text(&once),
        "we should ask John Smythe about the budget before Monday"
    );
    assert_eq!(
        shown_text(&twice),
        "we should ask John Smythe about a budget by Monday"
    );
}

/// New words get fresh ids from the file's counter, so no new word can take a frozen word's id
/// and change its text, even when it lands exactly on that word.
#[test]
fn apply_final_pass_never_reuses_word_ids() {
    let transcript = live_transcript(SENTENCE);
    let ids = system_ids(&transcript, 3..4);
    let corrected = correct(&transcript, &ids, "John");

    let merged = final_pass(&corrected, "we should ask MODEL WINS", 0);

    let words = all_words(&merged);
    let unique: HashSet<&str> = words.iter().map(|word| word.id.as_str()).collect();
    assert_eq!(unique.len(), words.len());
    assert_eq!(find_word(&merged, &ids[0]).text, "jon");
    let old: HashSet<&str> = all_words(&corrected)
        .iter()
        .map(|word| word.id.as_str())
        .collect();
    let new_ids = words.iter().filter(|word| word.id != ids[0]);
    assert!(
        new_ids
            .into_iter()
            .all(|word| !old.contains(word.id.as_str()))
    );
}

/// The app saves a merged transcript only when `revision` moved, so a final pass that changed
/// the text but kept the old revision would lose the model's new text without a word.
#[test]
fn apply_final_pass_raises_revision_by_one() {
    let transcript = live_transcript(SENTENCE);

    let merged = final_pass(&transcript, "we should ask john smith about the budget", 0);

    assert_eq!(merged.revision, transcript.revision + 1);
}

/// A taken-back fix must not hold the model's words in place, yet its record stays for the
/// history.
#[test]
fn apply_final_pass_replaces_reverted_correction_words() {
    let transcript = live_transcript(SENTENCE);
    let corrected = correct(&transcript, &system_ids(&transcript, 3..4), "John");
    let reverted = corrected
        .revert_correction(&corrected.corrections[0].id, NOW)
        .expect("the correction exists");

    let merged = final_pass(&reverted, "we should ask john", 0);

    assert_eq!(shown_text(&merged), "we should ask john");
    assert_eq!(merged.corrections.len(), 1);
    assert_eq!(merged.corrections[0].state, CorrectionState::Reverted);
}

/// The merge works per track, so system text at the same time never moves a microphone fix.
#[test]
fn apply_final_pass_keeps_tracks_apart() {
    let system = live_transcript(SENTENCE);
    let microphone = model_segment("You", Track::Microphone, "yes i agree", 1000);
    let transcript = system.apply_live_pass(&[], &[microphone]);
    let corrected = correct(
        &transcript,
        &word_ids(&transcript, Track::Microphone, 2..3),
        "concur",
    );

    let merged = corrected
        .apply_final_pass(&[
            model_segment("Speaker 1", Track::System, "we should ask john smith", 0),
            model_segment("You", Track::Microphone, "yes i agree", 1000),
        ])
        .expect("no correction is lost");

    let shown = merged.shown_segments();
    let mic: Vec<&str> = shown
        .iter()
        .filter(|segment| segment.track == Track::Microphone)
        .flat_map(|segment| segment.words.iter().map(|word| word.text.as_str()))
        .collect();
    assert_eq!(mic, ["yes", "i", "concur"]);
}

/// A small seeded generator, so the random run is the same on every machine.
struct Seeded(u64);

impl Seeded {
    /// A number below `limit`.
    fn below(&mut self, limit: u64) -> u64 {
        self.0 = self
            .0
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(1_442_695_040_888_963_407);
        (self.0 >> 33) % limit
    }

    /// `count` words from a small vocabulary, so side words often repeat.
    fn text(&mut self, count: u64) -> String {
        const VOCABULARY: [&str; 12] = [
            "the", "a", "plan", "budget", "team", "risk", "ship", "date", "yes", "no", "scope",
            "call",
        ];
        let words: Vec<&str> = (0..count)
            .map(|_| VOCABULARY[self.below(12) as usize])
            .collect();
        words.join(" ")
    }
}

/// Over many random meetings, a final pass with unrelated text, starting up to 2 seconds
/// earlier or later than the live text, keeps every active fix and shows each exactly once.
#[test]
fn apply_final_pass_keeps_all_random_corrections() {
    let mut random = Seeded(7);
    for round in 0..40 {
        let text = random.text(300);
        let mut transcript = live_transcript_from(&[("Speaker ?", Track::System, &text, 2000)]);
        for fix in 0..25 {
            let start = random.below(290) as usize;
            let length = 1 + random.below(6) as usize;
            let ids = system_ids(&transcript, start..start + length);
            match transcript.apply_correction(&ids, &format!("fix{fix}"), false, NOW) {
                Ok(next) => transcript = next,
                Err(error) => assert!(
                    matches!(error, TranscriptError::CutsThroughCorrection(_)),
                    "{error:?}"
                ),
            }
        }
        let drift_ms = random.below(4001) as i64 - 2000;
        let start_ms = (2000 + drift_ms) as u64;
        let count = 150 + random.below(300);
        let segment = model_segment("Speaker 1", Track::System, &random.text(count), start_ms);

        let merged = transcript
            .apply_final_pass(&[segment])
            .expect("no correction is lost");

        let shown: Vec<_> = merged
            .shown_segments()
            .into_iter()
            .flat_map(|segment| segment.words)
            .collect();
        for correction in &transcript.corrections {
            let times = shown
                .iter()
                .filter(|word| word.correction_id.as_ref() == Some(&correction.id))
                .count();
            let expected = usize::from(correction.state == CorrectionState::Active);
            assert_eq!(
                times, expected,
                "round {round}, correction {}",
                correction.id
            );
        }
    }
}
