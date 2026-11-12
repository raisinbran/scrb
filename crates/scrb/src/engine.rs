//! The engine client starts the engine worker and speaks its protocol, JSON
//! lines over the worker's stdin and stdout.
//!
//! [`Engine::new`] reads the settings, and the first request starts the
//! worker. Each request waits up to 10 minutes plus twice the audio's length,
//! or `SCRB_ENGINE_TIMEOUT_S` seconds. When the worker dies, hangs past that
//! time or writes a malformed line, the client kills it, starts a new one,
//! sends the last `load` again and retries the request once.

use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::{Error, ErrorCode};

const ENGINE_ENV: &str = "SCRB_ENGINE";
const ENGINE_DIR_ENV: &str = "SCRB_ENGINE_DIR";
const TIMEOUT_ENV: &str = "SCRB_ENGINE_TIMEOUT_S";
const BASE_TIMEOUT_S: f64 = 600.0;

/// Called with each progress line's op, `done` and `total`.
pub type Progress = Box<dyn FnMut(&str, u64, u64)>;

/// A client for one engine worker. Dropping it kills the worker.
pub struct Engine {
    command: Vec<String>,
    /// The engine's environment, set as `UV_PROJECT_ENVIRONMENT` when the
    /// worker runs through `uv`.
    uv_project_environment: Option<PathBuf>,
    timeout_override: Option<Duration>,
    progress: Progress,
    worker: Option<Worker>,
    next_id: u64,
    /// The last `load` request that succeeded, sent again to a new worker.
    load: Option<Value>,
}

/// A running worker and the lines it writes to stdout.
struct Worker {
    child: Child,
    stdin: ChildStdin,
    lines: Receiver<String>,
}

/// How a request failed.
enum Failure {
    /// The worker died, hung or wrote a malformed line, so it needs a restart.
    Broken(String),
    /// The worker replied with an error, or could not be started.
    Refused(Error),
}

/// One speaker turn from `diarize`, in seconds.
#[derive(Debug, Clone, Deserialize)]
pub struct Turn {
    pub start: f64,
    pub end: f64,
    pub speaker: String,
}

impl Engine {
    /// A client that runs the command in `$SCRB_ENGINE`, split with
    /// shell-words rules, or else `uv run` on the engine folder.
    ///
    /// No worker starts until the first request.
    pub fn new(progress: Progress) -> Result<Engine, Error> {
        let (command, uv_project_environment) = match std::env::var(ENGINE_ENV) {
            Ok(line) => (split_engine_command(&line)?, None),
            Err(_) => {
                let (command, environment) = uv_engine_command()?;
                (command, Some(environment))
            }
        };
        Ok(Engine {
            command,
            uv_project_environment,
            timeout_override: read_timeout_override()?,
            progress,
            worker: None,
            next_id: 1,
            load: None,
        })
    }

    /// Asks the worker who it is and returns its `engine_version`.
    pub fn hello(&mut self) -> Result<String, Error> {
        #[derive(Deserialize)]
        struct Hello {
            engine_version: String,
        }
        let reply: Hello = self.request(json!({ "op": "hello" }), 0.0)?;
        Ok(reply.engine_version)
    }

    /// Loads the ASR model `asr` and, unless it is `None`, the diarizer.
    pub fn load(&mut self, asr: &str, diarizer: Option<&str>) -> Result<(), Error> {
        let request = json!({ "op": "load", "asr": asr, "diarizer": diarizer, "device": "auto" });
        let _: Value = self.request(request.clone(), 0.0)?;
        self.load = Some(request);
        Ok(())
    }

    /// Non-overlapping speaker turns in the 16 kHz mono WAV at `audio`.
    pub fn diarize(&mut self, audio: &Path, audio_s: f64) -> Result<Vec<Turn>, Error> {
        #[derive(Deserialize)]
        struct Diarized {
            turns: Vec<Turn>,
        }
        let request = json!({ "op": "diarize", "audio": audio.to_string_lossy() });
        let reply: Diarized = self.request(request, audio_s)?;
        Ok(reply.turns)
    }

    /// Spans of speech in the audio, as `[start, end]` in seconds.
    pub fn vad(&mut self, audio: &Path, audio_s: f64) -> Result<Vec<[f64; 2]>, Error> {
        #[derive(Deserialize)]
        struct Spans {
            spans: Vec<[f64; 2]>,
        }
        let request = json!({ "op": "vad", "audio": audio.to_string_lossy() });
        let reply: Spans = self.request(request, audio_s)?;
        Ok(reply.spans)
    }

