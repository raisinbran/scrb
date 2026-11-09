# Windows Gate 3 diagnostic preparation

## Current owner-approved method: ConstructedUnits

This section supersedes the earlier A/B/C full-render instructions, which remain below as incident history. The owner approved the decision method on November 8 with the independent corrections supplied in the task. The decision file's earlier recommendation status is historical. The separate `docs/gates/gate-3-windows-v3-timing-amendment-proposed.md` needs review; Protocol v3 itself is unchanged. The manifest stays **NOT_FROZEN**. No audio, synthesis, recording, playback, application build or processing of owner unit WAVs ran during this source-only implementation. Tests use in-memory synthetic bursts only.

Each long utterance is exactly one prefix unit containing all words except its last, plus one final-word unit. A one-word utterance has only its final unit. `speech-specs.ps1` keeps the original texts and voices and adds ordered unit IDs/roles. `UnitRenderer.cs` renders plain SSML once per unit, with no bookmarks, events or AudioPosition access. It returns actual WAV sample count and whole-file SHA-256. `-Method ConstructedUnits` dispatches and returns before any legacy renderer, probe, Python bookmark helper or engine timing input is accessed. Legacy A/B/C runs require `-Probe` and are diagnostic-only. The constructed metadata loader rejects engine-timing fields and values.

`measure-units.py` writes to a fresh derived folder. It measures primary 5 ms RMS edges at max(128, 3% of the unit peak RMS), and secondary edges at PCM16 amplitude 184. It rejects silence, clipped edges, invalid crop padding, onset spread over 25 ms and offset spread over 100 ms (owner-approved policy, see the 2026-11-09 revision below). Crop padding is 20 ms before the earliest onset and 30 ms after the latest offset. All measurements retain the original WAV hash, manifest hash and measurement script/helper versions. No scale factor is used.

`measure-units.py --report-only` measures all units with the same algorithm and thresholds, never aborts, and writes `report-only-measurements.json` with every value and the list of existing limits each unit would exceed (`limits_exceeded`). It writes no pass/fail verdict, and its output cannot be consumed by `assemble-sources.py`.

`assemble-sources.py` consumes only `units-manifest.json` and the measurements. Its default inserted join is 40 ms (960 source samples at 24 kHz). Effective near-silence is the span from the earlier outgoing offset to the crop end, plus inserted zeros, plus the span from the incoming crop start to the earlier incoming onset, converted to **seconds**, and must be strictly below **280 ms**. Evidence: candidate `553dd9080f452f8a54ccff5cd5fea8d6937438ae`, `packages/transcription/src/whisper.ts`, **line 144**, passes `-vsd 300`. This is the 300 ms silence split, minus a 20 ms margin; `SETTLE_MS` is not used. Source 24 kHz and live-engine 16 kHz sample counts are never compared directly. Default effective join is 30+40+20 = 90 ms.

Placement and coverage assertions include all speech spans and their gaps, including the whole 170–245 s window, cross-track overlap and short-unit mix. The 130–170 wpm track check counts reference words over the sum of constructed acoustic utterance spans, including within-utterance joins but excluding between-utterance placement gaps. A prefix span is a phrase, not a claim of prefix-internal word timings. Annotations expose `reference_words` for lexical matching and `reference_spans` for known timing spans.

`verify-joined.py` is an **arithmetic/consistency check**, in code and output. It checks exact-zero inserted silence, exact join counts, partition/overlap arithmetic and SHA-256 of each copied cropped segment. Its window energy scan is same-method consistency, not independent acoustic ground truth. It writes `joined-verification.json` in a fresh derived-output folder and records the script version. The assembler runs the same checks and refuses annotations unless both tracks pass. Waveform spot-check, second-threshold spread and listen-through remain required. Annotations and verification outputs remain **UNFROZEN** until verification and owner checks pass; no automatic freeze is implemented.

Primary timing is `acoustic_end`, the final-word energy offset. `crop_end_bound` is the start of inserted silence after the cropped final word and is a secondary sensitivity bound only. It is never a detector endpoint. Exact joined sample indices, acoustic-end threshold spread, 5 ms resolution and uncertainty (offset spread plus 5 ms) are recorded. The retest score is not comparable with the original frozen 73/77 score. That score and rule remain unchanged.

