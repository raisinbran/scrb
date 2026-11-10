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

### Revision 2026-11-09 (r3): calibrated meeting pace and in-window gap budget

Render r2 (meeting at `default`) measured the meeting track at 127.93 wpm, still under 130. The `-15%` rate had slowed Zira by only about 8% (118.14 to 127.93 wpm), not the 15% I assumed: the linear assumption was wrong. The owner approved one more render (`renders-units-20261109-r3`) with calibrated rates: **microphone `default`, meeting `+30%`** (the `+30%` rate was approved by the owner on 2026-11-08 after the pre-flight; the earlier `+20%` version failed the half-effect check at a projected 129.6 wpm), declared once in `speech-specs.ps1` and recorded per unit as `prosody_rate`. The earlier renders `renders-units-20261109` (`-15%` both tracks) and `-r2`, and every derived folder, are retained as evidence.

Projection formula, one for both tracks: `wpm_new = wpm_ref x (1 + 0.083 x delta_points / 15)`, with `delta_points` measured from the `-15%` reference and 0.083 the measured Zira speedup (127.93/118.14 - 1) per 15 points. Meeting (delta 45) is a two-point extrapolation (measured at -15% and default) and goes beyond the measured range; microphone (delta 15) is a cross-voice estimate from a single measured point. Durations scale by 1/(speedup factor) with fixed crop padding. Both 100% and 50% of the effect were evaluated by running the assembler's placement code in memory: microphone 142.5 / 137.2 wpm, meeting 147.2 / 132.7 wpm; shorts stay within 0.332-0.876 s of speech, long units 6.68-7.94 s, and every placement requirement holds in both scenarios. These are projections, not guarantees. The `+30%` rate is untested in the actual speech engine: only the application-side regex check (`^[+-]?[0-9]{1,3}%$`) has accepted it, and nothing has verified that the engine accepts the SSML `rate='+30%'` or produces the projected pace until the render is measured.

Placement defect fixed: the planned in-window gap budget (0.44 s) ignored the 20 ms and 30 ms crop padding, so a layout could reach a 0.5 s speech gap (found in the microphone 50% projection). The budget is now `min(0.44, 0.48 - largest lead - largest trail)`, keeping 20 ms margin. The 0.5 s assertion is unchanged and still checks the gap actually produced.

**A-026 addendum:** the linear `-15%` assumption was wrong (measured about 8%), which wasted the r2 render; the pre-flight also found the placement-padding defect above.

### Owner command after independent source review (current: render r3)

This is the one approved render attempt into `renders-units-20261109-r3`, which must not exist yet. The earlier folders `renders-units-20261109` (first render) and `renders-units-20261109-r2` are evidence; never target them. Open **Start → Windows PowerShell → Open**, **Windows PowerShell 5.1, not Administrator**. The output folder must not exist. The command renders unit WAVs only; it does not run probes, measurement, assembly, verification, playback or recording.

