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

## Source-only corrections after independent review 5820782468

The source corrections have not run speech synthesis, builds, capture, playback or audio tests. `prepare-speech.ps1` still calls synchronous `SpeakSsml`. Its bookmark list is locked for both writes and snapshots. After the call returns, it samples every 100 ms for at most five seconds, stopping early if complete. Each poll logs UTC, elapsed time, expected and received counts, missing, duplicate and unexpected names, ordering, and receipt timestamps beside the WAV as `.wav.bookmarks.tsv`. Failure retains the `Incomplete engine bookmarks for ...` error prefix and includes the timeline. This is diagnostic instrumentation, not a claim that a callback race caused A-019.

Source placement now fits whole clips to window endpoints by choosing counts and distributing allowed gaps. Assertions check word-timing gaps throughout 170–245 s, including both edges, and reject gaps of 0.5 s or more. They also check short/long durations, at least eight failure-window shorts per track, repeat spacing, no within-track overlap, outside-window gaps, six-minute scored-span coverage, disjoint vocabularies and at least 180 seconds of simultaneous speech. The draft numerical interpretation of “about 40%” is 35–45% by count; this implementation tolerance is explicit for review, not a changed gate threshold. Word-timing checks do not replace waveform spot-checks or listening. Eligibility remains unset until that review.

The recorded archive audit is frozen in the manifest with its original result-file hash. `audit-archive.py` is unchanged and was not rerun. No custom screen recorder is provided. The existing Windows recording method and a separate clock overlay still require validation before freeze.

## Candidate's own build procedure (not run in this source-only task)

The custom `build-candidate.mjs` is removed. Use a **new, clean Git worktree** at the exact candidate, then the candidate's own locked dependency install and build. These commands are for a separately authorized build attempt in **normal Windows PowerShell, not Administrator**. `npm.cmd` is the Windows command shim for `npm`; no execution-policy change is needed.

```powershell
git -C "C:\Users\bchen\Documents\GitHub\scrb" worktree add --detach "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-candidate-clean-553dd90" 553dd9080f452f8a54ccff5cd5fea8d6937438ae
Set-Location "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-candidate-clean-553dd90"
git rev-parse HEAD
git status --porcelain --untracked-files=all
npm.cmd ci
npm.cmd run build
git status --porcelain --untracked-files=all
Get-FileHash package-lock.json -Algorithm SHA256
```

Stop on any command failure; do not proceed to the next command or retry. Record the exact HEAD and empty status output before and after the build as the clean-tree statement. No clean build worktree exists from this procedure yet. The commit SHA and clean-tree statement replace raw CRLF byte comparisons for future build provenance; earlier failed comparisons and build attempts remain below as historical evidence. Before freeze, also record built artifact hashes and native capture helper, external tools, model hashes/configuration and real launch provenance. `npm run build` alone does not establish native recording readiness.

## Owner's next speech run (separately executed once by the owner)

Open **Start → Windows PowerShell → Open**, not “Run as administrator.” In that normal **Windows PowerShell 5.1** window, run this once. It generates invented speech files without recording or playback. The new output folder preserves both earlier failed attempts.

```powershell
powershell.exe -NoProfile -File "C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest\prepare-speech.ps1" -OutputDirectory "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-instrumented-20261108"
```

On failure, keep all files and report the error and `.bookmarks.tsv` timeline; do not rerun. On success, report completion and leave assembly and eligibility review for the next authorized step.

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

## Owner-authorized continuation, November 8

The owner confirmed that Microsoft David Desktop and Zira Desktop render WAV files successfully in normal Windows PowerShell. The earlier rendering failure is attributable to the agent's sandbox context, not missing machine voices. **Proposed A-018** records this correction to the previously unresolved attribution; it is not yet entered in the incident register.

Normalized verification checked all 358 candidate files under apps/ and packages/. There were zero content mismatches after normalizing text CRLF to LF on both sides; 348 files differed only in line endings. Binary comparison remained exact. The original raw-byte failure report is retained.

The one authorized corrected build attempt built the UI successfully, then failed during Electron bundling with an access-denied ancestor-directory error and unresolved main/preload entry points. The cause remains unresolved. No retry ran. The private `build-corrected-20261108.log` and normalized verification report preserve the outcome.

Next, the owner runs speech rendering once in normal, non-admin Windows PowerShell 5.1, into the fresh private `renders-owner-20261108` directory. The agent does not run speech synthesis in the sandbox. Assembly and source audit wait for a successful owner-render result; any rendering failure stops this continuation. No virtual audio cables are installed, as confirmed by the owner. No driver or setting change is authorized.

PR 74 remains draft. The connector exception used to create it does not authorize publication of these continuation changes. Local manifest edits remain unpublished pending renewed owner authorization.

### Owner-render failure — stopped

The owner's single authorized command invoked Windows PowerShell through `powershell.exe`, even though its parent window was PowerShell 7. The renderer failed with `Incomplete engine bookmarks for microphone-long-00`. The output directory retains `microphone-long-00.wav` (405142 bytes). File presence is not proof of complete or correctly timed audio; no complete word-timing manifest exists.

**Proposed A-019, confirmed agent/test-tooling failure:** The agent supplied a renderer whose required bookmark-count guard failed in the owner's normal PowerShell context. The owner spent time running the command and received an unusable source-preparation result. The bookmark failure's technical cause is unresolved; this is not an application defect or an owner command error. Preserve the output and reported error. No retry, assembly, source audit, listening approval, audio routing change or recording followed. Further diagnosis requires a new owner instruction. This incident is proposed here and is not yet entered in the agents register.

Continuation usage, November 8 PT: 17:20:14 start to 17:22:32 stopping observation; five-hour remaining 83% to 81%, weekly 97% to 97%. Codex Windows desktop; exact model/effort unavailable; overlap unknown; same reset windows as the manifest. One build attempt and one owner-render attempt, zero automatic retries. Acceptance is failed/incomplete. Tracker row remains proposed and unpublished.

## Proposed incident additions from source corrections

- **A-020, confirmed agent/test-tooling omission:** The original source placement stopped when a selected clip did not fit and could leave an unvalidated multi-second tail in 170–245 s. Independent review 5820782468 identified the missing coverage assertion. No actual source pack or physical run used that placement. Count selection and gap distribution now have synthetic coverage checks, including the longest allowed clips; actual source eligibility remains unverified.
- **A-021, confirmed agent/development-check mistake:** The first new coverage check used an exact floating-point 380-second boundary and falsely failed the valid synthetic plan by rounding error. Three tests failed at that guard. A one-nanosecond arithmetic tolerance on the outer scored boundary corrected it; the strict less-than-0.5-second failure-gap rule is unchanged. All twelve tests then passed. No physical test, owner action or evidence was affected.

All earlier A-013–A-019 entries and their historical attribution remain above. The model/effort omission in the continuation usage paragraph was subsequently recovered from per-turn metadata as `gpt-6.1-sol`, low effort, Codex Desktop; the original report is retained and the tracker note carries the correction. The moved manifest publication, guard/checker and usage records are preserved in `docs/handoffs/PR74-preflight-tracker-note.md` and the prepared PR body. They are not test-freeze inputs.
