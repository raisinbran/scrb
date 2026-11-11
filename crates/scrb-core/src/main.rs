//! `scrb-core`, the backend program the Electron main process starts.
//!
//! It reads one JSON request per line on stdin and writes one reply per line on stdout. Read
//! `main` first, then [`rpc::Core::answer_line`]. Logs go to stderr, because the log file lives
//! in the meeting library, which this program does not open yet.

mod models;
mod rpc;
mod stdio;

use stdio::Input;

fn main() {
    tracing_subscriber::fmt()
        .with_writer(std::io::stderr)
        .init();

    let (stdout_queue, stdout_writer) = stdio::start_stdout_writer();
    let stdin_lines = stdio::start_stdin_reader();
    let mut core = rpc::Core::default();

    // The loop also ends when stdin closes, which happens when Electron exits or crashes.
    for input in stdin_lines {
        let reply = match input {
            Input::Line(line) => core.answer_line(&line),
            Input::TooLong => rpc::too_long_reply(),
        };
        if stdout_queue.send(reply).is_err() || core.is_shutting_down() {
            break;
        }
    }

    // Closing the queue lets the writer finish the queued lines. Exiting before the join would
    // drop them, including the reply to `shutdown`.
    drop(stdout_queue);
    if stdout_writer.join().is_err() {
        tracing::error!("the stdout writer thread panicked");
    }
}
