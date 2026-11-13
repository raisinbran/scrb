//! `scrb transcribe` and `scrb models list`, run the way an agent runs them,
//! with the fake engine in place of the speech models. The fake answers with
//! the words and turns of `tests/data/two-speakers.ref.json`.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use scrb::dev::write_sample_meeting;
use scrb::library::{Library, MeetingState};
use scrb::transcript::{fix_passage, read_transcript};
use serde_json::{Value, json};
use tempfile::TempDir;

/// A file in `tests/data/`.
fn data_file(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("tests/data")
        .join(name)
}

/// A `$SCRB_ENGINE` value that runs this build's fake engine on the clip's
/// reference, plus `flags`. Each word is quoted, so a Windows path keeps its
/// backslashes.
fn fake_engine(flags: &[&str]) -> String {
    let reference = data_file("two-speakers.ref.json");
    let mut words = vec![
        env!("CARGO_BIN_EXE_scrb").to_string(),
        "dev".to_string(),
        "fake-engine".to_string(),
        "--ref".to_string(),
        reference.display().to_string(),
    ];
    words.extend(flags.iter().map(|flag| flag.to_string()));
    shell_words::join(words)
}

/// Runs `scrb` with `args`, the engine command `engine` and a request
/// timeout of `timeout_s`. It kills `scrb` after 30 s, so an engine hang
/// fails the test instead of stalling it.
fn run_scrb(args: &[&str], engine: &str, timeout_s: &str) -> Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_scrb"))
        .args(args)
        .env("SCRB_ENGINE", engine)
        .env("SCRB_ENGINE_TIMEOUT_S", timeout_s)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("scrb starts");
    let deadline = Instant::now() + Duration::from_secs(30);
    while child.try_wait().expect("scrb runs").is_none() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(50));
    }
    // Killing a process that already exited fails, which is fine here.
    let _ = child.kill();
    child.wait_with_output().expect("scrb's output")
}

/// The last stdout line, which is always the result.
fn result_line(output: &Output) -> Value {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout.lines().last().expect("a result line");
    serde_json::from_str(last_line).expect("the result is JSON")
}

/// Runs `scrb transcribe` on the clip into the library at `library`.
fn transcribe_clip(library: &Path, engine: &str, timeout_s: &str) -> Output {
    let clip = data_file("two-speakers.wav");
    let args = [
        "transcribe",
        clip.to_str().unwrap(),
        "--library",
        library.to_str().unwrap(),
    ];
    run_scrb(&args, engine, timeout_s)
}

/// Transcribes the clip into the library at `library_dir` and fixes one
/// passage as Codex would, so the meeting has an edit log. Returns its id.
fn write_refined_meeting(library_dir: &Path, engine: &str) -> String {
    let first = transcribe_clip(library_dir, engine, "60");
    let meeting_id = result_line(&first)["meeting_id"]
        .as_str()
        .unwrap()
        .to_string();
    let library = Library::open(library_dir).unwrap();
    fix_passage(
        &library,
        &meeting_id,
        "s0002",
        "the cube flow cost is up",
        "the Kubeflow cost is up",
        "codex",
    )
    .unwrap();
    meeting_id
}

/// The folders in the meeting's `superseded/`.
fn superseded_copies(library: &Library, meeting_id: &str) -> Vec<PathBuf> {
    let superseded_dir = library.meeting_dir(meeting_id).unwrap().join("superseded");
    fs::read_dir(superseded_dir)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect()
}

/// People read who said what, so the engine's turns must become speakers
/// `S1` and `S2`, with one speaker's turns under a second apart merged into
/// one segment.
#[test]
fn transcribe_writes_two_speakers_from_fake_engine() {
    let library_dir = TempDir::new().unwrap();

    let output = transcribe_clip(library_dir.path(), &fake_engine(&[]), "60");

    let result = result_line(&output);
    assert_eq!(result["ok"], true, "{result}");
    assert_eq!(result["state"], "ready");
    let library = Library::open(library_dir.path()).unwrap();
    let transcript = read_transcript(&library, result["meeting_id"].as_str().unwrap()).unwrap();
    let lines: Vec<(Option<&str>, &str)> = transcript
        .segments
        .iter()
        .map(|segment| (segment.speaker.as_deref(), segment.text.as_str()))
        .collect();
    assert_eq!(
        lines,
        [
            (Some("S1"), "okay let's start with the budget"),
            (Some("S2"), "the cube flow cost is up"),
        ]
    );
    let speaker_ids: Vec<&str> = transcript
        .speakers
        .iter()
        .map(|speaker| speaker.id.as_str())
        .collect();
    assert_eq!(speaker_ids, ["S1", "S2"]);
}

