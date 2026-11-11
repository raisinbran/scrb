//! The messages between the Electron main process and `scrb-core`.
//!
//! Each message is one JSON line. The `calls!` list below names every call the core answers.
//! `cargo test -p scrb-protocol` writes these types as TypeScript into
//! `packages/contracts/src/generated/`, and `generated-check.ts` there compares them with the
//! screens' hand-written types.

mod list;
mod types;

pub use types::{
    AppInfo, CallError, ErrorCode, Hello, HelloReply, ModelInfo, ModelRole, ParseError,
};

use list::{asks, calls, events};

/// Goes up by one whenever a message shape or a call's types change. The core refuses a
/// `hello` that names another number.
pub const PROTOCOL_VERSION: u32 = 1;

calls! {
    screen getAppInfo: () -> AppInfo;
    main hello: Hello -> HelloReply;
    main shutdown: () -> ();
}

asks! {}

events! {}

#[cfg(test)]
mod tests {
    use super::*;

    /// Writes `generated/calls.ts` from the lists above. CI fails when the committed copy
    /// differs, so the screens never build against a stale list.
    #[test]
    fn export_calls_typescript() {
        let config = ts_rs::Config::from_env();
        let text = list::calls_file(&config, PROTOCOL_VERSION, CALL_LIST, ASK_NAMES, EVENT_LIST);

        std::fs::create_dir_all(config.out_dir()).expect("create the generated folder");
        std::fs::write(config.out_dir().join("calls.ts"), text).expect("write calls.ts");
    }
}
