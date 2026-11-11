//! Process tests that start the built `scrb-core` and talk to it over stdin and stdout, as
//! Electron's relay will. The relay is the main-process module that will start the core and
//! match its replies.

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, ExitStatus, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use scrb_protocol::PROTOCOL_VERSION;
use serde_json::{Value, json};

/// A running `scrb-core` with pipes to its stdin and stdout. Dropping it kills the process.
struct CoreProcess {
    child: Child,
    stdin: Option<ChildStdin>,
    stdout: BufReader<ChildStdout>,
}

impl CoreProcess {
    /// Starts the binary Cargo built for this test run, with no arguments, as main does.
    fn start() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_scrb-core"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("start scrb-core");
        let stdin = child.stdin.take();
        let stdout = BufReader::new(child.stdout.take().expect("piped stdout"));
        CoreProcess {
            child,
            stdin,
            stdout,
        }
    }

    /// Writes one line to the core's stdin.
    fn send(&mut self, line: &str) {
        let stdin = self.stdin.as_mut().expect("stdin is open");
        writeln!(stdin, "{line}").expect("write to scrb-core");
        stdin.flush().expect("flush scrb-core's stdin");
    }

    /// Reads the next line of the core's stdout as JSON.
    fn read_reply(&mut self) -> Value {
        let mut line = String::new();
        let read = self
            .stdout
            .read_line(&mut line)
            .expect("read scrb-core's stdout");
        assert!(read > 0, "scrb-core closed stdout instead of replying");
        serde_json::from_str(&line).expect("reply is JSON")
    }

    /// Sends one request and returns its reply.
    fn call(&mut self, request: Value) -> Value {
        self.send(&request.to_string());
        self.read_reply()
    }

    /// Completes the handshake with the details in [`hello_request`] and checks the reply.
    fn say_hello(&mut self) {
        let reply = self.call(hello_request(1, PROTOCOL_VERSION));
        assert_eq!(reply["ok"], true, "hello failed: {reply}");
        assert_eq!(reply["value"]["protocol"], PROTOCOL_VERSION, "{reply}");
        assert!(reply["value"]["coreVersion"].is_string(), "{reply}");
    }

    /// Closes the core's stdin, as an Electron crash does.
    fn close_stdin(&mut self) {
        self.stdin = None;
    }

    /// Waits for the core to exit, and fails the test after 10 seconds.
    fn wait_for_exit(&mut self) -> ExitStatus {
        let deadline = Instant::now() + Duration::from_secs(10);
        loop {
            if let Some(status) = self.child.try_wait().expect("check scrb-core") {
                return status;
            }
            assert!(
                Instant::now() < deadline,
                "scrb-core did not exit within 10 seconds"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for CoreProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

/// A `hello` request from an app named "Scribe Test", version 9.8.7.
fn hello_request(id: u32, protocol: u32) -> Value {
    json!({
        "id": id,
        "call": "hello",
        "req": {
            "protocol": protocol,
            "appName": "Scribe Test",
            "appVersion": "9.8.7",
            "userDataDir": "/tmp/scribe-test/user-data",
            "documentsDir": "/tmp/scribe-test/documents",
            "countryCode": null
        }
    })
}

/// The Help screen shows the name and version Electron sends in `hello`. A fixed or empty
/// answer would show users the wrong version.
#[test]
fn get_app_info_echoes_hello_app_details() {
    let mut core = CoreProcess::start();
    core.say_hello();

    let reply = core.call(json!({ "id": 2, "call": "getAppInfo" }));

    assert_eq!(reply["id"], 2);
    assert_eq!(reply["ok"], true);
    assert_eq!(reply["value"]["name"], "Scribe Test");
    assert_eq!(reply["value"]["version"], "9.8.7");
}

/// The relay matches each reply to its call by id. When the core can read a bad line's id, it
/// answers with that same id. With any other id, the call would wait forever for a reply that
/// never arrives. Each row after the first also shows that the core kept running after the row
/// before.
#[test]
fn bad_lines_get_errors_and_core_keeps_answering() {
    let mut hello_with_extra_field = hello_request(8, PROTOCOL_VERSION);
    hello_with_extra_field["req"]["extra"] = json!(true);
    let cases = [
        ("not JSON", "this is not json".to_owned(), 0),
        (
            "unknown call",
            r#"{"id":5,"call":"noSuchCall"}"#.to_owned(),
            5,
        ),
        (
            "unknown line field",
            r#"{"id":6,"call":"getAppInfo","extra":1}"#.to_owned(),
            6,
        ),
        (
            "wrong request type",
            r#"{"id":7,"call":"hello","req":{"protocol":"one"}}"#.to_owned(),
            7,
        ),
        (
            "unknown request field",
            hello_with_extra_field.to_string(),
            8,
        ),
    ];
    let mut core = CoreProcess::start();

    for (case, line, expected_id) in cases {
        core.send(&line);
        let reply = core.read_reply();

        assert_eq!(reply["id"], expected_id, "{case}");
        assert_eq!(reply["ok"], false, "{case}");
        assert_eq!(reply["error"]["code"], "invalidRequest", "{case}");
    }
}

/// The relay holds screen calls until `hello` succeeds, but the core does not rely on that. A
/// screen call answered before the handshake would run without the app's details.
#[test]
fn get_app_info_before_hello_answers_conflict() {
    let mut core = CoreProcess::start();

    let reply = core.call(json!({ "id": 1, "call": "getAppInfo" }));

    assert_eq!(reply["id"], 1);
    assert_eq!(reply["ok"], false);
    assert_eq!(reply["error"]["code"], "conflict");
}

/// After refusing a `hello` from a different build, the core refuses every call, so the relay
/// shows its out-of-date message instead of screens that half work.
#[test]
fn hello_mismatch_answers_conflict_to_every_call() {
    let mut core = CoreProcess::start();

    let mismatched_hello = core.call(hello_request(1, PROTOCOL_VERSION + 1));
    let matching_hello = core.call(hello_request(2, PROTOCOL_VERSION));
    let app_info = core.call(json!({ "id": 3, "call": "getAppInfo" }));

    for reply in [&mismatched_hello, &matching_hello, &app_info] {
        assert_eq!(reply["ok"], false, "{reply}");
        assert_eq!(reply["error"]["code"], "conflict", "{reply}");
    }
}

/// A line over 32 MiB is refused even when it is a valid request, and the core picks up again
/// at the next newline. Treating the skipped bytes as separate request lines would send replies
/// that match no pending call.
#[test]
fn oversized_line_is_skipped_with_one_error() {
    let mut core = CoreProcess::start();
    let mut oversized_hello = hello_request(1, PROTOCOL_VERSION);
    oversized_hello["req"]["appName"] = json!("x".repeat(32 * 1024 * 1024));

    core.send(&oversized_hello.to_string());
    let too_long = core.read_reply();
    let next = core.call(hello_request(2, PROTOCOL_VERSION));

    assert_eq!(too_long["id"], 0);
    assert_eq!(too_long["error"]["code"], "invalidRequest");
    assert_eq!(next["id"], 2);
    assert_eq!(next["ok"], true);
}

/// Electron's quit waits for the reply to `shutdown` and then for the exit. A core that stays
/// up, or exits before writing its reply, holds quit for the 15 seconds that `quit.ts` allows.
#[test]
fn shutdown_replies_then_core_exits() {
    let mut core = CoreProcess::start();

    let reply = core.call(json!({ "id": 1, "call": "shutdown" }));
    let status = core.wait_for_exit();

    assert_eq!(reply, json!({ "id": 1, "ok": true }));
    assert!(status.success());
}

/// Replies still queued when `shutdown` arrives reach Electron before the core exits. A lost
/// reply would leave its call waiting forever for an answer. This test sends 1,000 calls plus
/// one line over 32 MiB in a single write, so the core queues more replies than the stdout pipe
/// holds while the test is still writing and has not started reading any of them.
#[test]
fn core_answers_every_queued_call_before_exiting() {
    let shutdown_id = 1002;
    let mut batch = vec![hello_request(1, PROTOCOL_VERSION).to_string()];
    for id in 2..shutdown_id {
        batch.push(json!({ "id": id, "call": "getAppInfo" }).to_string());
    }
    batch.push("x".repeat(32 * 1024 * 1024 + 1));
    batch.push(json!({ "id": shutdown_id, "call": "shutdown" }).to_string());
    let mut core = CoreProcess::start();

    core.send(&batch.join("\n"));
    core.close_stdin();
    let mut reply_ids: Vec<u64> = (0..batch.len())
        .map(|_| core.read_reply()["id"].as_u64().expect("reply has an id"))
        .collect();
    let status = core.wait_for_exit();

    reply_ids.sort_unstable();
    // Id 0 is the reply to the line over 32 MiB.
    assert_eq!(reply_ids, (0..=shutdown_id).collect::<Vec<u64>>());
    assert!(status.success());
}

/// When Electron crashes, stdin closes. The core answers what it already read and exits,
/// instead of running on with no app to talk to.
#[test]
fn core_answers_then_exits_when_stdin_closes() {
    let mut core = CoreProcess::start();

    core.send(&hello_request(1, PROTOCOL_VERSION).to_string());
    core.close_stdin();
    let reply = core.read_reply();
    let status = core.wait_for_exit();

    assert_eq!(reply["ok"], true);
    assert!(status.success());
}