    /// One text for each of `spans`, in the same order.
    pub fn transcribe(
        &mut self,
        audio: &Path,
        spans: &[[f64; 2]],
        audio_s: f64,
    ) -> Result<Vec<String>, Error> {
        #[derive(Deserialize)]
        struct Texts {
            texts: Vec<String>,
        }
        let request =
            json!({ "op": "transcribe", "audio": audio.to_string_lossy(), "spans": spans });
        let reply: Texts = self.request(request, audio_s)?;
        if reply.texts.len() != spans.len() {
            return Err(engine_failed(format!(
                "transcribe gave {} texts for {} spans",
                reply.texts.len(),
                spans.len()
            )));
        }
        Ok(reply.texts)
    }

    /// Sends `request` and returns its `ok` reply, retrying once on a new
    /// worker when the first one breaks.
    fn request<T: DeserializeOwned>(&mut self, request: Value, audio_s: f64) -> Result<T, Error> {
        let reply = match self.try_request(&request, audio_s) {
            Err(Failure::Broken(reason)) => {
                eprintln!("scrb: the engine {reason}; restarting it once");
                self.stop_worker();
                self.restart_worker()
                    .and_then(|()| self.try_request(&request, audio_s))
            }
            first => first,
        };
        let reply = reply.map_err(|failure| match failure {
            Failure::Broken(reason) => engine_failed(format!("the engine {reason} again")),
            Failure::Refused(error) => error,
        })?;
        serde_json::from_value(reply).map_err(|cause| {
            engine_failed(format!("unexpected reply to {}: {cause}", request["op"]))
        })
    }

    /// Starts a new worker and sends it the last `load` again.
    fn restart_worker(&mut self) -> Result<(), Failure> {
        self.worker = Some(self.start_worker()?);
        match self.load.clone() {
            Some(load) => self.try_request(&load, 0.0).map(|_| ()),
            None => Ok(()),
        }
    }

    /// Sends `request` once, with a new id, and waits for its reply.
    fn try_request(&mut self, request: &Value, audio_s: f64) -> Result<Value, Failure> {
        if self.worker.is_none() {
            self.worker = Some(self.start_worker()?);
        }
        let id = self.next_id;
        self.next_id += 1;
        let mut line = request.clone();
        line["id"] = json!(id);
        let op = request["op"].as_str().unwrap_or_default().to_string();
        let timeout = self
            .timeout_override
            .unwrap_or_else(|| Duration::from_secs_f64(BASE_TIMEOUT_S + 2.0 * audio_s));
        let deadline = Instant::now() + timeout;
        let worker = self.worker.as_mut().expect("the worker was just started");
        if writeln!(worker.stdin, "{line}")
            .and_then(|()| worker.stdin.flush())
            .is_err()
        {
            return Err(Failure::Broken(format!("closed its input during {op}")));
        }
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let text = match worker.lines.recv_timeout(left) {
                Ok(text) => text,
                Err(RecvTimeoutError::Timeout) => {
                    return Err(Failure::Broken(format!(
                        "gave no reply to {op} in {} s",
                        timeout.as_secs_f64()
                    )));
                }
                Err(RecvTimeoutError::Disconnected) => {
                    return Err(Failure::Broken(format!("exited during {op}")));
                }
            };
            let Ok(reply) = serde_json::from_str::<Value>(&text) else {
                return Err(Failure::Broken(format!(
                    "wrote a malformed line during {op}"
                )));
            };
            if reply["id"] != json!(id) {
                continue;
            }
            if let Some(progress) = reply.get("progress") {
                let count = |field: &str| progress[field].as_u64().unwrap_or_default();
                (self.progress)(&op, count("done"), count("total"));
                continue;
            }
            if reply["ok"] == json!(true) {
                return Ok(reply);
            }
            let code = reply["error"]["code"].as_str().unwrap_or("internal");
            let message = reply["error"]["message"].as_str().unwrap_or_default();
            return Err(Failure::Refused(engine_failed(format!(
                "{code}: {message}"
            ))));
        }
    }

    fn start_worker(&self) -> Result<Worker, Failure> {
        let mut command = Command::new(&self.command[0]);
        if let Some(environment) = &self.uv_project_environment {
            command.env("UV_PROJECT_ENVIRONMENT", environment);
        }
        let mut child = command
            .args(&self.command[1..])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|cause| {
                Failure::Refused(engine_failed(format!(
                    "could not start {}: {cause}",
                    self.command[0]
                )))
            })?;
        let stdin = child.stdin.take().expect("stdin is piped");
        let stdout = child.stdout.take().expect("stdout is piped");
        let (sender, lines) = mpsc::channel();
        // The thread ends when the worker closes stdout, which the receiver
        // then sees as `Disconnected`.
        thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if sender.send(line).is_err() {
                    break;
                }
            }
        });
        Ok(Worker {
            child,
            stdin,
            lines,
        })
    }

    fn stop_worker(&mut self) {
        if let Some(mut worker) = self.worker.take() {
            // The worker may already have exited, which is fine here.
            let _ = worker.child.kill();
            let _ = worker.child.wait();
        }
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop_worker();
    }
}

