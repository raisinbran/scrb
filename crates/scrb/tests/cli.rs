//! The `scrb` binary's output and exit codes, run the way an agent runs it.

use std::fs;
use std::process::{Command, Output};

use jiff::Zoned;
use scrb::dev::write_sample_meeting;
use scrb::library::{Library, Source};
use scrb::transcript::{name_speaker, write_summary};
use serde_json::{Value, json};
use tempfile::TempDir;

/// Runs the built `scrb` binary with `args`.
fn run_scrb(args: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_scrb"))
        .args(args)
        .output()
        .expect("scrb starts")
}

/// The last stdout line, which is always the result.
fn result_line(output: &Output) -> Value {
    let stdout = String::from_utf8_lossy(&output.stdout);
    let last_line = stdout.lines().last().expect("a result line");
    serde_json::from_str(last_line).expect("the result is JSON")
}

/// Agents tell a bad command line from a failed command by exit code 2, and
/// still read the error code from a JSON result.
#[test]
fn scrb_usage_error_exits_two() {
    let output = run_scrb(&["meetings", "--no-such-flag"]);

    assert_eq!(output.status.code(), Some(2));
    let result = result_line(&output);
    assert_eq!(result["ok"], false);
    assert_eq!(result["error"]["code"], "usage");
}

/// People read the export after a meeting, so it must show the names Codex
/// gave the speakers, and the summary, not bare speaker ids.
#[test]
fn export_markdown_carries_speaker_names() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    let meeting_id = write_sample_meeting(&library).unwrap();
    name_speaker(&library, &meeting_id, "S2", "Lee", "codex").unwrap();
    write_summary(
        &library,
        &meeting_id,
        "The Kubeflow budget is up.",
        Vec::new(),
        "codex",
    )
    .unwrap();
    let out_dir = TempDir::new().unwrap();
    let out = out_dir.path().join("meeting.md");

    let output = run_scrb(&[
        "export",
        &meeting_id,
        "--format",
        "md",
        "--out",
        out.to_str().unwrap(),
        "--library",
        library_dir.path().to_str().unwrap(),
    ]);

    assert_eq!(output.status.code(), Some(0));
    assert_eq!(result_line(&output)["out"], out.display().to_string());
    let markdown = fs::read_to_string(&out).unwrap();
    assert!(
        markdown.contains("**Dana** [0:00:03] Okay, let's start"),
        "{markdown}"
    );
    assert!(
        markdown.contains("**Lee** [0:00:10] the cube flow cost is up"),
        "{markdown}"
    );
    assert!(
        markdown.contains("The Kubeflow budget is up."),
        "{markdown}"
    );
}

/// An export must never replace a file inside the library, such as a
/// meeting's only `transcript.json`.
#[test]
fn export_refuses_out_inside_library() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    let meeting_id = write_sample_meeting(&library).unwrap();
    let transcript_path = library
        .meeting_dir(&meeting_id)
        .unwrap()
        .join("transcript.json");
    let transcript_before = fs::read(&transcript_path).unwrap();

    let output = run_scrb(&[
        "export",
        &meeting_id,
        "--format",
        "md",
        "--out",
        transcript_path.to_str().unwrap(),
        "--library",
        library_dir.path().to_str().unwrap(),
    ]);

    assert_eq!(output.status.code(), Some(2));
    assert_eq!(result_line(&output)["error"]["code"], "usage");
    assert_eq!(fs::read(&transcript_path).unwrap(), transcript_before);
}

/// Exporting before the pass has written a transcript is an ordinary
/// mistake, and must give `not_found` and write no file.
#[test]
fn export_reports_not_found_without_transcript() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    let (meeting, _lock) = library
        .create_meeting(Source::Import, &Zoned::now())
        .unwrap();
    let out_dir = TempDir::new().unwrap();
    let out = out_dir.path().join("meeting.md");

    let output = run_scrb(&[
        "export",
        &meeting.id,
        "--format",
        "md",
        "--out",
        out.to_str().unwrap(),
        "--library",
        library_dir.path().to_str().unwrap(),
    ]);

    assert_eq!(output.status.code(), Some(1));
    assert_eq!(result_line(&output)["error"]["code"], "not_found");
    assert!(!out.exists());
}

/// After a crash, `scrb status` is how an agent learns which meetings went
/// back to `recorded` and need their pass run again.
#[test]
fn status_reports_cut_off_meeting() {
    let library_dir = TempDir::new().unwrap();
    let library = Library::open(library_dir.path()).unwrap();
    let (meeting, lock) = library
        .create_meeting(Source::Recording, &Zoned::now())
        .unwrap();
    // A crash releases the lock and leaves the meeting `recording`.
    drop(lock);

    let output = run_scrb(&["status", "--library", library_dir.path().to_str().unwrap()]);

    assert_eq!(output.status.code(), Some(0));
    let result = result_line(&output);
    assert_eq!(result["cut_off"], json!([meeting.id]));
    assert_eq!(result["recording"], Value::Null);
}