Layer C caveat: at the same candidate, `livePcmEngine.ts` **line 11** sets `MAX_SPEECH_MS = 4000`; processing spans can be split. One reference utterance may generate several diagnostic trace events. Do not assume a one-to-one mapping or localize an ambiguous chain.

### Revision 2026-11-09: acoustic-end spread policy (owner-approved 2026-11-08)

The owner approved ChatGPT's Option B (CONDITIONAL review) as the source-validity rule. It replaces the earlier 25 ms hard limit on offsets and does not change either energy threshold. Rule text, verbatim:

> Measure every unit using the existing primary and secondary energy thresholds and 5 ms frames, without changing either threshold. Require onset spread <=25 ms and offset spread <=100 ms. Reject any unit with no active speech, a clipped boundary, invalid crop padding or a spread exceeding its applicable limit. Preserve both threshold-supported edges when cropping: begin 20 ms before the earliest onset and end 30 ms after the latest offset. For each final word, define the earliest plausible acoustic end as the earlier measured offset minus 5 ms, and the latest plausible acoustic end as the later measured offset plus 5 ms. Record both endpoints and their spread for every utterance. Layer A conservative latency uses the earliest acoustic end and the latest plausible visible-publication time. Layer A best-case latency uses the latest acoustic end and the earliest plausible visible-publication time. Apply these bounds to both the three-second median and six-second coverage tests. Preserve Protocol v3's PASS/FAIL/INCONCLUSIVE rules. Layer B uses the same bounds. No threshold adjustment, source replacement, selective endpoint choice or change to the frozen November 7 result is permitted.

The 100 ms is a maximum permitted ambiguity, not a claim that the endpoint is known to 100 ms. Waveform spot-check and listen-through remain required. Constructed-speech results do not supersede the historical 73/77 detector-end result. The joined-file checks remain arithmetic/consistency checks, not independent acoustic ground truth. Annotations record `earliest_acoustic_end_s`, `latest_acoustic_end_s`, their `_sample` counterparts, `acoustic_end_spread_s`, `final_onset_threshold_spread_s` and `crop_start_sample`; `crop_end_bound` is retained. `analyze-bounds.py` requires both ends per unit. Protocol v3 is not edited.

### Revision 2026-11-09: meeting-track pace (render r2, owner-approved 2026-11-08)

The first constructed render measured the meeting track at 118.14 wpm (rule: 130-170) and the microphone track at 131.75 wpm, a narrow pass. Cause: both tracks used our own `-15%` prosody slowdown, an unreviewed design choice; Protocol v3 asks only for "about 150 wpm". The owner approved one new render with the meeting track's slowdown removed. The microphone track keeps `-15%`. No exemption, rule change or long-only wpm check is authorized.

The rate now lives only in `speech-specs.ps1` (`rate='-15%'` for microphone, `rate='default'` for meeting). `render-constructed-units.ps1` passes it to `UnitRenderer.Render`, which wraps the text in `<prosody>` only when the rate is not `default`, and `units-manifest.json` records it per unit as `prosody_rate`. A test fails if `-15%` appears in `UnitRenderer.cs` or more than once in the specs. The legacy probe renderer `SpeechRenderer.cs` still carries its own diagnostic-only `-15%` and never feeds timing. Texts, voices, unit boundaries and the output format are unchanged. The new render goes to `renders-units-20261109-r2`; `renders-units-20261109` and derived-1 to derived-5 are retained as evidence.

Pre-flight projection (derived-5 meeting measurements x 0.85; speech engines need not scale linearly): meeting 138.9 wpm, shorts 0.387-0.837 s of speech, long units 7.15-7.58 s, and in-memory placement passes every assertion. This is a projection, not a result.

**Proposed A-026, confirmed agent design/test-planning mistake:** I applied a `-15%` slowdown to both tracks without review. It made the meeting track fail the pace rule (118.14 wpm) and the microphone track pass only narrowly (131.75 wpm), and the rate was stored in two places (`speech-specs.ps1` and `UnitRenderer.cs`). One extra owner render is needed. Earlier incidents are unchanged.

