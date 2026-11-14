# Ideas worth keeping from the contributor's Rust PRs

Status: reference note, no code. Source PRs stay open and unmerged: #87-95 (Rust v2), #135-137 (Rust v3, stopped by its author), #138 (speaker script). Decision (owner, 2026-11-14): keep them open until the contributor answers; no merge planning for the Rust PRs.

Why not merge: the backend rewrite is ~33,000-39,000 lines, changes `packages/contracts`, and replaces a backend that already works. The backend packages are shared TypeScript running on both OSes; only audio capture is per-OS (`native/macos-capture`, `native/windows-capture`), and that must stay OS-specific. No measured size or speed gain justifies a rewrite.

## 1. Delete rules (PR #95): use for SP-02 and the delete dialog

Behaviours worth copying in the TypeScript library, with tests:

- Delete refuses a meeting that is recording, paused, importing or being transcribed.
- Rename the folder to `.deleting-<id>` first, so a failure before the rename changes nothing; then remove the list entry, the folder and cached files.
- After deleting, check for leftovers (a folder another program held, a copy of the meeting) and tell the user audio may still be on disk.
- On opening the library, finish a delete a crash interrupted; ignore a `.deleting-` folder whose name is not a meeting id.
- A save refuses a folder outside `meetings/` or one that now holds a different meeting.
- A meeting whose `meeting.json` cannot be read can still be deleted.
  Not tested in the source: retries on Windows while another program holds a file.

## 2. Speaker-labelling script (PR #138): use as a benchmark only

Optional script that re-runs a recorded meeting through WhisperX (large-v3-turbo) and pyannote (community-1) and writes a speaker-labelled transcript without touching v1's transcript. Use it, on AMI fixtures only, to see how far speaker labelling can improve and to compare against our diarization when working on interjection ordering. It is not a shipping dependency (Python, large models). Never run it on the owner's real recordings.

## 3. Deliberately not adopted

Rust workspace, stdio JSON link, Python engine worker, and the Rust library crate. Revisit only if a measured need appears and the contributor revives the work.
