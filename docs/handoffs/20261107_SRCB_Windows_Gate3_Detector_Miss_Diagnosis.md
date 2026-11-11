# SRCB Windows Gate 3 — Scoped six-second misses and read-only causal audit

**Date:** 2026-11-07  
**Tested application:** PR #42, frozen revision `2d1f8150cb68d56ec3fc842f1709f276f124ef55`  
**Assignment:** `W-G3-2TRACK-20261107`  
**Evidence:** Owner-provided `gate3-two-track-20261107.zip`, especially `session-02/` and `adjudication/`  
**Work performed:** Offline reading, aggregation, and code-path inspection only; no recording, model execution, launch, tests, production edit, repository write, or merge.

## Decision and boundaries

**System track: FAIL under the originally frozen detector-end scoring rule.** Four of 77 original system candidates have independently supported speech and no *newly rendered system-track word* within the six-second window based on the detector unit endpoint (plus generous calibration/boundary tolerance). Even giving every other candidate the benefit of the doubt, the maximum possible on-time percentage is **73/77 = 94.805%**, below the 95% target. This is a **scoped result under that measurement rule**, not a fully independently reproduced final Gate 3 verdict.

**Acoustic-word-end sensitivity: NOT PROVEN.** Extending candidate endpoints to the full end of each overlapping, human-annotated word reduces the defensible no-timely-DOM count to **three**. The optimistic upper bound becomes **74/77 = 96.104%**; this is **not a measured PASS**. Because the endpoint extension was evaluated after initial results, retain both versions transparently. The disputed fourth unit spans 191.230–191.610 s, cutting into an annotated word that ends at 192.650 s. A new system word appeared at 198.496 s: about 6.886 s after detector end but 5.846 s after acoustic word end. The identity of that newly displayed word is not proven to match the disputed utterance.

The system track's full median, microphone full eligibility/coverage, and overall Windows Gate 3 remain **NOT PROVEN / NOT APPROVED**. This report does not choose a post hoc endpoint definition to engineer an outcome. The project owner should specify the endpoint policy prospectively for future acceptance work.

## Four-window read-only audit

All times are seconds relative to the native recording origin. The first new system-render time is an **optimistic possible response**, not a verified lexical match to that candidate. `Mic words in window` indicates first-rendered microphone words during the extended-annotation optimistic window, except for the endpoint-sensitive row, which uses the frozen detector window.

| System candidate | Original detector end | Human full-word end | First subsequent newly rendered system word | Mic words rendered in relevant window | Detector-end verdict | Human-end qualification |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `meeting-48-152290` | 153.470 | 153.770 | 161.453 | 16 | >6 s, confirmed | >6 s, confirmed; optimistic lower bound 7.683 s |
| `meeting-57-191230` | 191.610 | 192.650 | 198.496 | 8 | >6 s, detector-defined | Endpoint-sensitive; possible 5.846 s, not independently matched |
| `meeting-60-203200` | 206.460 | 206.920 | 217.747 | 6 | >6 s, confirmed | >6 s, confirmed; optimistic lower bound 10.827 s |
| `meeting-61-206850` | 208.960 | 208.960 | 217.747 | 10 | >6 s, confirmed | >6 s, confirmed; optimistic lower bound 8.787 s |

**Renderer / bridge evidence:** During each original frozen six-second window, the renderer observed **zero newly displayed system words** but continued to display microphone words. There were `transcriptChanged` events for the microphone, and **no system-track `transcriptChanged` segment publication** within those windows. This argues against a total renderer freeze. It does not prove that missing speech was permanently absent, or that no result was ever produced upstream.

**Saved speech evidence:** `session-02/live-latest.json` contains **zero meeting live-transcript words timestamped within ±1 s** of each disputed candidate. `session-02/final-transcript.json` contains meeting final-pass words overlapping those same regions. These findings support a live-path output deficit, not absent recorded source speech. Live output can have inaccurate word timestamps; hence the saved-transcript check is corroborative, not by itself a definitive ASR omission count.

**Capture / skip evidence:** All 124 archived audio chunks decode. The native meeting manifest's three `possiblyMissing` gaps are near 0 s and ~61 s, not near 152–209 s. The preserved live-worker `skipped` events have **no meeting-track interval overlapping any of the four candidate units**. Last cumulative production frame counters were 3 input-lost positions per track, zero rejected and zero overflow frames; these aggregate counters lack per-frame attribution. This excludes *recorded* skip/overflow events at the disputed timestamps, not all possible missing input or unlogged VAD skips.

