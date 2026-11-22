# M1 B0 — installed-release same-recording acceptance scorecard

**Status:** DRAFT FOR OWNER APPROVAL — NO ACCEPTANCE RECORDING AUTHORIZED.
**Controlling plan:** `dev-plan/m1-installed-delivery-and-acceptance-20261118.md` v2.2.
**Engineering baseline at preparation:** `c6de7bc5cc284d4694678b43d3668905a7305684`.
**FINAL_RC_SHA:** **NOT SELECTED**. No source or device work is approved merely by this checklist.

This is a reproducible scoring proposal, not new installed-app evidence. Milestone B starts
only after Milestone A has verified each installed package, normal-host isolation,
backup/rollback and both non-silent tracks; the owner has approved all B0 methods,
numbers, routing, voices, and the exact host task budget. The Mac and BCHEN-W10 may
proceed independently when ready. REGIURN remains unavailable; do not schedule it.

## 1. B0 scenario and reference script

Use the **same 30 phrases, order and scoring procedure** on every available installed
platform. "You" is one person speaking into the **actual selected local microphone**.
"Remote A" and "Remote B" are **two distinct identifiable human voices** arriving
through the selected meeting-audio source, not two arbitrary labels applied to
one person's recording. Each person speaks ten preassigned, clean non-overlapping
turns. The two remote voices may be live or a permitted public/invented known-voice
fixture played through the actual meeting source. Record source, permission,
routing and reference identity. Do not use private third-party meeting audio.

Speaker order in each round is fixed by the Order column; leave enough clear silence
to delimit turns, without speaking the role codes or labels. Use the phrases exactly
as printed so an independent scorer can identify missing, extra and misattributed
turns. Do not repair an error in the stimulus after seeing its transcript.

| Round | Speaking order | You (Y) | Remote A (A) | Remote B (B) |
| --- | --- | --- | --- | --- |
| 1 | Y, A, B | A copper lantern marks the quiet doorway. | The blue bicycle stopped beside the bakery. | Seven smooth pebbles lie along the river. |
| 2 | B, Y, A | Morning sunlight crossed the wooden table. | A small violet kite floated above the park. | The garden clock chimed shortly after noon. |
| 3 | A, B, Y | Fresh orange slices filled the ceramic bowl. | The old bridge spans a narrow mountain creek. | Three paper folders rested under the monitor. |
| 4 | Y, B, A | A green umbrella leaned against the fence. | The distant ferry crossed the silver harbor. | Two bright candles stood near the window. |
| 5 | B, A, Y | The quiet hallway smelled of fresh paint. | A red suitcase rolled across the station. | The white teapot cooled beside the stove. |
| 6 | A, Y, B | A black notebook contained twelve simple sketches. | The tall lighthouse faced the eastern shore. | Five yellow leaves settled on the steps. |
| 7 | Y, A, B | The marble counter reflected the afternoon sky. | A narrow footpath circled the vegetable garden. | The museum doors closed before the rain. |
| 8 | B, Y, A | The brown parcel waited behind the front desk. | A striped scarf hung beside the winter coats. | The bakery window displayed round honey cakes. |
| 9 | A, B, Y | A little brass bell rang at the entrance. | The empty bus paused under the streetlight. | A silver camera sat inside the backpack. |
| 10 | B, A, Y | A paper map covered the kitchen island. | The wooden canoe rested along the beach. | Four clean glasses stood upon the shelf. |

For each executed turn, the local evidence records: round/turn ID (Y01–Y10,
A01–A10, B01–B10), source start/end timestamps, first visible live text time,
live words and provisional ID, final words and final ID, and coverage/confusion
notes. **Do not invent timestamps in this repository.**

## 2. Preconditions — hard stop gates

1. Pin the **one** `FINAL_RC_SHA` selected only after applicable packaging and
   security fixes merge with completed exact-head CI, independent formal review,
   and separate owner merge permission. App version alone is insufficient.
2. Verify that the installed Mac and Windows artifacts each independently trace
   to this source SHA; retain *different* platform package and binary hashes.
   See `docs/packaging/m1-common-rc-preparation-20261121.md`.
3. On the host, verify actual normal GUI launch (not development Electron or
   a restricted Codex GUI), an isolated disposable library/user-data profile,
   no production-library access, correct installed helper/model hashes,
   retained owner data, and a verified rollback. For Mac, do not replace
   `/Applications/Scribe.app` before safe idle and disposable restore PASS.
