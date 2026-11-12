//! Turns each request line into one reply line, and keeps the handshake state.

use std::panic::{self, AssertUnwindSafe};

use scrb_protocol::{
    AppInfo, CallError, ErrorCode, Handlers, Hello, HelloReply, PROTOCOL_VERSION, ParseError,
    Request,
};
use serde::Deserialize;
use serde_json::{Value, json};

use crate::models;

const NOT_READY: &str = "Meeting Scribe is still starting. Try again in a moment.";
const PROTOCOL_REFUSED: &str =
    "The app and its recorder are different versions. Reinstall Meeting Scribe.";

/// The core's state between requests.
#[derive(Default)]
pub struct Core {
    handshake: Handshake,
    shutting_down: bool,
}

#[derive(Default)]
enum Handshake {
    #[default]
    Waiting,
    Done {
        app_name: String,
        app_version: String,
    },
    /// `hello` named another protocol, so the core refuses every call.
    Refused,
}

impl Core {
    /// Answers one request line with one reply line. Every line gets a reply, even one that is
    /// not JSON.
    pub fn answer_line(&mut self, line: &[u8]) -> String {
        let (id, result) = match parse_line(line) {
            Ok((id, request)) => (id, self.answer(request)),
            Err((id, error)) => (id, Err(error)),
        };
        reply_line(id, result)
    }

    /// Returns true once `shutdown` has been answered.
    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down
    }

    fn answer(&mut self, request: Request) -> Result<Option<Value>, CallError> {
        match self.handshake {
            Handshake::Refused => return Err(conflict(PROTOCOL_REFUSED)),
            Handshake::Waiting if request.is_screen_call() => return Err(conflict(NOT_READY)),
            _ => {}
        }
        // A panic in a handler gets an `internal` reply instead of ending the core. The
        // default panic hook has already written the panic to stderr.
        panic::catch_unwind(AssertUnwindSafe(|| request.run(self))).unwrap_or_else(|_| {
            Err(CallError::new(
                ErrorCode::Internal,
                "The recorder hit an unexpected error.",
            ))
        })
    }
}

impl Handlers for Core {
    fn getAppInfo(&mut self, _request: ()) -> Result<AppInfo, CallError> {
        match &self.handshake {
            Handshake::Done {
                app_name,
                app_version,
            } => Ok(models::app_info(app_name, app_version)),
            _ => Err(conflict(NOT_READY)),
        }
    }

    fn hello(&mut self, hello: Hello) -> Result<HelloReply, CallError> {
        if matches!(self.handshake, Handshake::Done { .. }) {
            return Err(conflict("The handshake already happened."));
        }
        if hello.protocol != PROTOCOL_VERSION {
            self.handshake = Handshake::Refused;
            return Err(conflict(format!(
                "scrb-core speaks protocol {PROTOCOL_VERSION} but the app sent {}.",
                hello.protocol
            )));
        }
        self.handshake = Handshake::Done {
            app_name: hello.app_name,
            app_version: hello.app_version,
        };
        Ok(HelloReply {
            protocol: PROTOCOL_VERSION,
            core_version: env!("CARGO_PKG_VERSION").to_owned(),
        })
    }

    fn shutdown(&mut self, _request: ()) -> Result<(), CallError> {
        self.shutting_down = true;
        Ok(())
    }
}

/// The reply to a line over the 32 MiB cap, whose id the core never read.
pub fn too_long_reply() -> String {
    reply_line(
        0,
        Err(invalid_request("The request is longer than 32 MiB.")),
    )
}

/// The fields of a request line. Any other field makes the line invalid.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct RequestLine {
    id: u32,
    call: String,
    /// Missing or `null` for a call that takes no request.
    #[serde(default)]
    req: Value,
}

/// Reads a line's id and request. A bad line gives an `invalidRequest` error and the id to answer
/// with. That id is the line's own, or 0 when it cannot be read.
fn parse_line(line: &[u8]) -> Result<(u32, Request), (u32, CallError)> {
    let value: Value = serde_json::from_slice(line).map_err(|error| {
        tracing::warn!(%error, "request line is not JSON");
        (0, invalid_request("The request is not valid JSON."))
    })?;
    let readable = readable_id(&value);
    let RequestLine { id, call, req } = serde_json::from_value(value).map_err(|error| {
        tracing::warn!(%error, id = readable, "request line has missing or unknown fields");
        (
            readable,
            invalid_request("The request has missing or unknown fields."),
        )
    })?;
    let request = Request::parse(&call, req).map_err(|error| {
        tracing::warn!(?error, id, %call, "request refused");
        let message = match error {
            ParseError::UnknownCall => format!("The recorder does not answer {call}."),
            ParseError::WrongShape(_) => format!("The request for {call} has the wrong shape."),
        };
        (id, invalid_request(message))
    })?;
    Ok((id, request))
}

/// Returns the line's `id` when it is a whole number that fits in a `u32`, and 0 otherwise.
fn readable_id(value: &Value) -> u32 {
    value
        .get("id")
        .and_then(Value::as_u64)
        .and_then(|id| u32::try_from(id).ok())
        .unwrap_or(0)
}

fn reply_line(id: u32, result: Result<Option<Value>, CallError>) -> String {
    let reply = match result {
        Ok(None) => json!({ "id": id, "ok": true }),
        Ok(Some(value)) => json!({ "id": id, "ok": true, "value": value }),
        Err(error) => json!({ "id": id, "ok": false, "error": error }),
    };
    reply.to_string()
}

fn invalid_request(message: impl Into<String>) -> CallError {
    CallError::new(ErrorCode::InvalidRequest, message)
}

fn conflict(message: impl Into<String>) -> CallError {
    CallError::new(ErrorCode::Conflict, message)
}
