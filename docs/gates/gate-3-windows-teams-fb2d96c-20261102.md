# Windows PR #44 review and Teams field check

Review head: `fb2d96c04ea663d5179e5e7ea47890e980f748d9`, on `72c4107`.
Physical harness safeguards: `bb542a805f538e296769b4fa7a23ca6216a50dcf`.
No runtime, native capture, model or recording-state change was made by this QA.

## Review: REQUEST CHANGES to the original harness

The shared runtime fix is approved within this review's scope. Short losses
within a generation retain context with timestamp-derived silence; long
losses, boundaries and generation changes reset context. Timing validation,
late-close handling and bounded context remain intact. Metadata diagnostics
do not carry speech. The focused Windows PCM suite passed all25tests.

The original `apps/desktop/e2e/real-live-run.spec.ts` needs the safeguards
provided on this branch before its green result is trusted:

- Lines53–75 mix tracks and use the last stored word, allowing microphone
  progress to hide meeting-track stalls. Track meeting progress separately.
- Lines78–93 never require actual live speech; short zero-output runs can
  finish without the120second detector firing. Require speech activity,
  nonempty meeting live text and an actual final pass.
- Line90 closes the app only on the success path. A failed assertion before
  that point can leave a recording active. Preserve live evidence and close
  gracefully in finally, with a shutdown deadline.
- Line19's normal CI skip must not count as physical acceptance. Dedicated
  strict mode rejects absent inputs; this invocation actually ran one test.

Five focused harness regressions passed, as did desktop typecheck and
changed-file lint/format checks. Tests were reviewed directly; no subagent.
Do not merge or approve Gate3 on the strength of this note.

## Physical field check: PASS in the short-test scope

Actual Teams meeting audio through whole-computer loopback, plus the
separate physical microphone, with real approved CPU Whisper/VAD and the
hosted Windows decoder. Teams-targeted discovery was unavailable before
its audio session registered, so the loopback fallback was explicit.
This does not establish per-process isolation.

Start10:58:45.872PST; Stop/idle11:08:46.511PST; saved duration599.050s.
Playwright: **1passed,0skipped**, final status ready. Both source tracks
showed activity, and independent saved-PCM VAD confirmed meeting speech
in every minute. No synthetic audio was generated for the call.

Three low-priority CPU workers ran11:00:51.082–11:02:49.053PST.
Baseline, load and recovery markers are retained as numeric timestamps.
Teams remained responsive in all collected samples. No worker kill was
injected and no second recording was made for this field check.

| Measurement                                            | Result                                                              |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| Live words, meeting / microphone                       | 541 / 494                                                           |
| Final words, meeting / microphone                      | 1021 / 960                                                          |
| Meeting progress                                       | Advanced in every one-minute sample; no detected120s stall          |
| Largest internal live-word position gap, meeting / mic | 34.030s /33.860s; not display-arrival latency                       |
| Sequence-inferred lost frames, meeting / mic           | 1798 /1804 in8observed reporting windows                            |
| Bridged gaps, meeting / mic                            | 43 /46 in those windows                                             |
| Reset gaps, meeting / mic                              | 84 /85 in those windows                                             |
| Observed cumulative queue overflows, meeting / mic     | 2004 /2005                                                          |
| Maximum queued frames                                  | 40                                                                  |
| Slowest observed hop, meeting / mic                    | 3356ms /4866ms                                                      |
| Observed live worker restarts                          | 0                                                                   |
| Saved chunks, meeting / mic                            | 121 /120; all241decoded without errors                              |
| Marked recorded gaps                                   | One225.1001ms possiblyMissing meeting gap; mic0                     |
| Internal unmarked timeline holes                       | None above1ms audit resolution; initial offsets reported separately |
| Sampled peak whole-app memory                          | 1405.4MiB including final processing                                |
| Record / Stop visible acknowledgment                   | 42.8ms /11.6ms                                                      |
| Capture confirmation / Stop completion                 | 988.9ms /413.0ms; separate from UI acknowledgment                   |
| Observed final wait                                    | 742.4s, including up to5s polling overhead; exceeds599.1s clip      |

Loss diagnostics are reporting-window counters; queue overflow is cumulative.
Final-window coverage is incomplete, so loss numbers are observed lower
bounds, not exact full-run totals. Windows queue loss is demonstrated.
Additional upstream loss is **not established** by subtracting these
unaligned counters. No causal claim is made about native capture.

No suitable reference exists for this private call, so word counts are not
WER or proof of15%error improvement. Per-minute progress/word positions are
not calibrated live-to-display latency. This CPU run does not meet the
real-time final-pass target. Memory and UI acknowledgment checks passed
within their measured sampling scope; Gate3 remains open.

## Concurrent Mac comparison

The [published Mac normal-load report](https://github.com/raisinbran/scrb/blob/rosmont/gate-evidence-macos-mac-20261102-teams-field-10min-fb2d96c/docs/gates/evidence/macos/mac-20261102-teams-field-10min-fb2d96c.json)
reports1passed/0skipped,2134live words,2232final words, no loss/overflow,
no worker restart, no120s stall and no marked recording gaps. Its raw
archive was not independently reviewed here.

Windows began74.128s before the published Mac start. Windows's marked
meeting gap was at19.90–20.13s of its own timeline, before the reported
Mac start, so it has no simultaneous Mac recording counterpart. There are
no Mac-reported loss events to align with Windows's loss events. Both
report progress, but differing loads, capture routes, execution settings,
sampling and hardware prevent a causal conclusion. CPU percentages are
not directly comparable without matching normalization.

## Evidence and remaining work

The [allowlisted numeric report](https://github.com/raisinbran/scrb/blob/rosmont/gate-evidence-windows-win-teams-20261102-fb2d96c/docs/gates/evidence/windows/win-teams-20261102-fb2d96c.json)
was published through the existing workflow. Its GitHub blob was verified
against the local file. The accompanying JSON contains only safe numeric
results, enums and hashes. All audio, private text, live minute copies,
pre-Stop text, final transcript, configurations, logs and full chunk-hash
inventory remain in protected persistent local storage outside Git.

The existing publisher self-check is not fully green:4passed,1failed
(`live check ignores genuine silence` returned unverified). It was not
changed to obtain a green result. The generated report was separately
inspected for privacy and arithmetic before publication; its CHECKS_PASSED
status describes the allowed measured checks, not Gate3 approval.

Remaining: include/review the harness safeguards; resolve Windows live
queue pressure and align pre-queue/overflow counters; obtain calibrated
post-fix display latency and paired public-reference WER; meet final-pass
performance; fix the previously demonstrated ALAC/.opus finishing failures;
record the owner's formal alternative-evidence exception and evaluate
marked gaps/residual long-run risk. Reuse the historical four-hour evidence
with its failed-live limitations. No new four/eight-hour test is proposed.

A cloud-safe follow-up can add cumulative, same-window counters immediately
before worker.offer, for startup-pending eviction, offer rejection, queue
overflow and engine receipt, then test injected sequence losses with
invented PCM. It must not change durable capture or infer an upstream cause
from the existing windowed counters. Coordinate with the already assigned
extended-timeline simulation rather than duplicate it.

Recording, app and model processes were closed by11:21:09PST, with saved
track auditing complete by11:21:26. No essential recording writes remain.
No merge or Gate3 approval.
