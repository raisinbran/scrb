# M1 / V1 execution handoff — 2026-11-18

**Repository:** [raisinbran/scrb](https://github.com/raisinbran/scrb)  
**Snapshot:** main at [d07eee63bad573ead741739dd0de9d189decdace](https://github.com/raisinbran/scrb/commit/d07eee63bad573ead741739dd0de9d189decdace)  
**Audience:** new coordinating session, Mac M5, Regiurn, BCHEN-W10 and independent cloud reviewers  
**This is a factual handoff and proposed queue, not a new recording authorization, gate acceptance, private-file permission or merge.**

## 1. Outcome, requirements and owner decisions

**M1 — NOT ACCEPTED.** A single known-build recorded meeting must demonstrate all five steps: (1) separate non-silent synchronized microphone and meeting tracks, (2) live *speaker-grouped* text, (3) completed final transcript with meaningfully distinguished remote voices, (4) audible timestamp click-to-seek playback, (5) copying the **entire** final text, including offscreen virtualized words. Report restart persistence separately. Counts of speaker labels, copy toast, transport movement, unit tests and AMI speaker clustering cannot substitute for same-recording acceptance. See [issue #340](https://github.com/raisinbran/scrb/issues/340).

**V1 — NOT ACCEPTED.** Fifteen requirements in [V1 Requirements v1.2](../../dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md) must work in installed, offline builds on Windows 11 and Apple Silicon Mac, including full Gate 8 safety. Built code, merged PR, or passing isolated test is not the same as accepted runtime behavior.

**Rules:** Development may continue independently of unfinished earlier gates, but owner approval remains required for gates, risky changes and tests *planned* to exceed **20 minutes total** (setup through cleanup); minor unforeseen overruns are not automatic stop conditions. Exact-head checks precede truly independent formal reviews, then owner-authorized squash merge. Confidential meeting recordings are protected, with only narrowly scoped and time-limited owner permissions. No automatic repeat tests or data cleanup.

## 2. Merged accomplishments at the verified snapshot

The owner merged the following reviewed PRs, confirmed in sequence on main:

| PR | Integration | Meaning / limit |
| --- | --- | --- |
| [#347](https://github.com/raisinbran/scrb/pull/347) | Saved speaker counts | Display correction, not proven speaker accuracy |
| [#337](https://github.com/raisinbran/scrb/pull/337) | Input settings / Gate 8 acceptance plan | **Plan**, not implemented effects |
| [#344](https://github.com/raisinbran/scrb/pull/344) | Review-independence incidents | Process documentation |
| [#356](https://github.com/raisinbran/scrb/pull/356) | Real microphone test routing in hybrid UI | Routes calls/events; not proof of recorded signal |
| [#354](https://github.com/raisinbran/scrb/pull/354) | Speaker reassignment overlap guard | Targeted safeguard |
| [#345](https://github.com/raisinbran/scrb/pull/345) | Synthetic seek, copy and reopen checks | Automated fixtures, not owner-accepted physical recording |
| [#351](https://github.com/raisinbran/scrb/pull/351) | Development onboarding/isolation | Follow actual runtime profile rules |
| [#355](https://github.com/raisinbran/scrb/pull/355) | Fail-closed M1 test-launch **plan** | Launcher validator is **not implemented** merely because the plan merged |
| [#353](https://github.com/raisinbran/scrb/pull/353) | V1 requirements audit | Source/documentation evidence, not V1 approval |

Work and testing on older [aea9432e](https://github.com/raisinbran/scrb/commit/aea9432e235975adf8c831c3c08a758661d54366) must be labeled with **that** SHA, not current main; preserve installed app and test-profile provenance.

## 3. M1: physical-platform evidence and next actions

### Mac M5 — Phase A PASS; one five-step capture awaits owner approval

- Older real Mac capture: 827 complete Opus chunks **per track**, no reported gaps; final transcript 619 segments, 8,341 words, six remote labels plus mic label. Those counts do **not** prove speaker identities or live grouped text. Historical seek transport passed, but audible landing and complete clipboard were not measured on that exact installed build.
- On development source **aea9432e**, a **disposable** user profile/library and real backend `getSettings.storageLocation` match were verified. Real `startAudioCheck` completed in about **390 ms**; listening/hearing events and moving levels from -100 to **-34 to -41 dBFS**, followed by clean stop. Initial malformed IPC payload was rejected at validation; later correct payload worked.
- **Latest Phase A PASS:** meeting route `whole-computer`; two **invented** Samantha/Fred voice lines successfully played through unmuted MacBook Air Speakers. **Output playback is not meeting-track capture**, nor proof remote voices will label correctly.
- **P0 owner decision:** authorize **one** planned approximately **30-minute total** isolated M1 recording+final+seek+copy+restart test (or specify a different budget) **before launch**. The present handoff does not grant it. Run on one known build, use an empty verified disposable library, watch live grouping during capture, compare actual saved two tracks to known signals and evaluate final identity, audibly verify seek and compare full clipboard to saved final transcript. Each criterion PASS/FAIL/NOT VERIFIED individually; no automatic rerun. Protect installed Scribe and real libraries.
- **GUI incidents:** development Electron sometimes aborts `SIGABRT` in HIServices `_RegisterApplication` before JS; same host also later launched a working app. [#357](https://github.com/raisinbran/scrb/issues/357) tracks suspected Codex GUI launch sandbox. **Crash reports do not mean M1 tests failed**. Avoid known crash-producing launch route, compare sanitized signatures without repetitive launch tests. During an unrelated window-selection action, recording-list titles/statuses briefly appeared in accessibility output; no recording was opened. Do not revisit unrelated owner windows or put private titles into Git.

### Regiurn Windows — speaker cache evaluation complete; build and M1 evidence remain blocked

- **R-M1-1 COMPLETE**, public AMI ES2004a full-context cache at historical [97080d05](https://github.com/raisinbran/scrb/commit/97080d05ff8c796eb0080e013095173e387ecd45): 161 raw / 98 embedded segments, 15 raw clusters. Raw ID 1 (304.911 s) stays final speaker-1; IDs 2 (179.495 s) and 13 (55.586 s) merge to final speaker-2 at cosine **0.877834**. In public 529–574 s reference B overlaps final Speaker 1 for 11.403/15.583 s and Speaker 2 for 2.447 s; D overlaps final Speaker 2 for 16.408/20.682 s. Some speech has no final overlap. Word-level assignment was **NOT VERIFIED**. Raw diarization causes observed B contamination; relabel consolidates D's clusters. No model inference rerun or threshold change was made. Do not claim Windows product acceptance.
- Older Regiurn app displayed mic activity, live words, eventual You and Speaker 1 text, playback transport, and a copy toast. **Actual saved tracks, two remote voices, audible seek correctness, clipboard completeness and restart persistence remain NOT VERIFIED.**
- One-time owner-authorized 30-minute read-only search for a previous Regiurn pilot **expired at 00:50 PT on 2026-11-18** without uniquely identifying a recording. No audio or transcript was accessed. **No permission remains** for private recording inspection. BCHEN-W10 pilot is a different machine, may contain private microphone content, and cannot be substituted. Ask for *fresh* narrowly scoped consent only with a definite target; otherwise do a later authorized new isolated synthetic recording.
- New temp profile/library passed Windows path isolation and pointer checks on older **aea9432e**. Node 22.23.4 and npm ci succeeded; Vite renderer built; **Electron esbuild main/preload failed** with `Cannot read directory "../../../../../..": Access is denied` and entry resolution failures. Capture helper missing from this checkout, so runtime backend/mic and meeting route were NOT VERIFIED. [#327](https://github.com/raisinbran/scrb/issues/327) also tracks Windows Codex desktop `.git` write constraints, distinct from source-build correctness.
- **P0 Regiurn assignment now:** short read-only verification of effective CWD, canonical entry paths, junctions, the actual build-electron script and sandbox root; identify first failed permission boundary. Only **one** supported host-context build after justified diagnosis; no blanket ACL/sandbox/Git changes. If Electron builds, launch with the verified disposable userData/library and `SCRB_DEV_AUTO_LOCATION=1` as allowed by AGENTS.md; check **actual** real backend storageLocation before other UI work, then nonrecording mic and two-voice source preflight. Report READY/BLOCKED and planned total acceptance duration; any new recording requires separate authorization.
- Windows CLI independent setup from owner-supplied session evidence: Node 22.23.4, `npm ci`, `scripts/m1.test.cmd` PASS, focused **42 tests PASS / 15 skipped**, and assets sourced from another vetted checkout. Physical pilot NOT RUN because that session enumerated no audio endpoints. Do not equate setup PASS with the five M1 criteria.

### Other gate safety

Gate 2 remains **approved**. Mac Gate 3 previously owner-approved; Windows Gate 3 has narrower approved latency/evidence substitutions, not necessarily full platform closure. Mac Gate 8 long run **FAIL**: 7:29:58.604 duration (short of 8h), approximately **4.3469 seconds** mic gaps, worst 4h drift **65.81 ms** versus 50ms target. Windows 8-hour end-to-end acceptance unresolved. No long rerun authorized. Preserve all raw evidence pending owner cleanup approval.

## 4. V1 requirement-by-requirement remaining work

Based on [15-requirement source audit](v1-status-and-independent-slices-20261117.md); implementation status must be reconfirmed at the current commit and on installed builds:

| V1 # | Must-have | Built/partial and remaining proof |
| --- | --- | --- |
| 1 | Separate synchronized mic/meeting audio | Native pipeline built. Installed two-track, per-app/whole-computer route, stream restart and endurance evidence outstanding |
| 2 | Live multi-person remote-speaker text | Partial; same recording must show distinct actual remote voices. Raw diarization overlap remains imperfect |
| 3 | Correct live words | Editor/storage built; prove changes while live recording without interrupting capture |
| 4 | Reuse corrections | Vocabulary hints built; verify measurable next-meeting recognition benefit |
| 5 | Returning speaker learning | **Production create/grow/suggestions missing** despite seeded profile tests; require consent, match thresholds, undo/deletion and cross-meeting identity proof |
| 6 | Accurate final pass with frozen corrections | Worker built; prove accuracy, remote label correctness and preservation on real known recording |
| 7 | Pause/resume | Built; installed sustained/device-change continuity and recovery evidence still needed |
| 8 | Brief/Full summaries and complete action/decision tables | Built/partial, reported evaluation recall ~**68%** vs ~**80%** target; installed model and quality closure needed |
| 9 | DOCX/PDF transcript/summary/both | Core exporters built; verify installed layout/parity on both platforms |
| 10 | Local retention / delete / auto-delete | Core exists; verify real installed deletion and retained-original recovery/privacy |
| 11 | Functional Voice Isolation / Studio / Custom | Major implementation gap: many Settings toggles persist but do not affect normal processing; add measured DSP/sensitivity/warnings without altering stored original or ducking meeting output. [#335](https://github.com/raisinbran/scrb/issues/335) |
| 12 | Themes, responsive sidebar and accessible workspace | Built; long transcript scrolling and installed accessibility remain; [#352](https://github.com/raisinbran/scrb/pull/352) open |
| 13 | Offline after installation/models | Need complete Windows capture/model packaging, clean install and offline operation plus real model update/rollback |
| 14 | About and built-in searchable offline manual | Incomplete true model/build/license inventory and bundled searchable manual |
| 15 | Imported audio parity | Pipeline built; complete WAV/MP3/M4A/FLAC/Opus installed format matrix, final speakers, cleanup/export still unaccepted |

**V1 cross-cutting blockers:** [Input Profile plan](../plans/v1-input-settings-closure.md) and [Gate 8 verification](../gates/gate-8-input-settings-acceptance.md); true safe shutdown and visible background final-pass status [#49](https://github.com/raisinbran/scrb/issues/49) (current interrupted processing **restarts** on reopen, not checkpoint-resumes); reliable growing/undoable profiles; physical Mac **44.1 kHz USB mic** compatibility; 8-hour recording safety/drift; offline Windows shipping/model distribution; truthful manual and installed disclosures; final summary quality. Do not infer functionality from saving a UI setting. Risky capture, durable storage, corrections, delete, native DSP, security, IPC or quit changes require an independently reviewed **owner-approved** plan first.

**P1 independent cloud slices:** follow [small non-overlapping V1 assignments](v1-status-and-independent-slices-20261117.md): visible nonmodal background-processing status, bundled searchable offline manual, truthful installed-model About inventory. Verify latest main and PR overlap before assigning. Do not compete with Mac/Regiurn hardware work.

**P1 open PRs:** [#352](https://github.com/raisinbran/scrb/pull/352) draft, new head fef0688010fbcd44c452b53e851d99c6a345833e had **Windows unit failure** (unchanged summary-retention test) and **macOS smoke failure** (30-min synthetic jump ~1925 ms vs 1000 ms limit); distinguish runner variance from confirmed regression, no relaxing targets, one justified retry max, then fresh exact-head CI and independent formal review. [#350](https://github.com/raisinbran/scrb/pull/350), [#348](https://github.com/raisinbran/scrb/pull/348) and [#346](https://github.com/raisinbran/scrb/pull/346) have unresolved CI/review gates at snapshot. Legacy large PRs should not be bulk merged; owner-only merges after CI and independent review.

## 5. SERIOUS PROCESS VIOLATION: mandatory non-Claude usage and session accounting omitted

**Confirmed recurring administrative reporting failure**, not an application or CI failure. Recent Mac and Regiurn non-Claude task replies omitted required usage and often task **PT start/end**, actual **model** and **reasoning/effort**; some said “usage row created” without showing figures or disposition. The repository has required usage logs for all agents; the failure to provide honest figures **or explicitly state their inaccessibility** is a serious deviation from [AGENTS.md](../../AGENTS.md). Existing local rows might be real but unpublished; do not claim absent readings are zero or that every agent had UI access. Owner escalation: [#358](https://github.com/raisinbran/scrb/issues/358), [M1 checkpoint](https://github.com/raisinbran/scrb/issues/340#issuecomment-6973787704). This handoff adds one confirmed incident and explicit AGENTS reporting-gate amendment in its PR.

**Enforce for EVERY NON-CLAUDE session** including ChatGPT cloud, Codex CLI/Desktop (Mac/Windows), planning, review, blocked task, and any non-Claude subagent. Claude remains covered by the original all-agent policy; it is not granted an exemption.

1. **At task start:** record local **PT timestamp**, device/surface, exact observed model and effort, source/build SHA, attempt once to observe **5-hour and weekly percentage REMAINING**, their reset times, and known shared-account overlap. If inaccessible, record **unavailable — attempted source and reason**, not a guessed number or another machine's quota.
2. **At task finish:** observe and report **end PT timestamp**, model/effort, both 5h and weekly remaining start -> end, resets, overlap, number of retries, result, source SHA, applicable A-number incidents. Compute pp change only when start/end comparable in same quota window, and never attribute shared-account decline as exclusive cost.
3. **Write one file per task** under [agents/usage-log](../../agents/usage-log/README.md) using exact **12-column format**. Do not append to frozen legacy log or silently modify old entries. If Git writes unavailable, preserve a local row and state its **UNPUBLISHED** status/path; use a normal later PR.
4. **Mandatory owner-facing result footer:** `Usage — model: [value or unavailable+reason]; effort: [...]; PT start/end: [...]; surface: [...]; 5h remaining: START[...] / END[...]; weekly remaining: START[...] / END[...]; resets: [...]; overlap: [...]; retries: [...]; row: [path + published/unpublished]; incidents: [IDs/none].` “Usage logged” alone is insufficient.
5. **Coordinator audit:** do not classify work administratively COMPLETE if footer or log missing. Report `REPORTING NONCOMPLIANT`; retain technical PASS separately. Demand a correction, log a new [agents/incidents](../../agents/incidents/README.md) entry for confirmed self-induced omission and reconcile incident IDs against main and open/local PRs. Do not postpone safe capture shutdown/recovery for quota bookkeeping.
6. **Audit continuity:** check at least the next two independent non-Claude handoffs (one desktop and one cloud if feasible) against their complete owner-facing footers and usage files, and continue checks thereafter. Report evidence to [#358](https://github.com/raisinbran/scrb/issues/358). No false assurance from merely merging a policy change.

## 6. Nonnegotiable next-session operating rules

Consult [agent allocation](../../agents/agent_task_allocation.md) before dispatch. Maintain independent nonoverlapping Mac, Windows and cloud queues. No self-approval: CI -> **separate-session formal review** -> owner merge authorization. No direct main writes, unapproved protected contract edits, risky-data changes, fabricated statuses or attribution trailers. Existing GitHub write restriction waiver remains: do not invoke the forbidden pde write workflow. All private meeting recordings/audio/transcripts stay local unless explicitly scoped owner access remains valid. Evidence is retained until owner cleanup approval.

**Immediate handoff order:** ask for bounded Mac 30-minute M1 acceptance authorization; dispatch Regiurn one-pass esbuild/path diagnosis; continue #352 CI recovery and small V1 implementation, each with the **full per-task accounting footer**; do not mark M1 or V1 accepted without owner-observed evidence.
