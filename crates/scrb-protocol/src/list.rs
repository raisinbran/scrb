//! The `calls!`, `asks!` and `events!` macros, and the writer of `generated/calls.ts`.
//!
//! Adding a call's line to `calls!` in `lib.rs` adds it to [`Request`](crate::Request), to
//! [`Handlers`](crate::Handlers), and to the TypeScript that Electron's relay reads. The relay
//! is the main-process module that will start the core and match its replies.

use std::any::TypeId;

use serde::Serialize;

use crate::{CallError, ErrorCode};

/// Lists every call the core answers, one `screen name: Request -> Response;` line for a screen
/// call or `main name: Request -> Response;` for a main-only call. `()` stands for no request
/// or no reply value. The request is one type name or `()`, because a macro type pattern
/// cannot be followed by `->`.
macro_rules! calls {
    ($($kind:ident $name:ident: $request:tt -> $response:ty;)*) => {
        /// One parsed request. Each variant has its call's name on the wire.
        #[allow(non_camel_case_types)]
        #[derive(Debug)]
        pub enum Request {
            $($name($request),)*
        }

        /// The core's handler for each call. These return types are the ones that the generated
        /// TypeScript gives the screens.
        #[allow(non_snake_case)]
        pub trait Handlers {
            $(fn $name(&mut self, request: $request) -> Result<$response, CallError>;)*
        }

        impl Request {
            /// Parses `request`, the line's `req` value, as the request of the call named `call`.
            pub fn parse(call: &str, request: serde_json::Value) -> Result<Request, ParseError> {
                match call {
                    $(stringify!($name) => serde_json::from_value(request)
                        .map(Request::$name)
                        .map_err(ParseError::WrongShape),)*
                    _ => Err(ParseError::UnknownCall),
                }
            }

            /// Returns true for a screen call, which the core answers only after the handshake.
            pub fn is_screen_call(&self) -> bool {
                match self {
                    $(Request::$name(_) => $crate::list::is_screen!($kind),)*
                }
            }

            /// Runs the handler and returns the reply's `value`, or `None` for a call that
            /// returns nothing.
            pub fn run(
                self,
                handlers: &mut impl Handlers,
            ) -> Result<Option<serde_json::Value>, CallError> {
                match self {
                    $(Request::$name(request) => {
                        $crate::list::reply_value(handlers.$name(request)?)
                    })*
                }
            }
        }

        #[cfg(test)]
        const CALL_LIST: &[$crate::list::CallEntry] = &[
            $($crate::list::CallEntry {
                name: stringify!($name),
                is_screen_call: $crate::list::is_screen!($kind),
                request: $crate::list::ts_type::<$request>,
                response: $crate::list::ts_type::<$response>,
            },)*
        ];
    };
}

/// Lists every core request to Electron, one `name: Request -> Response;` line each, with the
/// request written as in `calls!`. Only the names reach the TypeScript, since no ask yet needs
/// its request or response type generated.
macro_rules! asks {
    ($($name:ident: $request:tt -> $response:ty;)*) => {
        #[cfg(test)]
        const ASK_NAMES: &[&str] = &[$(stringify!($name),)*];
    };
}

/// Lists every event the core sends, one `name: Payload;` line each.
macro_rules! events {
    ($($name:ident: $payload:ty;)*) => {
        #[cfg(test)]
        const EVENT_LIST: &[$crate::list::EventEntry] = &[
            $($crate::list::EventEntry {
                name: stringify!($name),
                payload: $crate::list::ts_type::<$payload>,
            },)*
        ];
    };
}

macro_rules! is_screen {
    (screen) => {
        true
    };
    (main) => {
        false
    };
}

pub(crate) use {asks, calls, events, is_screen};

/// Turns a handler's return value into the reply's `value`. A call that returns `()` gets a
/// reply with no `value` field, which JavaScript reads as `undefined`.
pub(crate) fn reply_value<T: Serialize + 'static>(
    value: T,
) -> Result<Option<serde_json::Value>, CallError> {
    if TypeId::of::<T>() == TypeId::of::<()>() {
        return Ok(None);
    }
    serde_json::to_value(value).map(Some).map_err(|_| {
        CallError::new(
            ErrorCode::Internal,
            "The recorder could not encode its reply.",
        )
    })
}

#[cfg(test)]
pub(crate) use typescript::{CallEntry, EventEntry, calls_file, ts_type};

#[cfg(test)]
mod typescript {
    use std::any::TypeId;
    use std::collections::{BTreeMap, BTreeSet};

    use ts_rs::{Config, Dependency, TS};