4. Document actual mic/output/meeting device, sample rates, gain, OS build,
   speaker routing, permission for test media and a low-bleed arrangement.
   **Windows whole-computer loopback** may be the declared baseline, but must
   not be called tested process-target Teams capture. Confirm both remote
   voices actually enter the meeting track.
5. Record a shared monotonic timebase and two known physical/source timing
   marks near the beginning and end. If the sources cannot be aligned
   independently, timing is **NOT VERIFIED**.
6. **Obtain B0 owner approval in advance** for thresholds, scoring denominator,
   fixed-latency treatment, reference script, routing and the execution budget.
   Obtain separate task-specific approval for every newly planned test
   exceeding **20 minutes total**, including setup, capture, final pass,
   verification and cleanup. No prior private-audio authorization carries over.

## 3. Numerical limits — proposals, NOT APPROVED

| Metric | Proposed threshold | Scoring method and invalid evidence |
| --- | --- | --- |
| Two saved tracks | Distinct independently decoded non-silent mic/meeting signal; all 10 Y turns on mic and 20 remote turns on meeting; no clipped/missing scripted turn | Inspect original chunks, timestamps and reference signals. Mic bleed into meeting or remote bleed into mic must be reported; severe bleed makes attribution **NOT VERIFIED**, not a model pass. |
| Absolute alignment | **≤250 ms** | Compare timestamped start/end common sync markers on source and sealed tracks. Proposed: no undisclosed post-result latency offset; record any predeclared fixed-device calibration separately for owner approval. If no common reference, **NOT VERIFIED**. |
| Relative drift | **≤50 ms** start-to-end | Compute difference between start and end inter-track offset using both markers; report sign, resolution and uncertainty. |
| Saved-audio continuity | **No unexplained continuous gap >100 ms** | Use sample/manifest continuity and declared pauses; silence is not automatically a gap. No lost/clipped scripted turn even when gap size is smaller. |
| Live latency | **Median ≤3.0 s; ≥95% ≤6.0 s** | Measure from end of each of the 30 known spoken turns to first visible corresponding *live* text, on one monotonic clock. Proposed strict denominator: all 30 turns, with missing live text counted as not within 6 s and separately counted as missing; report median, p95, n and exclusions. This per-turn method needs explicit owner approval because earlier repository evidence also uses segment/covered-window denominators. |
| Live remote grouping | **≥8/10 correct turns for each remote voice** | Freeze one global one-to-one mapping of generated IDs to the three ground-truth voices for the whole recording. A correct turn requires recognizable phrase plus correct live remote label; omitted/unknown/extras count as errors, and a label first introduced in final pass cannot rescue live scoring. |
| Final speaker attribution | **≥9/10 correct turns per voice** (Y, A and B) | Recognizable final phrase under correct mapped identity, global mapping unchanged from the scoring procedure. Three distinct identities required; Remote A/B cannot collapse into one. All 30 turns must remain recognizable, with no fabricated scripted turns. Log speaker confusion and word omission/extra counts, not only percentages. |
| Audible seek | **Absolute seek error ≤500 ms at each of three predeclared targets** | Choose a timestamped early, middle and late word across the recording; click the actual transcript word. Compare audible source/reference onset to requested saved time, verify actual voice/phrase and record measured offset. A moving seek indicator alone is not enough. |
| Complete clipboard | **Full equality with saved final transcript**, subject only to line-ending and trailing-space normalization defined below | Use the real Copy entire transcript control; read OS clipboard, including all speaker sections and offscreen virtualized rows. Compare to independently serialized saved final text, not the toast or only mounted UI rows. |

**Clipboard normalization proposed for approval:** convert CRLF/CR to LF and remove
trailing spaces or tabs from each line; do **not** ignore missing or extra words,
speaker headings, section breaks, repetitions, or punctuation. If the 30-turn
meeting does not exercise offscreen virtualized rows, the copy cell remains
**NOT VERIFIED** until the owner approves a same-recording way to exercise them;
do not silently substitute a mock or claim virtualized coverage.

**Missing data is never a PASS.** Only valid, clean, reference-aligned nonoverlapped
turns are eligible for voice attribution; if a stimulus becomes invalid, retain
original evidence, mark the affected cell NOT VERIFIED with reason, and request
a narrowly scoped follow-up. Do not drop poor model results from the denominator
because they are inconvenient.

## 4. One-installed-recording procedure (per available machine)

1. Capture exact source SHA, artifact hash, runtime/tool/model manifest digests,
   actual selected hardware and routing, isolated library identity, test budget
   and all prerequisite approval IDs before starting.