/// The glossary is how product names come out right; each replacement is
/// recorded, so a later comparison can score the pass with and without it.
#[test]
fn transcribe_applies_glossary_and_records_replacement() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    library
        .add_glossary_term("Kubeflow", &["Cube Flow".to_string()], None)
        .unwrap();

    let output = transcribe_clip(library_dir.path(), &fake_engine(&[]), "60");

    let result = result_line(&output);
    let transcript = read_transcript(&library, result["meeting_id"].as_str().unwrap()).unwrap();
    assert_eq!(transcript.segments[1].text, "the Kubeflow cost is up");
    let applied: Vec<(&str, &str, &str)> = transcript
        .glossary_applied
        .iter()
        .map(|record| {
            (
                record.segment.as_str(),
                record.from.as_str(),
                record.to.as_str(),
            )
        })
        .collect();
    assert_eq!(applied, [("s0002", "cube flow", "Kubeflow")]);
}

/// A worker that dies once, or writes one broken line, must not cost the
/// user an hour-long pass; the client restarts it and the retry succeeds.
#[test]
fn transcribe_retries_once_after_engine_fault() {
    for fault in ["transcribe:crash", "transcribe:malformed"] {
        let library_dir = TempDir::new().unwrap();
        let scratch = TempDir::new().unwrap();
        let count_file = scratch.path().join("requests.txt");
        let flags = [
            "--fault",
            fault,
            "--count-file",
            count_file.to_str().unwrap(),
        ];

        let output = transcribe_clip(library_dir.path(), &fake_engine(&flags), "60");

        let result = result_line(&output);
        assert_eq!(result["ok"], true, "{fault}: {result}");
        assert_eq!(result["segments"].as_array().unwrap().len(), 2, "{fault}");
    }
}

/// A pass that cannot finish must say so in `meeting.json`, so `scrb status`
/// and a rerun see it, and a hung engine must time out instead of blocking
/// the pass forever.
#[test]
fn transcribe_marks_meeting_failed_after_second_failure() {
    let cases = [
        ("crash", "transcribe:crash", "60"),
        ("hang", "diarize:hang", "1"),
    ];
    for (name, fault, timeout_s) in cases {
        let library_dir = TempDir::new().unwrap();

        let output = transcribe_clip(
            library_dir.path(),
            &fake_engine(&["--fault", fault]),
            timeout_s,
        );

        assert_eq!(output.status.code(), Some(1), "{name}");
        assert_eq!(
            result_line(&output)["error"]["code"],
            "engine_failed",
            "{name}"
        );
        let meetings = Library::open(library_dir.path())
            .unwrap()
            .list_meetings()
            .unwrap();
        assert_eq!(meetings[0].state, MeetingState::Failed, "{name}");
        let pass = meetings[0].pass.as_ref().expect("a pass record");
        assert_eq!(pass.error.as_deref(), Some("engine_failed"), "{name}");
    }
}

/// A rerun would throw away Codex's refinements, so a `ready` meeting is
/// refused without `--force`, before any engine is set up, and its files
/// stay exactly as they were.
#[test]
fn transcribe_refuses_ready_meeting_without_force() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    let meeting_id = write_sample_meeting(&library).unwrap();
    let meeting_dir = library.meeting_dir(&meeting_id).unwrap();
    let meeting_before = fs::read(meeting_dir.join("meeting.json")).unwrap();
    let transcript_before = fs::read(meeting_dir.join("transcript.json")).unwrap();

    let args = [
        "transcribe",
        &meeting_id,
        "--library",
        library_dir.path().to_str().unwrap(),
    ];
    // An engine command that cannot be parsed fails only if the engine is set up.
    let output = run_scrb(&args, "'unclosed", "60");

    assert_eq!(result_line(&output)["error"]["code"], "bad_state");
    assert_eq!(
        fs::read(meeting_dir.join("meeting.json")).unwrap(),
        meeting_before
    );
    assert_eq!(
        fs::read(meeting_dir.join("transcript.json")).unwrap(),
        transcript_before
    );
    assert!(!meeting_dir.join("superseded").exists());
}