/// Splits `$SCRB_ENGINE` the way a POSIX shell would. Backslashes outside
/// quotes are dropped, so a Windows path in it must be quoted.
fn split_engine_command(line: &str) -> Result<Vec<String>, Error> {
    let words = shell_words::split(line)
        .map_err(|cause| Error::new(ErrorCode::Usage, format!("{ENGINE_ENV}: {cause}")))?;
    if words.is_empty() {
        return Err(Error::new(
            ErrorCode::Usage,
            format!("{ENGINE_ENV} is empty"),
        ));
    }
    Ok(words)
}

/// `uv run --frozen --project <engine folder> scrb-engine`, and the
/// engine's environment folder in the data folder.
fn uv_engine_command() -> Result<(Vec<String>, PathBuf), Error> {
    let engine_dir = engine_dir()?;
    let command = vec![
        "uv".to_string(),
        "run".to_string(),
        "--frozen".to_string(),
        "--project".to_string(),
        engine_dir.display().to_string(),
        "scrb-engine".to_string(),
    ];
    Ok((command, data_dir()?.join("scrb").join("engine-venv")))
}

/// `$SCRB_ENGINE_DIR`, else `engine/` beside the binary, else the app
/// bundle's `Contents/Resources/engine`.
fn engine_dir() -> Result<PathBuf, Error> {
    if let Some(dir) = std::env::var_os(ENGINE_DIR_ENV) {
        return Ok(PathBuf::from(dir));
    }
    let exe = std::env::current_exe().map_err(|cause| engine_failed(cause.to_string()))?;
    let exe_dir = exe.parent().unwrap_or(Path::new("."));
    [exe_dir.join("engine"), exe_dir.join("../Resources/engine")]
        .into_iter()
        .find(|dir| dir.is_dir())
        .ok_or_else(|| engine_failed(format!("no engine folder beside {}", exe.display())))
}

/// The per-user data folder, `~/Library/Application Support` on macOS,
/// `%LOCALAPPDATA%` on Windows, else `$XDG_DATA_HOME` or `~/.local/share`.
fn data_dir() -> Result<PathBuf, Error> {
    let from_env = |name: &str| std::env::var_os(name).map(PathBuf::from);
    let home = std::env::home_dir();
    let dir = if cfg!(target_os = "macos") {
        home.map(|home| home.join("Library/Application Support"))
    } else if cfg!(windows) {
        from_env("LOCALAPPDATA")
    } else {
        from_env("XDG_DATA_HOME").or_else(|| home.map(|home| home.join(".local/share")))
    };
    dir.ok_or_else(|| engine_failed("no data folder for the engine's environment"))
}

/// `SCRB_ENGINE_TIMEOUT_S` as a duration, when it is set.
fn read_timeout_override() -> Result<Option<Duration>, Error> {
    let Ok(text) = std::env::var(TIMEOUT_ENV) else {
        return Ok(None);
    };
    match text.parse::<f64>() {
        Ok(seconds) if seconds > 0.0 && seconds.is_finite() => {
            Ok(Some(Duration::from_secs_f64(seconds)))
        }
        _ => Err(Error::new(
            ErrorCode::Usage,
            format!("{TIMEOUT_ENV} must be a number of seconds, not {text:?}"),
        )),
    }
}

fn engine_failed(message: impl Into<String>) -> Error {
    Error::new(ErrorCode::EngineFailed, message)
}
