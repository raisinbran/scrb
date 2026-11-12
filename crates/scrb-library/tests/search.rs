mod common;

use std::fs;

use common::{NOW, TempFolder, meeting_id, recording};
use scrb_library::{Library, Origin, TranscriptMatch};
use scrb_transcript::{Pass, Segment, Speaker, Track, Transcript, Word};

/// A final-pass transcript of test meeting `n` with one segment and one speaker for each text.
/// Words are 400 ms long, start 500 ms apart, and have ids such as `w0-3`.
fn spoken(n: u8, texts: &[&str]) -> Transcript {
    let mut transcript = Transcript::new(meeting_id(n).as_str());
    let mut start_ms = 0;
    for (index, text) in texts.iter().enumerate() {
        let speaker_id = format!("s{index}");
        transcript.speakers.push(Speaker {
            id: speaker_id.clone(),
            label: speaker_id.clone(),
            name: None,
            profile_id: None,
            user_named: false,
            merged_into: None,
        });
        let mut words = Vec::new();
        for (word_index, word) in text.split_whitespace().enumerate() {
            words.push(Word {
                id: format!("w{index}-{word_index}"),
                text: word.to_owned(),
                start_ms,
                end_ms: start_ms + 400,
            });
            start_ms += 500;
        }
        transcript.segments.push(Segment {
            id: format!("g{index}"),
            speaker_id,
            track: Track::System,
            pass: Pass::Final,
            words,
        });
    }
    transcript
}

/// Users search for what they see, so a correction must be found and the model's replaced
/// words must not. Case, accents and punctuation must not stop a match.
#[test]
fn search_finds_correction_ignoring_case_and_accents() {
    let folder = TempFolder::new("search-corrected");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let heard = spoken(1, &["we should ask jon smith about the budget"]);
    let selected = ["w0-3".to_owned(), "w0-4".to_owned()];
    let corrected = heard
        .apply_correction(&selected, "J\u{f3}hn Smith,", false, NOW)
        .unwrap();
    library.save_transcript(&meeting_id(1), &corrected).unwrap();

    let found = library.search("JOHN SMITH").unwrap();
    let replaced = library.search("jon").unwrap();

    assert_eq!(found.meetings.len(), 1);
    let expected = TranscriptMatch {
        segment_id: "g0".to_owned(),
        start_ms: 1500,
        snippet: "we should ask J\u{f3}hn Smith, about the budget".to_owned(),
    };
    assert_eq!(found.meetings[0].transcript, [expected]);
    assert!(replaced.meetings.is_empty());
}

/// People finish each other's sentences, so a phrase must be found across two speakers. The
/// snippet shows 8 words on each side of the match's first word.
#[test]
fn search_matches_phrase_across_speakers_with_snippet() {
    let folder = TempFolder::new("search-phrase");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    library
        .create_meeting(&recording(1, "Weekly sync"))
        .unwrap();
    let transcript = spoken(
        1,
        &[
            "one two three four five six seven eight nine ten",
            "eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen",
        ],
    );
    library
        .save_transcript(&meeting_id(1), &transcript)
        .unwrap();

    let found = library.search("ten eleven").unwrap();

    let expected = TranscriptMatch {
        segment_id: "g0".to_owned(),
        start_ms: 4500,
        snippet: "two three four five six seven eight nine ten eleven twelve thirteen fourteen \
                  fifteen sixteen seventeen eighteen"
            .to_owned(),
    };
    assert_eq!(found.meetings[0].transcript, [expected]);
}

/// Results follow the meeting list, newest first, and include title matches from the index. A
/// meeting being imported is left out, and one whose transcript cannot be read is listed as
/// skipped, so the user knows the results may be incomplete.
#[test]
fn search_keeps_list_order_and_lists_skipped() {
    let folder = TempFolder::new("search-order");
    let mut library = Library::open(folder.path(), NOW).unwrap();
    let meetings = [
        (1, "Weekly sync", "2026-11-10T09:00:00Z", Origin::Recorded),
        (2, "Budget review", "2026-11-12T09:00:00Z", Origin::Recorded),
        (3, "Planning", "2026-11-11T09:00:00Z", Origin::Recorded),
        (4, "Budget import", "2026-11-12T10:00:00Z", Origin::Imported),
    ];
    for (n, title, date, origin) in meetings {
        let mut meeting = recording(n, title);
        meeting.date = date.to_owned();
        meeting.origin = origin;
        library.create_meeting(&meeting).unwrap();
    }
    let weekly = spoken(1, &["the budget is due friday"]);
    library.save_transcript(&meeting_id(1), &weekly).unwrap();
    let planning = folder.path().join("meetings/2026-11-11 Planning");
    fs::write(planning.join("transcript.json"), "{").unwrap();

    let results = library.search("budget").unwrap();

    let found: Vec<_> = results
        .meetings
        .iter()
        .map(|m| (m.meeting.id.clone(), m.title_or_date, m.transcript.len()))
        .collect();
    assert_eq!(found, [(meeting_id(2), true, 0), (meeting_id(1), false, 1)]);
    assert_eq!(results.skipped, [meeting_id(3)]);
}