### Owner command after independent source review

Open **Start → Windows PowerShell → Open**, **Windows PowerShell 5.1, not Administrator**. The output folder must not exist. The command renders unit WAVs only; it does not run probes, measurement, assembly, verification, playback or recording.

```powershell
powershell.exe -NoProfile -File "C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest\prepare-speech.ps1" -Method ConstructedUnits -OutputDirectory "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109"
```

### Stop rule

render fails, a unit is clipped or acoustically invalid, more than 10% of a track's units are unclear or choppy in the listen-through, or any change to rendering or source content would be needed -> STOP, preserve everything, no rerender, no fallback to engine marks or scale factors, new owner approval needed. A measurement, assembly or verification CODE defect -> fix with synthetic tests and rerun offline on the same preserved unit WAVs, writing to a NEW derived-output folder, keeping the earlier failure outputs and recording the corrected script version; never loosen a measurement threshold to manufacture a pass.

### Incident updates (proposed, historical entries below retained)

A-019 closes as **engine marks unusable as a WAV timebase; cause not established; dropped**. This is a timing-harness outcome, not an application defect. A-013 through A-022 remain intact below.

**A-023:** The former C path would have cropped Zira word files at the incorrect 164 ms engine endpoint, truncating speech; validation caught this before concatenation, so no joined source was affected. It also displayed complete counts with an “Incomplete engine bookmarks” failure message. ConstructedUnits now bypasses that path entirely. Earlier output is preserved, not relabelled as an application failure.

**Proposed A-024:** The first source-only PowerShell spec checker grouped hashtables directly and falsely reported invalid prefix construction. Converting the records to PSCustomObject before grouping corrected the checker; all prefix/final spec assertions and C# compilations passed in Windows PowerShell 5.1. Both checker files are retained outside Git. A trailing blank line was caught and fixed before commit. A handoff helper initially used the Windows default text encoding and failed to read UTF-8 prose; explicit UTF-8 corrected that helper before it changed files. No render or evidence was affected.

### Preserved owner render: offline measurement stop

All 52 expected unit WAVs and sidecars matched the unit manifest, sample counts, hashes, renderer/script versions and 24 kHz mono PCM16 format. Original source duration including padding was 59.062 s (microphone) and 62.937 s (meeting). The first measurement invocation failed before WAV I/O because isolated embedded Python did not add the script directory to its import path. `derived-1/measurement-entrypoint-failure.json` preserves that attempt and its script hash. The three offline CLIs now explicitly resolve their sibling module; a regression invokes each with isolated Python and `--help`, without audio I/O. All 30 deterministic tests pass.

The permitted corrected attempt used **derived-2**, leaving originals and derived-1 untouched. It passed 19 microphone units, then stopped at `microphone-utt16-u0` ("Complete."): primary offset 0.635 s versus secondary offset 0.665 s, **30 ms spread**, exceeding the fixed 25 ms limit. Both onsets were 0.135 s. The remaining six microphone units and all 26 meeting units were not measured. No assembly or joined verification ran; annotations remain UNFROZEN. No threshold, rendering or source text was changed. The private diagnostic summary records corrected script hashes and the original manifest hash.

**Proposed A-025, confirmed agent CLI defect:** Direct measurement failed with `ModuleNotFoundError` because the embedded interpreter has isolated/safe-path mode enabled. Earlier unittest discovery inserted a path and missed this entry-point failure. Explicit sibling resolution plus isolated-CLI regression checks corrected it. No original WAV was modified and no synthesis rerun occurred. The later 30 ms source uncertainty is separately reported as a measurement rejection, not attributed to this import defect or to the application. Both attempts are retained.

Candidate: `553dd9080f452f8a54ccff5cd5fea8d6937438ae`.
Protocol: `docs/handoffs/SRCB_Windows_Gate3_Diagnostic_Retest_Protocol_v3_Reviewed.md`
at `6297862` on origin/main. The owner's November 8 assignment establishes approval despite the source's stale draft header.

