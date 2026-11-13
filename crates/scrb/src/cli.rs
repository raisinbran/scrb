//! The `scrb` command line.
//!
//! Every command prints JSON lines on stdout, and the last line is always the
//! result. Logs go to stderr. The exit code is 0 on success, 1 for an error
//! result and 2 for a usage error. [`run`] is the entry point.

use std::ffi::OsString;
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::process::ExitCode;
use std::time::Instant;

use clap::{Parser, Subcommand, ValueEnum};
use serde_json::{Value, json};

use crate::dev::{Fault, run_fake_engine};
use crate::engine::Engine;
use crate::library::{Library, MeetingState, write_file_safely};
use crate::pass::{PassModels, import_file, transcribe_file, transcribe_meeting};
use crate::transcript::{read_summary, read_transcript, to_markdown, to_text};
use crate::{Error, ErrorCode};

#[derive(Debug, Parser)]
#[command(name = "scrb", version, about = "Meeting Scribe")]
struct Args {
    /// The library folder. Defaults to $SCRB_LIBRARY, else ~/scrb.
    #[arg(long, global = true, value_name = "DIR")]
    library: Option<PathBuf>,

    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// List meetings, or show one.
    Meetings {
        #[command(subcommand)]
        action: Option<MeetingsAction>,
    },
    /// Show the recording, running passes and meetings cut off by a crash.
    Status,
    /// Write a meeting's speakers, segments and summary to a file.
    Export {
        /// The meeting id, such as 2026-11-17-1000.
        id: String,
        #[arg(long, value_enum)]
        format: ExportFormat,
        /// The file to write. Defaults to <ID>.md or <ID>.txt in the current folder.
        #[arg(long, value_name = "FILE")]
        out: Option<PathBuf>,
    },
    /// Run the after-meeting pass on a WAV or FLAC file, or on a meeting.
    Transcribe {
        /// A WAV or FLAC file, which becomes a new meeting unless --out is
        /// given, or a meeting id.
        input: String,
        /// The speech model. Defaults to the one in settings.json.
        #[arg(long, value_name = "M")]
        model: Option<String>,
        /// The diarizer, or none to find speech without speakers. Defaults
        /// to the one in settings.json.
        #[arg(long, value_name = "D")]
        diarizer: Option<String>,
        /// Write the transcript of a file to FILE, leaving the library alone.
        #[arg(long, value_name = "FILE")]
        out: Option<PathBuf>,
        /// Run the pass again on a ready meeting. Its transcript, edits and
        /// summary move to superseded/ once the new pass succeeds.
        #[arg(long)]
        force: bool,
    },
    #[command(hide = true)]
    Dev {
        #[command(subcommand)]
        action: DevAction,
    },
}

/// Fakes that tests start in place of programs outside scrb.
#[derive(Debug, Subcommand)]
enum DevAction {
    /// Speak the engine protocol on stdin and stdout without models.
    FakeEngine {
        /// A .ref.json file whose turns and words the fake returns.
        #[arg(long = "ref", value_name = "FILE")]
        reference: Option<PathBuf>,
        /// A fault to give once, such as `transcribe:crash` or `load:model_missing:after=1`.
        #[arg(long, value_name = "OP:KIND[:after=N]")]
        fault: Vec<Fault>,
        /// Count requests in FILE, so a fault fires once across restarts.
        #[arg(long, value_name = "FILE")]
        count_file: Option<PathBuf>,
    },
}

#[derive(Debug, Subcommand)]
enum MeetingsAction {
    /// Every meeting, newest first.
    List,
    /// One meeting's meeting.json.
    Show { id: String },
}

#[derive(Debug, Clone, Copy, ValueEnum)]
enum ExportFormat {
    Md,
    Txt,
}