```powershell
powershell.exe -NoProfile -File "C:\Users\bchen\Documents\GitHub\scrb\scripts\gate3-retest\prepare-speech.ps1" -Method ConstructedUnits -OutputDirectory "C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\renders-units-20261109-r3"
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

**HISTORICAL — do not run.** This is the November 8 probe-selected command, kept as incident history. Open **Start → Windows PowerShell → Open**, not “Run as administrator.” In that normal **Windows PowerShell 5.1** window, run this once. It generates invented speech files without recording or playback. The new output folder preserves both earlier failed attempts.

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

## Hashing methods

Every digest in the draft manifest is a SHA-256 of content bytes, with the method, the full commit id and the file name recorded beside it. A Git object id is never put in a `sha256` field.

| Kind of file | Method | Recorded beside the digest |
| --- | --- | --- |
| Git-tracked text (docs, scripts, tests) | SHA-256 of the bytes printed by `git show COMMIT:path` at a pinned full commit id (LF as stored in Git) | method `git-show-blob-bytes`, `git_commit_id`, `path` |
| WAVs, unit sidecars, annotation JSON and other private files | SHA-256 of the raw file bytes (for example `Get-FileHash -Algorithm SHA256`) | method `raw-file-bytes`, file name |
| Digests carried from an earlier draft | method not recorded | method `carried_from_prior_draft`; recompute before freeze |

Files changed after the pinned commit must be re-pinned at the freeze commit.

## Playing the sources (D2 route)

`play-sources.ps1` (Windows PowerShell 5.1) plays the microphone WAV to `CABLE Input` only and the system WAV to the default eConsole render endpoint, which is the endpoint the app captures by loopback. It defaults to a dry run. See `docs/gates/gate-3-windows-d2-capture-equivalence-draft.md` section 7 for the guards. Real playback needs the owner's approval of the run length.
## Explicit Protocol v3a timing mode (offline analysis only)

`v3` remains the default for both CLIs. Select `--mode v3a` explicitly; a mode
label in input JSON does not select it. No evidence or annotation is frozen by
these commands. Outputs are created exclusively, as in v3.

```powershell
python scripts/gate3-retest/marker_clock.py TRACK/chunks.json REPORT.json --mode v3a --decoder C:/path/to/ffmpeg.exe --track microphone --harness LEAD TRAIL --harness-u LEAD_U TRAIL_U
python scripts/gate3-retest/analyze-bounds.py ADJUDICATED.json BOUNDS.json --mode v3a
```

For marker v3a, the positional input is the original per-track `chunks.json`,
not a previously padded/clipped WAV. The adapter reads `SEQUENCE`, `START_NS`
and `RATE` from each original OpusTags packet, cross-checks the complete chunk
index and its end timestamps, and decodes native mono PCM16 in memory. Supply an
existing offline ffmpeg executable explicitly. It never downloads tools, changes
capture, resamples, trims, pads the continuous view, or writes audio.

The sample-continuous view contains **every decoded sample in order**. The gap
map retains each chunk's embedded timestamp, actual decoded count, declared span,
unassigned gap and overlap. Ordered timestamp overlaps are finite evidence,
not missing records or negative gaps; their samples remain in the continuous
view. Duplicate/reordered timestamps or unknown count mismatches are INCONCLUSIVE.

`audited_decode_spans.json` contains one narrow compatibility allowance: the
preserved microphone chunk 32 has 47688 decoded samples against 47520 declared
samples (+168 samples, 3.5 ms at 48 kHz). It is bound to that exact source SHA-256,
track, sequence, native rate, metadata SHA-256 and both counts. A changed hash,
167/169-sample discrepancy or another recording does not inherit that allowance.
There is no generic numerical count or gap cutoff. The scalar original-v3
**timestamped legacy view** reproduces the prior audit's declared-end clipping
and last-chunk-wins overlap placement; only this legacy view clips. The continuous
view retains all 168 extra samples. Those timing facts and the allowance are
visible in the gap map, including cumulative overrun and unassigned gaps. Gaps
are computed against the union of declared windows; overlaps never subtract them.
Zero placeholders do not establish physical silence or speech absence.

The report retains `sample_continuous`, `original_timestamped` (the unchanged
original 100 ms check/affine fit, including its INCONCLUSIVE result), and `gap_map`.
The v3a check keeps the 100 ms limit and anchor uncertainty, without an affine
clock correction. Unknown invalid evidence still blocks acceptance; the original
legacy marker result is retained when reconstructable.

The bounds input retains the original `frozen`, `units`, identity/adjudication
and publication fields. v3a source speech endpoints are explicit:
`source_start_s`, `source_last_word_start_s`, `source_last_word_end_s`. Each unit
uses the offset and uncertainty measured at the nearest preceding long anchor
(in source order, using its source utterance start). A long unit can use its own
measured anchor. The resulting continuous placements are recorded as
`continuous_*`, with `timing_anchor_id`, `timing_anchor_offset_s` and
`timing_anchor_uncertainty_s` for audit.

For earlier v3a JSON, `continuous_start_s`, `continuous_last_word_start_s`, and
`continuous_last_word_end_s` are accepted as a **fixed reference schedule**, not
already corrected local placements: subtract `reference_schedule_offset_s`
(default first long anchor offset) to recover source times, then use the local
preceding anchor. The output labels this legacy basis explicitly. Prefer the new
source fields to avoid ambiguity. A source unit before the first long anchor is
unbounded, stays in the denominator and cannot borrow a future anchor or receive
setup credit. No short-word matching occurs.

The speech end interval uses the locally placed continuous end and cumulative
unassigned gaps, with measured anchor uncertainty on both sides. Significant
unlogged offset changes add symmetric uncertainty **only inside their unresolved
bracket**; a crossing suffix after the before-anchor support remains bounded by
that bracket. The new measured offset persists for every later unit. Endpoint uncertainty
remains symmetric in the right anchor's unexamined prefix until measured support
begins, even if that prefix belongs to the anchor utterance itself. Speech end,
last-word start and utterance onset have separate bracket uncertainty. After
measured support, extra step widening stops; the persistent offset and measured
anchor uncertainty do not stop. Gap lookup encloses the entire endpoint uncertainty
interval so a nominal point just before a gap cannot hide a later speech start. No recording samples or native
clock are corrected. The pre-speech guard uses the last-word-start interval.

Publications must already be independently mapped into timestamped capture
seconds. Observer-to-scorer integration is **not implemented**; existing v3
`map_publications` remains v3-only. Full latency acceptance also requires frozen
source identity/eligibility and independently adjudicated publication endpoints.

Every credited endpoint must carry its `publication_id` and match the converted file `publication_file`
(produced by `observer_session_map.py`) by id, observed time and u (1e-9 s tolerance); the file's conversion
identity must match the track's clock context, the observer raw header and the harness log. A mismatched,
missing or stale endpoint leaves that unit uncredited in the denominator; a mismatched document makes the
track INCONCLUSIVE. The scorer also regenerates the converted file from `observer_raw` with the same code (default
labels, the file's own origin, frequency and allowance) and requires it to equal the supplied file, and it requires
a conversion allowance of at least 0.002 s (larger documented values stay valid). The output records the SHA-256 of the raw observer file, harness log and converted file.
The 2 ms conversion allowance is a conservative numerical allowance for converting between two QPC-based clocks
(Stopwatch ticks and capture timestamps); it is not measured device timestamp accuracy and not a bound on
playback or capture delay.

**Harness markers are derived, not typed (D3).** The scorer derives both marker times from the harness log (QPC frequency and the ticks before and after `waveOutRestart`, midpoint) plus the lead and trail marker offsets detected in the frozen source WAV (`harness_provenance.py`). The supplied `harness` must equal them (1e-9 s) and `harness_u` must be at least half the bracket width plus the detector step; otherwise the track is INCONCLUSIVE. On the practice log this reproduces 6788.7203898 and 7168.7203898 exactly. The log brackets the call to `waveOutRestart`, not the moment sound left the device: the unmeasured output-start latency of the route remains a limitation.

Add a `v3a_evidence` object with a separate entry for each track:

```json
{
  "publication_basis": "timestamped-capture",
  "chunks": "C:/evidence/microphone/chunks.json",
  "decoder": "C:/tools/ffmpeg.exe",
  "harness": [101.0, 481.0],
  "harness_u": [0.001, 0.001],
  "publication_file": "C:/evidence/microphone/converted-publications.json",
  "observer_raw": "C:/evidence/observer.jsonl",
  "harness_log": "C:/evidence/harness.jsonl",
  "source": "C:/evidence/source-native-mono.wav",
  "source_annotations": "C:/evidence/source-annotations.json",
  "long_anchors": [
    {"id": "long-001"}
  ]
}
```

Paths are explicit filesystem paths (prefer absolute). Source annotations bind
`frozen: true`, `sample_rate`, `source_sha256` and the complete ordered
`utterances` inventory. Each utterance has `id`, Boolean `short`,
`source_start_sample`, `source_end_sample`, and Boolean `eligible`. Searches must include **every**
non-short utterance in that order. A missing immediate long neighbor, absent brackets, or unsupported match prevents
acceptance. Native source and recording rates may differ for bounded correlation;
each RMS envelope uses its own native samples on the shared time grid.
No short-word matching occurs.

**The v3a default matcher is now bounded long-utterance correlation.** It reuses
the predeclared interior-audit criteria unchanged: +/-1 s search, 2 ms grid,
10 ms log RMS / 20 ms log RMS / 10 ms linear RMS; each method needs NCC >=0.80,
a margin >=0.10 over a secondary local peak >=100 ms away, and a nonboundary
winner. These existing analysis quality criteria are now the explicitly requested
v3a anchor guard, not new Layer A latency targets. No new numeric threshold is
introduced. The original v3 marker/default path is unchanged.

Only annotated long utterances are searched. A source-only 3 s template begins
100 ms inside each declared source span, using the interior audit's >=3.3 s
passage guard. No recording score chooses that support. Edge supports bind by ID
to their full unit's locally placed source interval for coverage; the entire
measured support plus/minus uncertainty must fit. Coverage never changes the
measured supports used for step localization. Missing or inconsistent edge timing
stays INCONCLUSIVE.
The output retains both
the full source utterance span and the narrower matched forward-frame support;
matching part of a long utterance does not certify its unexamined remainder or
remove a crossing unit. Every long ID remains required in source order. Source
and recording envelope grids use their own native samples; neither PCM array is
resampled, trimmed or rate-warped. A constant search offset is not a correction.

Uncertainty is exactly the interior audit's maximum contiguous near-top extent
(within 0.01 NCC), plus cross-method displacement, 10 ms half-frame, 1 ms half-grid,
and one sample at each native rate. This is a method-sensitivity radius, not a
calibrated statistical confidence interval or a guarantee against unknown route
bias. All methods must meet uniqueness; ambiguous, weak, flat, boundary or
unbounded anchors make track timing INCONCLUSIVE. Step significance is tested
against **combined measured anchor uncertainty**, as before.

The bounds evidence may specify `long_matcher: "bounded-correlation"` (the v3a
default) and `step_search_offset_s` (optional: otherwise continuous lead marker
minus the protocol's 1 s source lead). Each `long_anchors` entry can now contain
only its source `id`; its expected template position is source span start +100 ms
+ that constant offset. Alternatively supply `expected_recording_s` explicitly
for that template; the search is still exactly +/-1 s. The earlier `exact`
matcher remains available explicitly with `long_matcher: "exact"`, equal native
rates and the original sample search bounds. Scoring still requires independent
frozen identity/eligibility, validated gap/marker evidence and all other v3a
preconditions. Diagnostic matching does not freeze any annotation.

Adjacent validated long-template supports bound any offset change exceeding their
combined uncertainty. Magnitude plus that uncertainty widens both sides of units
in the unresolved bracket. After the next anchor, the local measured offset
persists with its own uncertainty; it must not revert to the source schedule.
`test_next_anchor_limits_widening` now asserts both facts. The signed 80 ms
counterexample verifies that 5.98 s against an obsolete endpoint can really be
6.06 s after a negative shift and cannot receive timely credit. Layer A retains
conservative earliest-end / best latest-end pairing. Unsupported timing is
INCONCLUSIVE, and a publication overlapping last-word-start uncertainty cannot
receive pre-speech credit.

Gaps do not change eligibility, outcomes or denominator. Every scored unit ID and
eligibility must exactly reconcile with the bound complete frozen source inventory.
Omission, duplication or an eligibility mismatch makes the track INCONCLUSIVE;
a claimed ineligibility label cannot remove a crossing unit. `SETUP-AFFECTED` additionally requires
`independent_harness_failure` with `independently_confirmed: true`, `path` and
matching `sha256`; gap evidence alone grants none. There is no numerical gap
cutoff. These declared independent adjudications remain review obligations;
the scorer does not infer semantic identity or harness failure from silence.


### Retained practice regression and step diagnostic

`test_long_correlation.py` uses `practice_step_fixture.json` to pin the external
invented practice source WAVs, source annotations, continuous recording WAVs and
lead-marker reports by SHA-256. Set `SCRB_V3A_PRACTICE_ROOT` to the preserved
`gate3-v3-preflight-20261108` directory. The sibling evidence location is the local
default. Missing files produce an explicit skip reason; present hash mismatches
fail. Audio, original evidence and generated reports remain outside Git. The test
uses only the original lead marker as a constant search offset; it does not use
any affine slope/offset or stored step result as detector input.

The practice replay scans every long unit: 45 meeting anchors yield no detected
continuous-view step; 39 microphone anchors yield one +78 ms change between
`microphone-019` and `microphone-021`, magnitude interval +51.875 to +104.125 ms,
location interval 138.3619375 to146.4530625 s (including 141.7 s). These are template
support bounds, not an exact step sample or a causal capture diagnosis. A hidden
change/reversal between anchors or a change within combined uncertainty is not
ruled out. Synthetic voiced/noisy tests inject +/-80 ms with gain/noise changes,
check both uncertainty directions, and reject ambiguous repeats and wrong windows.

For a standalone identity-bound diagnostic, `detect-v3a-steps.py` accepts an
explicit preserved **sample-continuous** mono PCM16 WAV and writes a new JSON:

```powershell
python scripts/gate3-retest/detect-v3a-steps.py CONTINUOUS.wav STEPS.json --source SOURCE.wav --annotations SOURCE-ANNOTATIONS.json --recording-sha256 RECORDING_HASH --source-sha256 SOURCE_HASH --annotations-sha256 ANNOTATION_HASH --search-offset OFFSET_SECONDS
```

Output includes every anchor's three-method uniqueness evidence/uncertainty,
step magnitude and location intervals, bracketing IDs and symmetric widening.
It exits 2 on unsupported/ambiguous timing. A BOUNDED diagnostic is **not** a track
latency PASS or an exemption: the bounds scorer continues to reject invalid gap
maps, failed markers and unsupported speech/publication evidence, while retaining
step diagnostics when available. The known microphone count/span difference is separately covered by its
hash-bound audited allowance; detecting a step grants no count/identity exemption. The original timestamped marker result
remains in the marker/bounds reports.


### Clock metadata for later observer integration

v3a clock reports and gap maps carry `clock_context` (schema 1); the outer v3a
report is schema 2. It contains `session_id`, integer `session_origin_ns`,
`origin_status`, `origin_method`, `origin_evidence_chunks`, `qpc_basis` and
`track_identity`. The origin is reconstructed as device stamp minus embedded
start, only when constant across every chunk in one session. It is explicitly
not a retained start-ACK observation and is distinct from acoustic marker offsets.
Missing or inconsistent origin evidence is null with an unavailable status.

The QPC basis states capture monotonic nanoseconds and 10^9 ns/s. Raw QPC and
observer tick frequencies are null because chunks do not supply them; no value
is invented. Observer clock/binding and observer-to-scorer integration remain
unimplemented. No publication timestamp conversion is added.

Track identity binds session, track, chunk-index hash and ordered source hashes.
Each derived view also carries a separately labeled mono PCM16LE hash, sample
count/rate, view kind and track-identity hash. A PCM digest is never labeled a
WAV-file digest. The same clock context accompanies both marker checks and the
gap map so a later bridge can bind its input explicitly.

`test_v3a_conditional.py` pins original microphone metadata, all 139 encoded chunks,
decoder and harness-context hashes. It invokes the real v3a marker CLI, confirms
a valid clock/map with the 168-sample allowance, compares decoded PCM identity to
the retained untrimmed continuous WAV, then runs long matching and local timing
preparation. All 64 units having a preceding long anchor prepare successfully.
The initial short `microphone-000` has none: it remains explicitly unsupported
and in the full 65-unit denominator. Thus no count-caused INCONCLUSIVE remains,
but full-track latency acceptance is not claimed. Original annotations stay
unfrozen, original timestamped markers remain INCONCLUSIVE, and observer
integration/actual latency scoring have not been performed.
