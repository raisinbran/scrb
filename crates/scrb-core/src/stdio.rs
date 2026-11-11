//! The stdin reader thread and the stdout writer thread. This is the only module that writes
//! stdout, because stdout carries the protocol.

use std::io::{self, BufRead, Read, Write};
use std::sync::mpsc::{self, Receiver, SyncSender};
use std::thread::{self, JoinHandle};

/// The longest request line the core reads, not counting its newline.
const MAX_LINE_BYTES: usize = 32 * 1024 * 1024;
const STDOUT_QUEUE_LINES: usize = 1024;

/// One line read from stdin.
pub enum Input {
    /// The line without its newline.
    Line(Vec<u8>),
    /// A line over [`MAX_LINE_BYTES`], already skipped.
    TooLong,
}

/// Starts the thread that reads stdin. The receiver ends when stdin closes.
pub fn start_stdin_reader() -> Receiver<Input> {
    let (sender, receiver) = mpsc::channel();
    thread::spawn(move || {
        let mut stdin = io::stdin().lock();
        loop {
            match read_capped_line(&mut stdin) {
                Ok(Some(input)) => {
                    if sender.send(input).is_err() {
                        return;
                    }
                }
                Ok(None) => return,
                Err(error) => {
                    tracing::error!(%error, "reading stdin failed");
                    return;
                }
            }
        }
    });
    receiver
}

/// Starts the one thread that writes stdout. Lines leave in the order they are sent, and a
/// send blocks once 1,024 lines are already queued.
pub fn start_stdout_writer() -> (SyncSender<String>, JoinHandle<()>) {
    let (sender, receiver) = mpsc::sync_channel(STDOUT_QUEUE_LINES);
    let writer = thread::spawn(move || write_lines(receiver));
    (sender, writer)
}

#[expect(
    clippy::disallowed_methods,
    reason = "this thread is the one writer of stdout"
)]
fn write_lines(receiver: Receiver<String>) {
    let mut stdout = io::stdout().lock();
    for line in receiver {
        if let Err(error) = writeln!(stdout, "{line}").and_then(|()| stdout.flush()) {
            tracing::error!(%error, "writing stdout failed, so no reply can reach the app");
            return;
        }
    }
}

/// Reads one line, or skips a line over [`MAX_LINE_BYTES`] without keeping it in memory.
/// Returns `None` at the end of input.
fn read_capped_line(reader: &mut impl BufRead) -> io::Result<Option<Input>> {
    let mut line = Vec::new();
    let limit = MAX_LINE_BYTES as u64 + 1;
    if reader.by_ref().take(limit).read_until(b'\n', &mut line)? == 0 {
        return Ok(None);
    }
    if line.last() == Some(&b'\n') {
        line.pop();
        return Ok(Some(Input::Line(line)));
    }
    // A short line without a newline is the last line of the input.
    if line.len() <= MAX_LINE_BYTES {
        return Ok(Some(Input::Line(line)));
    }
    skip_past_newline(reader)?;
    Ok(Some(Input::TooLong))
}

fn skip_past_newline(reader: &mut impl BufRead) -> io::Result<()> {
    loop {
        let buffer = reader.fill_buf()?;
        if buffer.is_empty() {
            return Ok(());
        }
        if let Some(newline) = buffer.iter().position(|&byte| byte == b'\n') {
            reader.consume(newline + 1);
            return Ok(());
        }
        let skipped = buffer.len();
        reader.consume(skipped);
    }
}