/// Runs the command line `args`, prints its JSON lines and returns the exit code.
pub fn run(args: impl IntoIterator<Item = OsString>) -> ExitCode {
    let args = match Args::try_parse_from(args) {
        // A fake writes the protocol it fakes on stdout, never a result line.
        Ok(Args {
            command: Command::Dev { action },
            ..
        }) => return run_dev(action),
        Ok(args) => args,
        // `--help` and `--version` come back as errors that are meant for stdout.
        Err(error) if !error.use_stderr() => {
            // Nothing is left to report a failed print to.
            let _ = error.print();
            return ExitCode::SUCCESS;
        }
        Err(error) => {
            eprint!("{error}");
            let message = error.to_string();
            let first_line = message.lines().next().unwrap_or_default();
            let usage = Error::new(ErrorCode::Usage, first_line.trim_start_matches("error: "));
            print_line(&error_result(&usage));
            return ExitCode::from(2);
        }
    };
    match run_command(args) {
        Ok(fields) => {
            print_line(&success_result(fields));
            ExitCode::SUCCESS
        }
        Err(error) if error.code == ErrorCode::Usage => {
            print_line(&error_result(&error));
            ExitCode::from(2)
        }
        Err(error) => {
            print_line(&error_result(&error));
            ExitCode::from(1)
        }
    }
}

/// Runs one parsed command and returns its result fields as a JSON object.
fn run_command(args: Args) -> Result<Value, Error> {
    let library = Library::open(&library_root(args.library)?)?;
    match args.command {
        Command::Meetings {
            action: None | Some(MeetingsAction::List),
        } => Ok(json!({ "meetings": library.list_meetings()? })),
        Command::Meetings {
            action: Some(MeetingsAction::Show { id }),
        } => Ok(json!({ "meeting": library.read_meeting(&id)? })),
        Command::Status => status(&library),
        Command::Export { id, format, out } => export(&library, &id, format, out),
        Command::Transcribe {
            input,
            model,
            diarizer,
            out,
            force,
        } => transcribe(&library, &input, model, diarizer, out, force),
        Command::Dev { .. } => unreachable!("run returns before the library opens"),
    }
}

fn run_dev(action: DevAction) -> ExitCode {
    let DevAction::FakeEngine {
        reference,
        fault,
        count_file,
    } = action;
    match run_fake_engine(reference.as_deref(), &fault, count_file.as_deref()) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("scrb dev fake-engine: {}", error.message);
            ExitCode::from(1)
        }
    }
}

/// `--library DIR`, else `$SCRB_LIBRARY`, else `~/scrb`.
fn library_root(flag: Option<PathBuf>) -> Result<PathBuf, Error> {
    if let Some(dir) = flag {
        return Ok(dir);
    }
    if let Some(dir) = std::env::var_os("SCRB_LIBRARY") {
        return Ok(PathBuf::from(dir));
    }
    std::env::home_dir()
        .map(|home| home.join("scrb"))
        .ok_or_else(|| Error::new(ErrorCode::Internal, "no home folder, so pass --library DIR"))
}

/// The library part of `scrb status`. After [`Library::open`], a meeting is
/// still `recording` or `passing` only while its `.lock` is held.
fn status(library: &Library) -> Result<Value, Error> {
    let meetings = library.list_meetings()?;
    let ids_in = |state: MeetingState| -> Vec<String> {
        meetings
            .iter()
            .filter(|meeting| meeting.state == state)
            .map(|meeting| meeting.id.clone())
            .collect()
    };
    Ok(json!({
        "recording": ids_in(MeetingState::Recording).first(),
        "passing": ids_in(MeetingState::Passing),
        "cut_off": library.cut_off(),
    }))
}

