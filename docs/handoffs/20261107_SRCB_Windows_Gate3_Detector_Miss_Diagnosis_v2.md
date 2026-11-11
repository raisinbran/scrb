# SRCB Windows Gate 3 — Scoped six-second misses and read-only causal audit (QA revision)

**Revision:** 2026-11-07, after independent Claude review and a further read-only spot-check of the archived renderer/adjudication JSON. Original source audio and external human-annotation XMLs were not independently re-opened. No new recording or inference.

**Date:** 2026-11-07  
**Tested application:** PR #42, frozen revision `2d1f8150cb68d56ec3fc842f1709f276f124ef55`  
**Assignment:** `W-G3-2TRACK-20261107`  
**Evidence:** Owner-provided `gate3-two-track-20261107.zip`, especially `session-02/` and `adjudication/`  
**Work performed:** Offline reading, aggregation, and code-path inspection only; no recording, model execution, launch, tests, production edit, repository write, or merge.

## Decision and boundaries

**System track: FAIL under the originally frozen detector-end scoring rule.** Four of 77 original system candidates have independently supported speech and no *newly rendered system-track word* within the six-second window based on the detector unit endpoint (plus generous calibration/boundary tolerance). Even giving every other candidate the benefit of the doubt, the maximum possible on-time percentage is **73/77 = 94.805%**, below the 95% target. This is a **scoped result under that measurement rule**, not a fully independently reproduced final Gate 3 verdict.

**Acoustic-word-end sensitivity: NOT PROVEN.** Extending candidate endpoints to the full end of each overlapping, human-annotated word reduces the defensible no-timely-DOM count to **three**. The optimistic upper bound becomes **74/77 = 96.104%**; this is **not a measured PASS**. Because the endpoint extension was evaluated after initial results, retain both versions transparently. The disputed fourth unit spans 191.230–191.610 s, cutting into an annotated word that ends at 192.650 s. A new system word appeared at 198.496 s: about 6.886 s after detector end but 5.846 s after acoustic word end. The identity of that newly displayed word is not proven to match the disputed utterance.

**Post-review qualification:** Claude identified a flaw in the deliberately optimistic association window: it can accept a DOM event from *before* the relevant speech. A read-only check of the saved renderer and source-adjudication JSON identifies a **fifth distinct candidate**, `meeting-41-115360` (115.360–116.830 s), that was not flagged by the original detector-end algorithm. The early 114.470 s DOM batch contains words from audio timestamped 113.098–113.578 s, while the independently annotated candidate contains speech through 116.820 s. The next newly rendered system words occur at 128.718 s, approximately **11.898 s after the annotated last word**. The archived source alignment for that unit is confident (local envelope correlation ≈0.997), but this revision has not independently replayed the external public WAV and XML inputs. Treat this as a **strong QA-supported additional miss, conditional on the archived source alignment**, not as a fresh run of the frozen scorer.

Under that additional source-alignment assumption, the detector-end upper bound is **at most 72/77 = 93.506%** (the original four plus `meeting-41-115360`) and the human-word-end upper bound is **at most 73/77 = 94.805%** (the original three plus `meeting-41-115360`; the 191 s fragment remains disputed). Both fail the 95% threshold **as scoped candidate-based coverage bounds**. Without accepting the extra candidate, retain the exact frozen-script outputs above: detector-end 73/77 FAIL; acoustic-end 74/77 NOT PROVEN. Do not silently replace the frozen results with a changed scoring rule.

The full matched/unmatched system median and microphone eligibility/coverage remain **NOT PROVEN**, and overall Windows Gate 3 remains **NOT APPROVED**. A prospectively specified endpoint/reference policy is still necessary before another physical acceptance run.

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

## Independent QA correction: premature display credit and burstiness

The original optimistic search deliberately gave a candidate credit for **any** new system word in a broad window, beginning at the earliest annotated overlapping word start minus 100 ms. For `meeting-41-115360`, that window began at **114.420 s**—before the detector unit itself began at **115.360 s**. The only system DOM batch within its optimistic six-second window occurred at **114.470 s** and contained "There / you / go" with reported live-audio times **113.098–113.578 s**. The human-aligned source overlapping this candidate contains the words "Right" (114.520–115.830 s) and "Lovely" (115.830–116.820 s). The early DOM batch is not plausible publication of that later source speech. The following system batch was **128.718 s**, with live-audio word times starting around **126.458 s**. This provides the QA-supported additional late case without requiring another recording.