/// `--force` reruns the pass on a refined meeting; the old transcript and
/// its edit log must survive in `superseded/`, not be overwritten.
#[test]
fn transcribe_force_moves_old_transcript_to_superseded() {
    let library_dir = TempDir::new().unwrap();
    let engine = fake_engine(&[]);
    let meeting_id = write_refined_meeting(library_dir.path(), &engine);

    let args = [
        "transcribe",
        &meeting_id,
        "--force",
        "--library",
        library_dir.path().to_str().unwrap(),
    ];
    let second = run_scrb(&args, &engine, "60");

    assert_eq!(result_line(&second)["ok"], true);
    let library = Library::open(library_dir.path()).unwrap();
    let copies = superseded_copies(&library, &meeting_id);
    assert_eq!(copies.len(), 1);
    let old_transcript = fs::read_to_string(copies[0].join("transcript.json")).unwrap();
    assert!(old_transcript.contains("the Kubeflow cost is up"));
    assert!(copies[0].join("edits.jsonl").is_file());
    let new_transcript = read_transcript(&library, &meeting_id).unwrap();
    assert_eq!(new_transcript.segments[1].text, "the cube flow cost is up");
}

/// A crash during a `--force` rerun leaves the meeting `passing` with the old
/// files in place; the rerun after recovery must still keep Codex's
/// transcript and edit log in `superseded/`.
#[test]
fn transcribe_after_crash_keeps_old_transcript() {
    let library_dir = TempDir::new().unwrap();
    let engine = fake_engine(&[]);
    let meeting_id = write_refined_meeting(library_dir.path(), &engine);
    let library = Library::open(library_dir.path()).unwrap();
    let lock = library.lock_meeting(&meeting_id).unwrap();
    library
        .move_meeting(&meeting_id, MeetingState::Passing)
        .unwrap();
    // A crashed pass no longer holds the lock, so the next open recovers the meeting.
    drop(lock);

    let args = [
        "transcribe",
        &meeting_id,
        "--library",
        library_dir.path().to_str().unwrap(),
    ];
    let rerun = run_scrb(&args, &engine, "60");

    assert_eq!(result_line(&rerun)["state"], "ready");
    let copies = superseded_copies(&library, &meeting_id);
    assert_eq!(copies.len(), 1);
    let old_transcript = fs::read_to_string(copies[0].join("transcript.json")).unwrap();
    assert!(old_transcript.contains("the Kubeflow cost is up"));
    assert!(copies[0].join("edits.jsonl").is_file());
}

/// A failed rerun must not take the transcript away; Codex's refined
/// transcript and edit log stay where export and later edits find them.
#[test]
fn transcribe_force_keeps_transcript_when_engine_fails() {
    let library_dir = TempDir::new().unwrap();
    let meeting_id = write_refined_meeting(library_dir.path(), &fake_engine(&[]));

    let args = [
        "transcribe",
        &meeting_id,
        "--force",
        "--library",
        library_dir.path().to_str().unwrap(),
    ];
    let failing_engine = fake_engine(&["--fault", "load:model_missing"]);
    let output = run_scrb(&args, &failing_engine, "60");

    assert_eq!(result_line(&output)["error"]["code"], "engine_failed");
    let library = Library::open(library_dir.path()).unwrap();
    let meeting = library.read_meeting(&meeting_id).unwrap();
    assert_eq!(meeting.state, MeetingState::Failed);
    let transcript = read_transcript(&library, &meeting_id).unwrap();
    assert_eq!(transcript.segments[1].text, "the Kubeflow cost is up");
    let meeting_dir = library.meeting_dir(&meeting_id).unwrap();
    assert!(meeting_dir.join("edits.jsonl").is_file());
    assert!(!meeting_dir.join("superseded").exists());
}

/// A failed import leaves a `failed` meeting; the result names it, so the
/// user reruns that meeting instead of importing the file again.
#[test]
fn transcribe_import_failure_returns_meeting_id() {
    let library_dir = TempDir::new().unwrap();
    let failing_engine = fake_engine(&["--fault", "load:model_missing"]);

    let output = transcribe_clip(library_dir.path(), &failing_engine, "60");

    let result = result_line(&output);
    assert_eq!(result["error"]["code"], "engine_failed");
    let meetings = Library::open(library_dir.path())
        .unwrap()
        .list_meetings()
        .unwrap();
    assert_eq!(meetings.len(), 1);
    assert_eq!(result["meeting_id"], meetings[0].id.as_str());
}

