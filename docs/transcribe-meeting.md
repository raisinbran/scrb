# Transcribing a meeting recording

This script turns a meeting you recorded in the app into a readable
transcript that names who spoke. It runs entirely on your own computer.
Nothing from your meeting is sent to the internet. Only the free
transcription models are downloaded, and only once.

## One-time setup

1. Install uv, the small tool that runs the script.
   - macOS, in Terminal:
     `curl -LsSf https://astral.sh/uv/install.sh | sh`
   - Windows, in PowerShell:
     `powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"`
2. Make a free account at https://huggingface.co.
3. While signed in, open
   https://huggingface.co/pyannote/speaker-diarization-community-1
   and accept the terms shown on that page.
4. On the same site, open Settings, then Access Tokens, and create a
   token with read permission. Copy it somewhere safe.
5. Give that token to your shell, replacing `<your token>` with it.
   - macOS: `export HF_TOKEN="<your token>"`
   - Windows PowerShell: `$env:HF_TOKEN = "<your token>"`
   You need to set it again each time you open a new shell window.

## Running the script

1. Record a meeting in the app as usual, then stop the recording.
2. Find the meeting folder. It is inside the `meetings` folder in
   `Documents/Meeting Scribe`. Each meeting has its own folder, named
   with its date and title.
3. Open a shell in the repository folder and run the command below,
   putting the full path to your meeting folder in the quotes:
   `uv run scripts/transcribe_meeting.py "<path to meeting folder>"`
4. When it finishes, the meeting folder contains `speakers-transcript.md`, an
   easy-to-read file, and `speakers-transcript.json`, the same text with exact
   word timings.

## What to expect

The first run downloads about 3 GB of models, so it needs a network
connection and disk space. Later runs skip the download. All processing
runs on the processor rather than a graphics card, so it is slow. A
one-hour meeting can take longer than an hour to finish. Keep the
window open until it prints the paths it wrote.