    /// One line of `calls!`.
    pub(crate) struct CallEntry {
        pub name: &'static str,
        pub is_screen_call: bool,
        pub request: fn(&Config) -> TsType,
        pub response: fn(&Config) -> TsType,
    }

    /// One line of `events!`.
    pub(crate) struct EventEntry {
        pub name: &'static str,
        pub payload: fn(&Config) -> TsType,
    }

    /// A Rust type's TypeScript name, and the generated files that `calls.ts` imports for it.
    pub(crate) struct TsType {
        name: String,
        imports: Vec<Dependency>,
    }

    /// Returns `T`'s TypeScript name. `()` becomes `void`, as the screens write a call with no
    /// request or no reply.
    pub(crate) fn ts_type<T: TS + 'static>(config: &Config) -> TsType {
        if TypeId::of::<T>() == TypeId::of::<()>() {
            return TsType {
                name: "void".to_owned(),
                imports: Vec::new(),
            };
        }
        // A type with its own file is imported from it. A wrapper such as `Vec<AppInfo>` has
        // no file, so the types inside it are imported instead.
        let imports = match Dependency::from_ty::<T>(config) {
            Some(own_file) => vec![own_file],
            None => T::dependencies(config),
        };
        TsType {
            name: T::name(config),
            imports,
        }
    }

    /// Returns the text of `generated/calls.ts`.
    pub(crate) fn calls_file(
        config: &Config,
        protocol_version: u32,
        calls: &[CallEntry],
        ask_names: &[&str],
        events: &[EventEntry],
    ) -> String {
        let mut imports = Imports::default();
        let mut screen_calls = String::new();
        let mut screen_call_names = Vec::new();
        let mut main_only_call_names = Vec::new();
        for call in calls {
            if !call.is_screen_call {
                main_only_call_names.push(call.name);
                continue;
            }
            let request = imports.add((call.request)(config));
            let response = imports.add((call.response)(config));
            screen_calls.push_str(&format!(
                "  {}: {{ request: {request}; response: {response} }};\n",
                call.name
            ));
            screen_call_names.push(call.name);
        }
        let mut event_payloads = String::new();
        for event in events {
            let payload = imports.add((event.payload)(config));
            event_payloads.push_str(&format!("  {}: {payload};\n", event.name));
        }

        let quoted_names: Vec<String> = screen_call_names
            .iter()
            .map(|name| format!("\"{name}\""))
            .collect();
        format!(
            "// This file was written by `cargo test -p scrb-protocol` from the lists in \
             crates/scrb-protocol/src/lib.rs. Do not edit it by hand.\n\
             {imports}\n\
             export const PROTOCOL_VERSION = {protocol_version};\n\n\
             export interface CoreScreenCalls {{\n{screen_calls}}}\n\n\
             export const CORE_SCREEN_CALL_NAMES = [{names}] as const;\n\n\
             export type MainOnlyCallName = {main_only};\n\n\
             export type CoreAskName = {asks};\n\n\
             export interface CoreEvents {{\n{event_payloads}}}\n",
            imports = imports.render(config),
            names = quoted_names.join(", "),
            main_only = name_union(&main_only_call_names),
            asks = name_union(ask_names),
        )
    }

    /// Writes names as a TypeScript union of string literals, or `never` for no names.
    fn name_union(names: &[&str]) -> String {
        if names.is_empty() {
            return "never".to_owned();
        }
        let quoted: Vec<String> = names.iter().map(|name| format!("\"{name}\"")).collect();
        quoted.join(" | ")
    }

    /// The type names `calls.ts` imports, grouped by the file each comes from.
    #[derive(Default)]
    struct Imports {
        by_file: BTreeMap<String, BTreeSet<String>>,
    }

    impl Imports {
        /// Records the imports `ts_type` needs and returns its name.
        fn add(&mut self, ts_type: TsType) -> String {
            for dependency in ts_type.imports {
                let file = dependency.output_path.with_extension("");
                self.by_file
                    .entry(file.to_string_lossy().into_owned())
                    .or_default()
                    .insert(dependency.ts_name);
            }
            ts_type.name
        }

        fn render(&self, config: &Config) -> String {
            let extension = config
                .import_extension()
                .map(|extension| format!(".{extension}"))
                .unwrap_or_default();
            let mut lines = String::new();
            for (file, names) in &self.by_file {
                let names: Vec<&str> = names.iter().map(String::as_str).collect();
                lines.push_str(&format!(
                    "import type {{ {} }} from \"./{file}{extension}\";\n",
                    names.join(", ")
                ));
            }
            lines
        }
    }
}