/// A missing model's error carries the command that fetches it, so an agent
/// or user can recover without reading the docs.
#[test]
fn transcribe_model_missing_hints_models_fetch() {
    let library_dir = TempDir::new().unwrap();
    let failing_engine = fake_engine(&["--fault", "load:model_missing"]);

    let output = transcribe_clip(library_dir.path(), &failing_engine, "60");

    let result = result_line(&output);
    assert_eq!(result["error"]["hint"], "run scrb models fetch");
}

/// `scrb models list` passes on the catalog of the engine's `hello`, which
/// is how a user learns which models still need `scrb models fetch`.
#[test]
fn models_list_returns_engine_catalog() {
    let output = run_scrb(&["models", "list"], &fake_engine(&[]), "60");

    let result = result_line(&output);
    assert_eq!(result["ok"], true);
    assert_eq!(
        result["models"],
        json!([{ "name": "fake-asr", "kind": "asr", "present": true }])
    );
}

/// `--out` transcribes a file with nothing in the library, even before the
/// library folder exists, as on a new machine or a CI runner.
#[test]
fn transcribe_out_writes_file_outside_missing_library() {
    let scratch = TempDir::new().unwrap();
    let library_dir = scratch.path().join("library");
    let out = scratch.path().join("t.json");
    let clip = data_file("two-speakers.wav");

    let args = [
        "transcribe",
        clip.to_str().unwrap(),
        "--out",
        out.to_str().unwrap(),
        "--library",
        library_dir.to_str().unwrap(),
    ];
    let output = run_scrb(&args, &fake_engine(&[]), "60");

    let result = result_line(&output);
    assert_eq!(result["ok"], true, "{result}");
    let transcript: Value = serde_json::from_str(&fs::read_to_string(&out).unwrap()).unwrap();
    assert_eq!(transcript["meeting_id"], "two-speakers");
    assert_eq!(transcript["speakers"].as_array().unwrap().len(), 2);
    assert_eq!(transcript["segments"].as_array().unwrap().len(), 2);
    assert!(!library_dir.exists());
}

/// An imported file is often the only copy of a recording, so an `--out`
/// that names the input file, however it is spelled, must leave it alone.
#[test]
fn transcribe_refuses_out_equal_to_input() {
    let scratch = TempDir::new().unwrap();
    let input = scratch.path().join("meeting.wav");
    fs::copy(data_file("two-speakers.wav"), &input).unwrap();
    let audio_before = fs::read(&input).unwrap();
    let same_file = scratch.path().join(".").join("meeting.wav");
    let library_dir = scratch.path().join("library");

    let args = [
        "transcribe",
        input.to_str().unwrap(),
        "--out",
        same_file.to_str().unwrap(),
        "--library",
        library_dir.to_str().unwrap(),
    ];
    let output = run_scrb(&args, &fake_engine(&[]), "60");

    assert_eq!(output.status.code(), Some(2));
    assert_eq!(result_line(&output)["error"]["code"], "usage");
    assert_eq!(fs::read(&input).unwrap(), audio_before);
}

/// Without a diarizer the pass must still find speech, through `vad`, and
/// must not invent speakers it never asked for.
#[test]
fn transcribe_diarizer_none_leaves_speakers_null() {
    let library_dir = TempDir::new().unwrap();
    let clip = data_file("two-speakers.wav");

    let args = [
        "transcribe",
        clip.to_str().unwrap(),
        "--diarizer",
        "none",
        "--library",
        library_dir.path().to_str().unwrap(),
    ];
    let output = run_scrb(&args, &fake_engine(&[]), "60");

    let result = result_line(&output);
    assert_eq!(result["ok"], true, "{result}");
    let library = Library::open(library_dir.path()).unwrap();
    let transcript = read_transcript(&library, result["meeting_id"].as_str().unwrap()).unwrap();
    let lines: Vec<(Option<&str>, &str)> = transcript
        .segments
        .iter()
        .map(|segment| (segment.speaker.as_deref(), segment.text.as_str()))
        .collect();
    // The spans are 0.3 s apart, so with no speakers to tell apart they merge.
    assert_eq!(
        lines,
        [(
            None,
            "okay let's start with the budget the cube flow cost is up"
        )]
    );
    assert!(transcript.speakers.is_empty());
}