2. Record one installed-app meeting with two shared reference timing markers and
   the 30 turns above. Verify real physical mic activity and actual remote
   playback entering the meeting source; keep original sealed audio intact.
3. During this **same recording**, record live text appearance and provisional
   remote-speaker grouping with timestamped observations. No post-hoc editing
   of live output used for scoring.
4. Stop normally; wait for actual final processing to finish (inside authorized
   budget). Save the complete unedited final transcript and independently score
   30/30 reference turns with a single frozen global speaker-ID mapping.
5. Select the predeclared beginning/middle/end word seek targets, click each
   in the finished transcript, listen and measure audible timing error.
6. Use Copy entire transcript. Compare clipboard text with the **entire saved
   final transcript**, including speaker sections and offscreen rows. Record
   equality and first mismatch position, without publishing private content.
7. Preserve the evidence and record all five PASS / FAIL / NOT VERIFIED
   verdicts. Never replace a failure with a new "clean" test run without
   explaining the defect, selecting the affected cells and obtaining any
   required new duration permission.

## 5. Restart persistence — separate, mandatory

After preserving the same meeting's evidence, fully quit/relaunch normally
under the **same isolated installed profile** and reopen the same recording.
Verify (a) sealed mic and meeting audio hashes/chunk access, (b) entire saved
transcript, (c) labels and one recorded reversible correction if performed,
and (d) audible seek to the same word/timestamp. Record each as PASS/FAIL/
NOT VERIFIED independently of the 15 feature cells. No source or library
reset, uninstall or data cleanup during this test.

## 6. Installed M1 matrix — do not prefill from old builds

| Five functions on the **same** installed recording | Mac M5 | BCHEN-W10 | REGIURN |
| --- | --- | --- | --- |
| 1. Separate, non-silent, aligned saved microphone/meeting tracks | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 2. Live remote-speaker grouping (two distinct remote voices) | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 3. Final correctly attributed three-voice transcript | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 4. Measured audible click-to-seek | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |
| 5. Complete saved-transcript clipboard equality | NOT VERIFIED | NOT VERIFIED | NOT VERIFIED |

**Interim: 0/10 verified on M5 + BCHEN-W10. Overall: 0/15.**
REGIURN is unavailable and receives **no** task. Passing both available
machines would produce at most **10/15**, never an M1 certification.
Old-source, synthetic, PR-CI or research evidence does not populate these cells.

For each cell, append a local evidence record with:
`host | FINAL_RC_SHA | package SHA-256 | installed app SHA | run ID |
five-function number | PASS/FAIL/NOT VERIFIED | measured values |
reference/diagnostic evidence file identity | reviewer/owner disposition`.
Keep raw audio/transcript and actual identities **off GitHub**. Report only
non-identifying aggregates and source/binary digest facts here.

## 7. Test authorization / stop rules

- **B0 approval:** Required **before any three-voice acceptance recording**.
  Numerical limits and denominator/calibration choices are not yet approved.
- **Hosted Windows producer/consumer:** Public plaintext unsigned installer
  artifact transfer is **prohibited** by the later owner decision. Current
  `main` retains the **legacy** plaintext-capable guarded workflow: **DO NOT
  DISPATCH**. Draft PR #420 implements encrypted ciphertext-only transfer with
  source/synthetic CI and scoped independent review, but remains **unmerged and
  operationally blocked** on enforceable workflow protections, protected
  main-only Environment, recipient/identity provisioning and a separate real
  installed-app readiness check. Issue #419 proposes a separately reviewed,
  lower-assurance same-runner/no-upload fallback if the protected two-job
  route is infeasible; it is also **not approved or implemented**. Obtain
  explicit owner approval of the selected reviewed approach and each long
  run. Hosted job caps of 105 + 20 minutes exclude scheduling overhead.
- **Mac safe install:** The current app's safe-idle state and current backup/
  rollback identity are not yet verified. Do not swap production apps.
- **Per-host acceptance:** Supply an actual estimated end-to-end budget
  (setup + capture + processing + verification + persistence + cleanup)
  and obtain specific owner permission if >20 minutes. No blanket approval.
- **Failure:** Stop destructive or repeated activity, retain original traces,
  run only short causal diagnostics with the minimum affected source path.
  Historical E14 root cause is UNKNOWN; PR #411's synthetic tests are
  already merged. No E14 re-inference without a concrete new reproduction.

Milestone B can be certified only by the owner after **15/15** final-RC cells
and separate persistence PASS. The separate V1/Gate 8 requirements remain.