An exploratory stricter window from **100 ms before each detector end to 6,100 ms after it** found eight source-verified candidates lacking any new system word. **Do not treat eight as confirmed misses or assert 69/77 = 89.6% as a valid bound:** that rule erroneously excludes legitimate word displays that occur before the end of a longer VAD unit; some candidate units also share annotated words at split boundaries. The original frozen detector-end count remains four, plus the separately identified pre-speech association defect above.

The preserved renderer has **21 inter-publication gaps longer than five seconds** across the run, including early gaps. Thus, the original four misses' occurrence between about 152–209 s does **not** by itself establish a late-session deterioration trend. Per-minute sampled backlog maxima were approximately **5.62 / 5.21 / 5.52 / 5.23 s**, with no monotonic increase. None of this identifies whether VAD, recognition, worker delivery, or the transcript sink caused the misses.

**Mathematical clarification:** the fourth *original* detector miss at 191.230 s **does matter** to the frozen-script threshold: four misses allow at most 73/77 (94.81%), while excusing it leaves three and an optimistic 74/77 (96.10%). It becomes non-decisive only *if* the newly identified, independent `meeting-41-115360` miss is accepted on the preserved source alignment.

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

**Close this cycle as `SCOPED detector-end FAIL (frozen), additional QA-supported pre-speech association miss; acoustic-end result conditional on preserved source alignment; root cause unresolved`.** Independent Claude QA accepted the original report with the correction documented above. The next administrative action is to record a **sanitized scoped result** on PR #42 through the owner-approved repository workflow, not to claim Windows Gate 3 approval or a confirmed production root cause. No further annotation of the full microphone track, inference, new recording, or speculative production fix is justified solely by these observations.

If the owner later authorizes another engineering task, the smallest potentially useful change is **limited, privacy-safe diagnostic instrumentation**, preferably on a separate reviewable branch: per-track audio-window identifiers through VAD decision, model call and zero/nonzero output, worker segment emission, sink append/replace, and `transcriptChanged` publication, with timestamp correlation and bounded logging. Do not log actual speech or confidential recordings. First show that this instrumentation can attribute a missing unit in synthetic/offline tests; run CI before independent review. Do not make this change as part of the current read-only assignment.

If another physical acceptance test eventually becomes necessary, use independently timed prerecorded speech for **both** tracks, with the phone playing into the microphone, not owner narration; freeze the endpoint policy and eligible denominator **before** observing latency. Obtain explicit owner authorization for any repeat and for any test planned to exceed 20 minutes, including expected final-pass processing.

## Agent QA-accountability note (pending repository entry)

The first ChatGPT forensic report did not notice that a generous DOM-association window could credit a publication occurring before a candidate's speech, and an earlier review unnecessarily proposed finding a fourth miss already identified in the detector-end JSON. These are analysis-process omissions, not proven application defects. Document them in the agent-caused-failure register under the next available incident number through an owner-approved docs PR, using this report and the original two adjudication files as evidence. **No incident entry has been committed by this report.**

## Evidence inventory for reviewer

- `adjudication/dom-adjudication-vad-end.json`: 4 frozen detector-end misses; optimistic `73/77` bound
- `adjudication/system-source-adjudication.json`, `session-02/renderer.json`, and `session-02/measurements.json`: QA-added `meeting-41-115360` source-word overlap, pre-speech displayed batch, and the later 128.718 s batch; archived source alignment was not independently reproduced
- `adjudication/dom-adjudication.json`: 3 extended human-word-end misses; optimistic `74/77` bound
- `adjudication/proof-audit.json`: four suspect source-word overlaps and broad DOM windows
- `adjudication/system-source-adjudication.json`: human annotation/source-window alignment classification
- `session-02/renderer.json`: first visible DOM words and `transcriptChanged` events
- `session-02/live-latest.json` and `session-02/final-transcript.json`: live/final persistence near the windows
- `session-02/worker-events.json`, `session-02/measurements.json`, `session-02/integrity.json`: lag/skip and native audio evidence
- `runtime/packages/transcription/src/livePcmEngine.ts`, `liveAudioWorker.ts`, `runtime/apps/desktop/src/main/live-transcript.ts`: demonstrated boundaries between VAD, ASR, worker output and publication

**Repository status:** This is a local sanitized draft/report only, not committed to `main` or published to a PR; the required guarded GitHub write workflow has not been bypassed. No merge or Windows Gate 3 approval.