**Worker health:** Worker did not restart; the app completed final processing. The four per-minute combined queue samples were `0 / 1 / 0 / 0`. Per-minute maximum backlog was approximately `5.62 / 5.21 / 5.52 / 5.23 s`, without a monotonic increase. The system-track `vadEmpty` counts were `38 / 45 / 49 / 46`, `modelCalls` `14 / 14 / 11 / 9`, and `modelEmpty` `1 / 0 / 1 / 1` over the four windows. These are **minute aggregates**, not identified with the four missed source units. The near-six-second backlog maxima and late clustering are diagnostic leads, not proof of a capacity regression.

## Causal classification

| Stage / hypothesis | Evidence-based finding |
| --- | --- |
| Saved source audio absent at the four windows | **Not supported**: audio chunks present, no relevant native gap, independently aligned public system source and final recognized words |
| Complete UI/render process stall | **Unlikely**: microphone words and microphone transcript events continued |
| Live queue overflow / explicitly reported worker skip at those units | **Not supported by retained logs**: zero overflow and no temporally overlapping skip report |
| Input to live VAD for each specific unit | **Unresolved**: no frame-to-VAD unit trace |
| VAD span accepted/rejected for each unit | **Unresolved**: aggregate VAD counters only |
| Recognition model received audio / returned words for each unit | **Unresolved**: aggregate model counters and empty outcomes only |
| Sink persisted a particular system segment / emitted it | **No corresponding system output observed**, but no per-segment pre-sink/sink trace to distinguish upstream nonproduction from a dropped result |
| A particular production defect or safe fix | **NOT ESTABLISHED**; no production modification warranted by this dataset alone |

The most informative recorded boundary is **before a visible/persisted system transcript change**. Existing evidence does not isolate the defect to VAD, the ASR model, live-worker delivery, or the transcript sink. Do not claim a root cause or start broad optimization from minute-level aggregate statistics.

## Constraints on independent reproduction

The supplied ZIP includes derived alignment results, code, frozen adjudication JSON, hash references, renderer observations, and the saved session. It does **not** contain the external public AMI WAV and source word-annotation XMLs used by the original adjudicator. Consequently, I verified the internal data and timing relationships, **not** an independent replay of waveform-to-human-word alignment. `74/77` system source units were reported strongly aligned by the source-adjudication artifacts; three remained source-unresolved. Do not invent independent reproducibility or claim a full coverage PASS.

The source audio for the *microphone* was a separate owner's phone recording. It has no independent human word-timed reference in the archive. Do not use final ASR or the production worker's VAD as independent ground truth for missing speech, and do not require the owner to narrate another multi-minute test.

## One next action; no automatic retry

**Close this diagnostic cycle as `SCOPED FAIL under frozen detector-end / sensitivity NOT PROVEN under human-end; root cause unresolved`.** Submit this sanitized analysis to an independent reviewer for policy and evidence classification before making a formal Windows Gate 3 decision. No additional manual microphone annotation, existing-audio inference, new recording or production fix is justified solely by the four disputed windows.

If the owner later authorizes another engineering task, the smallest potentially useful change is **limited, privacy-safe diagnostic instrumentation**, preferably on a separate reviewable branch: per-track audio-window identifiers through VAD decision, model call and zero/nonzero output, worker segment emission, sink append/replace, and `transcriptChanged` publication, with timestamp correlation and bounded logging. Do not log actual speech or confidential recordings. First show that this instrumentation can attribute a missing unit in synthetic/offline tests; run CI before independent review. Do not make this change as part of the current read-only assignment.

If another physical acceptance test eventually becomes necessary, use independently timed prerecorded speech for **both** tracks, with the phone playing into the microphone, not owner narration; freeze the endpoint policy and eligible denominator **before** observing latency. Obtain explicit owner authorization for any repeat and for any test planned to exceed 20 minutes, including expected final-pass processing.

## Evidence inventory for reviewer

- `adjudication/dom-adjudication-vad-end.json`: 4 frozen detector-end misses; optimistic `73/77` bound
- `adjudication/dom-adjudication.json`: 3 extended human-word-end misses; optimistic `74/77` bound
- `adjudication/proof-audit.json`: four suspect source-word overlaps and broad DOM windows
- `adjudication/system-source-adjudication.json`: human annotation/source-window alignment classification
- `session-02/renderer.json`: first visible DOM words and `transcriptChanged` events
- `session-02/live-latest.json` and `session-02/final-transcript.json`: live/final persistence near the windows
- `session-02/worker-events.json`, `session-02/measurements.json`, `session-02/integrity.json`: lag/skip and native audio evidence
- `runtime/packages/transcription/src/livePcmEngine.ts`, `liveAudioWorker.ts`, `runtime/apps/desktop/src/main/live-transcript.ts`: demonstrated boundaries between VAD, ASR, worker output and publication

**Repository status:** This is a local sanitized draft/report only, not committed to `main` or published to a PR; the required guarded GitHub write workflow has not been bypassed. No merge or Windows Gate 3 approval.
