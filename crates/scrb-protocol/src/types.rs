//! The request, reply and error types of the calls in `lib.rs`.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// The handshake request, always the first request main sends.
#[derive(Debug, Deserialize, TS)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
#[ts(export)]
pub struct Hello {
    /// Main's copy of `PROTOCOL_VERSION`.
    pub protocol: u32,
    pub app_name: String,
    pub app_version: String,
    /// Electron's `app.getPath('userData')`.
    pub user_data_dir: String,
    /// Electron's `app.getPath('documents')`.
    pub documents_dir: String,
    /// `null` when Electron reports no country.
    pub country_code: Option<String>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct HelloReply {
    pub protocol: u32,
    pub core_version: String,
}

/// What the Help screen's About section shows.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub build_date: String,
    pub copyright: String,
    pub storage_statement: String,
    pub models: Vec<ModelInfo>,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ModelInfo {
    pub role: ModelRole,
    pub name: String,
    pub version: String,
    pub installed: bool,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ModelRole {
    LiveSpeech,
    FinalSpeech,
    Speaker,
    Summary,
}

/// The seven error codes the screens know. Electron's relay turns any other code into `internal`.
/// The relay is the main-process module that will start the core and match its replies.
#[derive(Debug, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub enum ErrorCode {
    NotImplemented,
    InvalidRequest,
    NotFound,
    Conflict,
    PermissionDenied,
    DiskFull,
    Internal,
}

/// The error in a failed reply. `message` is plain text that is safe to show the user, so it
/// never holds a file path or a Rust error.
#[derive(Debug, Serialize)]
pub struct CallError {
    pub code: ErrorCode,
    pub message: String,
}

impl CallError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        CallError {
            code,
            message: message.into(),
        }
    }
}

/// Why [`Request::parse`](crate::Request::parse) refused a request.
#[derive(Debug)]
pub enum ParseError {
    UnknownCall,
    WrongShape(serde_json::Error),
}
