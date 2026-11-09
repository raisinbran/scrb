# Windows Gate 3 diagnostic preparation

Candidate: `553dd9080f452f8a54ccff5cd5fea8d6937438ae`.
Protocol: `docs/handoffs/SRCB_Windows_Gate3_Diagnostic_Retest_Protocol_v3_Reviewed.md`
at `6297862` on origin/main. The owner's November 8 assignment establishes approval despite the source's stale draft header.

This directory cannot start recording. It contains preparation tools only. Sources and raw output belong in a new private directory outside Git. Existing evidence must never be overwritten. No driver installation, routing change, retry, or acceptance run is implicit in running these tools.

- `prepare-speech.ps1` renders invented speech with two installed Windows voices and records SSML word-boundary bookmarks. It never plays audio or opens capture.
- `assemble-sources.py` builds the 420-second WAVs, independent annotations and source audit from those renders. Word ends come from engine bookmarks, not recognition. A waveform spot-check and listen-through remain mandatory before eligibility is frozen.
- `observe-live.ps1` is a read-only UI Automation probe restricted to an explicitly supplied app PID. It records screen bounds, offscreen flags and QPC brackets; it does not send input or start capture. Its raw samples do not constitute validated visibility or track matching.
- `audit-archive.py` reads only allowlisted, non-transcript metadata from the November 7 archive. It does not open audio, renderer words, or any microphone reference. It cannot re-score 73/77.
- `analyze-bounds.py` evaluates already adjudicated endpoints. It includes synthetic tests for pre-speech rejection, substituted-word identity, negative latency, missing identity, polling straddles and marker disagreement. Automatic text alignment, marker detection and causal event-chain localization remain unimplemented. Do not treat these tests as an end-to-end scorer validation.

Use Windows PowerShell 5.1 for the speech and UI Automation tools. All tools fail rather than overwrite their output. None of these tools is an execution harness. The preflight manifest lists unfinished analysis and validation explicitly; do not use it as recording authorization.

## November 8 stopping point

Preparation is incomplete. No physical recording, screen recording or audio playback was started. The short throwaway validation was explicitly authorized during the chat but could not start on the required route. No failed check was retried.

The candidate build failed because I supplied root dependencies without the desktop's app-local dependency junction. The script now creates that junction before building, but the corrected build has not run. Speech rendering failed with “No voice installed on the system or none available with the current security setting.” This followed successful voice enumeration; the cause of rendering unavailability is unresolved. No source WAV pack or eligible denominator exists.

The host's active endpoint inventory showed only Realtek microphone and speakers; other listed headset endpoints had Unknown status. No virtual route was identified. The owner did not know of another route. No driver or setting was changed.

The approved PR-write guard was not installed. Compiling the existing local guard failed on Unix-only `syscall.Flock` and `syscall.LOCK_EX`; there was no PR write attempt or bypass. A draft PR body is ready locally. Publication needs the owner to permit a supported alternative or supply the guard.

Continuation requires explicit authorization for a corrected build attempt and speech-render attempt, resolution of the two virtual routes, then source audit, actual Live observer validation and complete analysis validation. This is not a request to repeat a physical test. The main diagnostic recording remains unauthorized.

## Proposed incident-register entries (not committed to agents/)

These identifiers are proposals against origin/main's last confirmed entry A-012; check for concurrent allocations before inserting them.

- **A-013, confirmed, Codex/Windows preparation tooling:** I initially used unsupported Python wave mode `xb` in source assembly. I caught and corrected it before invocation by opening the underlying file exclusively and passing it to `wave.open` in `wb` mode. No test or evidence was affected. Assembly remains unexecuted because source rendering failed. The initial SSML literal `150wpm` was also replaced with supported percentage syntax before invocation; actual speaking rate remains unverified.
- **A-014, confirmed, Codex/Windows build setup:** I linked only root dependencies into the candidate archive, omitting app-local dependencies. The first build failed to resolve `@vitejs/plugin-react`. The installed plugin exists under `apps/desktop/node_modules`. The script is corrected, but no retry was run. There was no application defect or production edit.
- **A-015, confirmed, Codex/Windows tooling setup:** I attempted to compile the existing PR guard before checking Windows portability. Compilation failed on Unix-only file-locking symbols. No PR operation ran. Publication remains blocked; no alternate tool bypass was used.
- **A-016, confirmed, Codex/Windows inspection:** Two reads used nonexistent paths (`testing/` and `screens/Live.tsx`) instead of checking existence first. A label search also failed because I quoted a regular expression incorrectly for PowerShell. A documentation patch failed its context check after formatting; the patch changed nothing and was replaced with a structured JSON update. These commands changed no evidence. Actual screen files were located with `rg --files`. This spent minor tool/context time, not a physical test attempt.
- **A-017, confirmed, Codex/Windows verification:** I compared the extracted archive's raw file hashes with Git blobs without accounting for `core.autocrlf=true`. The check reported mismatches across many files. A focused comparison of `main.ts` found CRLF versus LF only, with identical content after newline normalization. Preserve `source-verification.json` as the failed check; full normalized verification was not rerun and must not be claimed complete. No production source was edited by this task.

Quota changes are account-wide observations, not measured costs of these individual incidents. The rendering failure is recorded separately as an unattributed environment/tooling failure; successful enumeration does not establish why rendering failed.