/// Runs the after-meeting pass on `input`. An existing file becomes a new
/// meeting, or only a transcript file when `out` is given. A non-existent
/// `input` is a meeting id, unless `out` was given, which is `not_found`.
fn transcribe(
    library: &Library,
    input: &str,
    model: Option<String>,
    diarizer: Option<String>,
    out: Option<PathBuf>,
    force: bool,
) -> Result<Value, Error> {
    let settings = library.read_settings()?;
    let diarizer = diarizer.unwrap_or(settings.diarizer);
    let models = PassModels {
        asr: model.unwrap_or(settings.model),
        diarizer: (diarizer != "none").then_some(diarizer),
    };
    let new_engine = || {
        Engine::new(Box::new(|step: &str, done: u64, total: u64| {
            print_line(&json!({ "type": "progress", "step": step, "done": done, "total": total }));
        }))
    };
    let started = Instant::now();
    let file = Path::new(input);
    let (transcript, mut fields) = match (out, file.is_file()) {
        (Some(out), true) => {
            if is_same_file(file, &out) {
                return Err(Error::new(
                    ErrorCode::Usage,
                    format!("{} is the input file", out.display()),
                ));
            }
            if is_inside_library(library, out.as_path())? {
                return Err(Error::new(
                    ErrorCode::Usage,
                    format!("{} is inside the library folder", out.display()),
                ));
            }
            let glossary = library.read_glossary()?;
            let mut engine = new_engine()?;
            let transcript = transcribe_file(file, &out, &models, &glossary, &mut engine)?;
            (transcript, json!({ "out": out.display().to_string() }))
        }
        (Some(_), false) => {
            return Err(Error::new(ErrorCode::NotFound, format!("no file {input}")));
        }
        (None, true) => {
            // The engine client comes first, so an engine that cannot be set
            // up makes no meeting.
            let engine = new_engine()?;
            let (id, lock) = import_file(library, file)?;
            let transcript = transcribe_meeting(library, &id, &lock, &models, force, || Ok(engine))
                .map_err(|error| error.with_meeting_id(&id))?;
            (
                transcript,
                json!({ "meeting_id": id, "state": MeetingState::Ready }),
            )
        }
        (None, false) => {
            let lock = library.lock_meeting(input)?;
            let transcript = transcribe_meeting(library, input, &lock, &models, force, new_engine)
                .map_err(|error| error.with_meeting_id(input))?;
            (
                transcript,
                json!({ "meeting_id": input, "state": MeetingState::Ready }),
            )
        }
    };
    fields["segments"] = json!(transcript.segments);
    fields["speakers"] = json!(transcript.speakers);
    fields["rtf"] = json!(started.elapsed().as_secs_f64() / transcript.duration_s);
    Ok(fields)
}

/// Writes meeting `id` to `out`, or to `<id>.md` or `<id>.txt` in the current
/// folder. A file inside the library folder is a `usage` error, so an export
/// never replaces a meeting's own files.
fn export(
    library: &Library,
    id: &str,
    format: ExportFormat,
    out: Option<PathBuf>,
) -> Result<Value, Error> {
    let meeting = library.read_meeting(id)?;
    let transcript = read_transcript(library, id)?;
    let summary = read_summary(library, id)?;
    let title = meeting.title.as_deref().unwrap_or(&meeting.id);
    let (document, extension) = match format {
        ExportFormat::Md => (to_markdown(title, &transcript, summary.as_ref()), "md"),
        ExportFormat::Txt => (to_text(title, &transcript, summary.as_ref()), "txt"),
    };
    let out = out.unwrap_or_else(|| PathBuf::from(format!("{id}.{extension}")));
    if is_inside_library(library, &out)? {
        return Err(Error::new(
            ErrorCode::Usage,
            format!("{} is inside the library folder", out.display()),
        ));
    }
    write_file_safely(&out, document.as_bytes())?;
    Ok(json!({ "out": out.display().to_string() }))
}

/// Whether `out`'s folder is the library folder or inside it, after
/// following links and `..`. The folder must exist.
fn is_inside_library(library: &Library, out: &Path) -> Result<bool, Error> {
    let folder = match out.parent() {
        Some(parent) if !parent.as_os_str().is_empty() => parent,
        _ => Path::new("."),
    };
    let folder = fs::canonicalize(folder).map_err(|cause| Error::file(folder, cause))?;
    let root = library.root();
    let root = match fs::canonicalize(root) {
        Ok(root) => root,
        // A library folder that does not exist yet holds no meeting files.
        Err(cause) if cause.kind() == io::ErrorKind::NotFound => return Ok(false),
        Err(cause) => return Err(Error::file(root, cause)),
    };
    Ok(folder.starts_with(root))
}

/// Whether `a` and `b` name one existing file, after following links and `..`.
fn is_same_file(a: &Path, b: &Path) -> bool {
    match (fs::canonicalize(a), fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

fn success_result(fields: Value) -> Value {
    let mut line = json!({ "type": "result", "ok": true });
    if let (Value::Object(line_fields), Value::Object(fields)) = (&mut line, fields) {
        line_fields.extend(fields);
    }
    line
}

fn error_result(error: &Error) -> Value {
    let mut line = json!({
        "type": "result",
        "ok": false,
        "error": { "code": error.code, "message": error.message },
    });
    if let Some(hint) = &error.hint {
        line["error"]["hint"] = json!(hint);
    }
    if let Some(id) = &error.meeting_id {
        line["meeting_id"] = json!(id);
    }
    line
}

fn print_line(line: &Value) {
    // A closed stdout leaves nowhere to report the failure.
    let _ = writeln!(io::stdout().lock(), "{line}");
}
