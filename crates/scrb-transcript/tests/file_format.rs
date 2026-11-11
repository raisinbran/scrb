mod common;

use common::{NOW, correct, live_transcript, system_ids};
use scrb_transcript::Transcript;
use serde_json::json;

/// `transcript.json` is read back by later versions of the app, so its field names, enum
/// values and ids must not change once a version 1 file is written, and the same edits must
/// always write the same file.
#[test]
fn transcript_writes_version_1_file_layout() {
    let transcript = live_transcript("hi there");
    let corrected = correct(&transcript, &system_ids(&transcript, 0..1), "Hi");

    let written = serde_json::to_value(&corrected).expect("a transcript always serializes");

    let correction = json!({
        "id": "c5", "wordIds": ["w3"], "text": "Hi",
        "original": { "text": "hi", "startMs": 0, "endMs": 400, "speakerId": "s1", "track": "system" },
        "remember": false, "state": "active", "supersededBy": null,
        "createdAt": NOW, "updatedAt": NOW
    });
    let expected = json!({
        "version": 1, "meetingId": "m1", "revision": 1, "nextId": 7,
        "speakers": [{
            "id": "s1", "label": "Speaker ?", "name": null, "profileId": null,
            "userNamed": false, "mergedInto": null
        }],
        "segments": [{
            "id": "g2", "speakerId": "s1", "track": "system", "pass": "live",
            "words": [
                { "id": "w3", "text": "hi", "startMs": 0, "endMs": 400 },
                { "id": "w4", "text": "there", "startMs": 500, "endMs": 900 }
            ]
        }],
        "corrections": [correction],
        "speakerOverrides": [],
        "history": {
            "undo": [{
                "id": "h6", "label": "correct",
                "corrections": [{ "id": "c5", "before": null, "after": correction }],
                "speakers": [], "overrides": []
            }],
            "redo": []
        }
    });
    assert_eq!(written, expected);
    let read: Transcript = serde_json::from_value(written).expect("the file reads back");
    assert_eq!(read, corrected);
}
