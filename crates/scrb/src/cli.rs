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

use clap::{Parser, Subcommand, ValueEnum};
use serde_json::{Value, json};

use crate::library::{Library, MeetingState, write_file_safely};
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
}

#[derive(Debug, Subcommand)]
enum MeetingsAction {
    /// List all meetings, newest first.
    List,
    /// Show one meeting's meeting.json.
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
    let root = fs::canonicalize(root).map_err(|cause| Error::file(root, cause))?;
    Ok(folder.starts_with(root))
}

fn success_result(fields: Value) -> Value {
    let mut line = json!({ "type": "result", "ok": true });
    if let (Value::Object(line_fields), Value::Object(fields)) = (&mut line, fields) {
        line_fields.extend(fields);
    }
    line
}

fn error_result(error: &Error) -> Value {
    json!({
        "type": "result",
        "ok": false,
        "error": { "code": error.code, "message": error.message },
    })
}

fn print_line(line: &Value) {
    // A closed stdout leaves nowhere to report the failure.
    let _ = writeln!(io::stdout().lock(), "{line}");
}