This directory cannot start recording. It contains preparation tools only. Sources and raw output belong in a new private directory outside Git. Existing evidence must never be overwritten. No driver installation, routing change, retry, or acceptance run is implicit in running these tools.

- `prepare-speech.ps1 -Method ConstructedUnits` renders one plain-SSML WAV per unit with no marks or engine timing and writes `units-manifest.json`. It never plays audio or opens capture. Legacy probe modes are diagnostic-only and never feed timing.
- `assemble-sources.py` builds the 420-second WAVs, annotations and source audit from `units-manifest.json` and the measurements. Timing comes from constructed sample offsets plus measured unit energy, not recognition or engine marks. A waveform spot-check and listen-through remain mandatory before eligibility is frozen.
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
powershell.exe -NoProfile -File "C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest\prepare-speech.ps1" -OutputDirectory "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-probe-selected-20261108"
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

## Bookmark probe encodings (source-only revision)

The single owner command above probes first, then performs the full render in the same process only if an encoding passes for both voices. `-Probe` is available for an explicitly probe-only run into a different fresh directory. The probe has sixteen words per voice for each A/B/C encoding. All variants retain their diagnostics; expected and received counts and non-decreasing AudioPosition checks are reported in `probe-results.json`. `encoding-selection.json` records the preference decision. Each full `engine-marks.json` row records encoding and timing basis.

- **A:** Keep start/end marks, inserting a 30 ms SSML break between each end mark and the following start mark. Both counts and ordered, non-decreasing AudioPosition values must pass.
- **C:** Render each word as a separate synchronous SSML utterance with its own engine timeline. Require both marks, crop on their rounded 24000 Hz sample positions, and join with exactly 720 zero samples (30 ms). Aggregate boundaries are constructed sample offsets, explicitly distinguished from observed callbacks. Individual WAVs and timelines remain retained. This changes prosody and may change short/long durations; the source assertions and later waveform/listening audit can still reject it.
- **B:** Keep only start marks plus the last end mark. `bookmark-timing.py` searches the WAV in 5 ms RMS frames for each word's active energy, using threshold max(128 PCM16 amplitude, 3% of local peak RMS). It requires an inactive release frame before the search boundary; an unidentifiable release fails B. A next-word start only bounds the search and is never used as the word end. The derived endpoint has frame/threshold uncertainty and requires waveform spot-checking and listening before eligibility is frozen.

The assembler consumes the resulting per-word intervals, preserving explicit inter-word gaps in all encodings, and tests the entire 170–245 s window at word level. Any actual gap of 0.5 s or more in those reference intervals prevents assembly approval. No acoustic validation is claimed from these source-only tests. Energy thresholding and sample cropping still require owner review against the actual audio. No custom screen recorder or application code is changed.

### Additional evidence under A-019

The owner's instrumented run produced 17 of 32 marks across all 47 polls: s0–s15 and e15, with e0–e14 absent from the first poll through 5002 ms, no duplicates or unexpected names. All received callbacks arrived within about 15 ms during file synthesis. Wall-clock receipt times do not define audio boundaries; only AudioPosition is used for source timing. The SSML placed each missing end adjacent to the next start, separated only by whitespace. Adjacent-mark suppression is a strong but unproven hypothesis, not an application defect. A-019 remains open; A-013 through A-021 are unchanged. No failed synthesis was rerun by the agent.

### Proposed A-022 — inspection and patch tooling mistakes

At this task's start I read branch-local paths before checking that another operation had switched the checkout to main. Those reads failed without modification; I then verified the checkout and selected the requested PR74 branch. A later patch attempt used delete/add operations against the same path and was rejected before changing files; I replaced it with a source-file rewrite. These caused minor tool/context waste, no physical execution or evidence change. This entry is proposed, not entered in the agents register.

A syntax-check command also used an ambiguous shell selection and produced a C# assembly-reference error in the wrong runtime. A subsequent check used the explicit Windows PowerShell executable, asserted version 5, and compiled the class successfully without invoking any renderer. The initially piped multiline check had produced no confirmation output and was not accepted as verification. These verification mistakes are included under proposed A-022; none was a synthesis or application failure.
