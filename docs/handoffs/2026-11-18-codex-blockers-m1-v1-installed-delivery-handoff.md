# Session handoff — Codex execution blockers, M1/V1 progress, and installed-app delivery

**Date:** November 18, 2026 (Pacific)  
**Repository:** [raisinbran/scrb](https://github.com/raisinbran/scrb)  
**Development baseline / verified main at authoring:** [e0ff737f3b928283f53cd9abbd1b294bbe90e584](https://github.com/raisinbran/scrb/commit/e0ff737f3b928283f53cd9abbd1b294bbe90e584)  
**Handoff audience:** next coordinator, BCHEN-W10, REGIURN, Mac M5, and independent reviewers  
**Execution plan:** [M1 installed delivery and acceptance plan](../../dev-plan/m1-installed-delivery-and-acceptance-20261118.md)  
**Status:** M1 NOT ACCEPTED; V1 NOT ACCEPTED; no three-machine installed release candidate exists or has been validated.

This handoff distinguishes evidence reported by physical-machine executors from GitHub facts independently checked in this chat. It does not imply this chat accessed the machines, launched Scribe, observed private recordings, or certified actual installations. Earlier dated handoffs are historical snapshots, not instructions to repeat superseded work.

## 1. Owner decisions and course correction

The owner reported that development control and local file access worked during the project's first approximately three weeks, then deteriorated roughly 48 hours before this session. The triggering update, effective sandbox-profile change, or host-specific mechanism **has not been proven**; timing alone cannot identify the cause. Mac GUI registration aborts, REGIURN's Windows Git metadata restrictions, and a later Windows Electron breakpoint are distinct symptoms and must not be presented as one diagnosed bug.

Repeated development-build launches, desktop sandbox investigations, and administrative handoffs consumed time and credits without proving M1 end-to-end. The owner therefore approved a new two-milestone strategy:

- **Milestone A: normally installed, working M1 candidates on Mac M5, BCHEN-W10, and REGIURN**, independent of Codex development launchers and with verified native components and rollback.
- **Milestone B: 5/5 integrated M1 features on each installed candidate**, scored as 15 machine-specific checks, with restart persistence separately verified.

**Important sequencing:** e0ff737f is the engineering starting baseline, **not** the final release-candidate revision. Final M1 source SHA is selected only after the required Windows packaging/installer and Mac safety work passes exact-head CI, independent formal review, and authorized merges. Both OS packages and all three installed instances must identify that later common SHA, while platform native/component hashes are recorded separately.

The owner explicitly authorized Phase A0 preflight and merge activities in the November 18 follow-up to the two documents; the decision and limitations are recorded in [issue #340](https://github.com/raisinbran/scrb/issues/340#issuecomment-6993657203). Parallel Windows/Mac packaging follows a successful bounded preflight. M1 numerical acceptance thresholds remain proposed and require explicit owner approval before Milestone B testing. No new long physical test is authorized by this handoff.

## 2. Verified work completed during this session

Five preexisting PRs were independently reviewed at their then-current exact heads, had successful Windows/macOS CI, and were **squash-merged by this ChatGPT session** under the owner authorization reported for those historical merges (not a prospective reviewer-triggered merge rule):

| PR | Subject | Resulting main commit | Limit of proof |
| --- | --- | --- | --- |
| [#346](https://github.com/raisinbran/scrb/pull/346) | Portable five-model Windows handover: hash verification and protected installation | [fdbac4f3](https://github.com/raisinbran/scrb/commit/fdbac4f3ec5cecb6402a9c31b8e226a63fe4e152) | Not physical clean-PC model installation or recording |
| [#352](https://github.com/raisinbran/scrb/pull/352) | Bounded transcript-scroll easing | [c4e0d3ed](https://github.com/raisinbran/scrb/commit/c4e0d3edb719cb20217e1597d4eda904fec92a0b) | Earlier ~1,925 ms macOS timing failure and unknown runner/timing margin remain recorded |
| [#363](https://github.com/raisinbran/scrb/pull/363) | PR #352 CI/review and historical usage handoff | [a61128e7](https://github.com/raisinbran/scrb/commit/a61128e7b828c32f39ebd1d447d9939a376482ea) | Publishing historical rows does not make earlier deficient handoffs compliant |
| [#360](https://github.com/raisinbran/scrb/pull/360) | Persistent, nonmodal processing label | [8d86a213](https://github.com/raisinbran/scrb/commit/8d86a213b6dfaf6dbba455fa6a4d388f1acf3360) | No safe-quit, durable resume, or final-pass architecture change |
| [#362](https://github.com/raisinbran/scrb/pull/362) | Bundled offline searchable User Manual | [e0ff737f](https://github.com/raisinbran/scrb/commit/e0ff737f3b928283f53cd9abbd1b294bbe90e584) | Not installed-app accessibility or model-inventory acceptance |

Other previously merged foundations include Windows six-runtime-tool slice [#339](https://github.com/raisinbran/scrb/pull/339), Mac llama-server staging [#321](https://github.com/raisinbran/scrb/pull/321), microphone routing [#356](https://github.com/raisinbran/scrb/pull/356), overlapping speaker reassignment guard [#354](https://github.com/raisinbran/scrb/pull/354), and M1 seek/copy/reopen synthetic coverage [#345](https://github.com/raisinbran/scrb/pull/345). These merged changes are **not automatically installed on any owner's machine**.

- [PR #361](https://github.com/raisinbran/scrb/pull/361) remains **unmerged and excluded from Milestone A**. A prior head was P1 rejected because the configured arbitrary-model-path cache omitted file identity and could accept a different file after verifying another. Its branch has since advanced; do not infer that the earlier defect persists or was fixed until current-head CI and a new independent formal review establish the answer. The optional About-screen inventory must not block the installed-app core delivery.
- [PR #364](https://github.com/raisinbran/scrb/pull/364) has a rejected reconciliation proposal (A-781/A-782 collide with now-merged #360). Reporting drafts [#365](https://github.com/raisinbran/scrb/pull/365) and [#366](https://github.com/raisinbran/scrb/pull/366) also existed; verify their live heads and review gates rather than assuming they have merged.
- The owner requested and obtained an independent review of the new installed-app strategy, culminating in an **approved Phase A0 plan with one key baseline-versus-final-RC sequencing correction**. No package build, installation or physical test occurred in this chat.

## 3. Codex and development-environment failures: what was observed and tried

These failures became an execution impediment, **not proof that a normally installed Scribe cannot work**. Do not claim a common upstream root cause until supported by machine diagnostics.

### REGIURN (Windows 11): trusted runtime and Git metadata permissions — [issue #327](https://github.com/raisinbran/scrb/issues/327)

1. **Initial failure:** computer use and shell execution returned “trusted Node process exited unexpectedly; kernel reset” and “windows sandbox failed: registered runtime ownership is missing.” A visible Terminal pane did not prove executable tool access.
2. **Observed recovery:** on November 15 the owner terminated all related desktop app and background processes in Task Manager and restarted the application. Windows control then worked and the real-mode launch script advanced to a new, ordinary prerequisite error: missing native capture helper. **Only the startup/runtime-ownership symptom was recovered; its precise cause was not identified.**
3. **Remaining separate failure:** ordinary source-file writes worked, but an isolated Git metadata write (disposable git update-ref) failed because the session sandbox treated the repository's .git area as read-only. Git trust/ownership was a separate read-access issue and not a solution for write permissions. A custom “scrb-git” profile appeared in the UI but was not verified as an effective configured sandbox. Desktop build reportedly 26.1111.71025 / 28661 offered no update. No blanket ACL change or sandbox bypass was made. Git write recovery was **NOT VERIFIED**.
4. **Other build-path symptoms:** a development checkout had Electron main/preload esbuild “Access is denied” entry-resolution errors despite npm ci / Vite success; Node 22.23.4 was used to bypass a separate Node 26 incompatibility in other preflight scripts. Neither symptom establishes the later Electron crash cause.

### REGIURN: capture-helper recovery, then isolated Electron breakpoint

1. **Missing helper was addressed:** executor rebuilt the x64 Windows helper at historical source [aea9432e](https://github.com/raisinbran/scrb/commit/aea9432e235975adf8c831c3c08a758661d54366), using pinned Opus 251d657e92fccfa3b05baec4f05756cce252fb75, MSVC 19.44.35229, CMake 3.31.6, Ninja 1.12.1. One initial CMake configuration failed from uninitialized MSVC / split argument; corrected build PASSED. Reported helper SHA-256 **7229385B687828C697335CD9529D5BB1979B52AF160187EA3141993B5DAF4ABA**. Rebuilt Opus static library SHA-256 **D2161E7915543BBD778A41700CF6DE8402577BC570567983F2A3B4D450F12EB1**. Imports and PE x64 identity were inspected. **Helper executable behavior was not tested.** Do not mistake this historical helper/source combination for a signed-off final-RC dependency.
2. **Isolated preflight:** temporary profile and separate empty library were prepared and the library-location pointer placed at the source-appropriate profile root. The historical source did not use SCRB_DEV_AUTO_LOCATION, so passing that variable alone was not sufficient proof of configured storage.
3. **Launch failure:** Electron 45.2.1 (development Scribe 0.1.0) raised Windows exception **0x80000003** before a visible Scribe window and before the real backend returned getSettings.storageLocation. A subsequent **read-only** diagnostic identified the task-owned development Electron launch but found no matching Windows Application Error/WER entry or faulting-module information. The exact failing component remained unknown.
4. **Safety outcome:** the task process was stopped after the failed attempt; no automatic retry, recording, helper execution, normal-library access or private transcript inspection occurred. Local provisional A-727–A-730 and 12-column accounting were reported **unpublished**, needing reservation reconciliation.

**Conclusion:** Proven native build success, **not** proven Windows M1 runtime, and **not** conclusive evidence that the breakpoint is caused by Codex. Stop investigating the old development launcher unless an installed candidate independently reproduces a materially equivalent fault.

### Mac M5: native Electron GUI registration failure and denied host access — [issue #357](https://github.com/raisinbran/scrb/issues/357)

1. Development Electron 45.2.1 / ARM64 (reported macOS 27.0.1) aborted with **SIGABRT / HIServices _RegisterApplication → AppKit NSApplication init**, approximately 0.39 seconds after a Codex-hosted GUI launch and **before Scribe JS/audio capture**. Public upstream Codex/Electron reports show a similar fingerprint. **Local logs did not prove a Launch Services Mach-lookup denial**, so a Codex sandbox GUI boundary is plausible, not established as the sole root cause.
2. On a separate later isolated launch, the task-owned Electron process exited in about 1.2 seconds without captured exit status/stderr or backend settings response. These observations should not be conflated with a proven identical crash fingerprint.
3. A proposed one-time host Terminal diagnostic could not proceed: the computer-use safety policy **refused Terminal access**; **zero commands and zero additional launches** occurred in that attempt. Neither a host-context recovery nor any newly installed Mac app is thereby proven.
4. Previously on older isolated source, Mac physical setup did demonstrate a real microphone signal (moving levels), temporary backend storage verification, and playback of invented remote voice lines through Mac speakers. **Playing output sound does not prove that Scribe saved the meeting track.**
5. Local Mac incidents A-778/A-779 record an inconclusive Phase B probe and a mandatory missing-start-time reporting deficiency. Mac A-780/A-781 and earlier A-774/A-775 were disclosed as unpublished reservations. Those **collide with published or earlier reservations** after #360/#362 merged; rename local files only after examining original evidence, preserving historical provenance and all links.

**Conclusion:** No further GUI launch from a denied Codex/Terminal context. Normal signed Scribe.app should be tested via a supported owner-host/Finder launch after preserving the old installation, not through the restricted development launcher.

### Repeated approaches that did *not* establish a permanent repair

Full desktop-process restart recovered one REGIURN trusted-runtime symptom but **did not** make Git metadata writes reliably available. Node 22 overrides corrected unrelated tool compatibility but **not** Windows Electron startup. Rebuilding the helper fixed its absence but **not** Electron's breakpoint. Relocating temporary profiles and validating pointer files proved isolation inputs, **not** real backend launch. Searching local WER and crash evidence classified failures but did not identify the Windows faulting module. Mac sandbox/host-terminal escalation was requested but refused, so no host recovery result exists. No OS-wide permission changes, blind reinstallations, repeat long recordings, or destructive data cleanup were authorized. Do not repeat any of these as “new” remedies without a changed hypothesis and a bounded diagnostic.

**New execution rule:** One documented attempt per distinct failure mode; a repeat requires new evidence or a targeted correction. Keep Codex execution failures in [#327](https://github.com/raisinbran/scrb/issues/327) / [#357](https://github.com/raisinbran/scrb/issues/357), separate from actual packaged-app defects.

## 4. M1 evidence versus the still-unproven end-to-end goal

M1 has **five** mandatory steps on **one same-recording, known installed build, per machine**. The 15-cell matrix starts at **zero *new installed-candidate* checks verified**, not zero historical engineering evidence.

| M1 step | Existing evidence | Missing installed-candidate proof |
| --- | --- | --- |
| 1. Two synchronized mic/meeting tracks | Older Mac saved 827 complete Opus chunks per track; native Windows pipeline and selected tests pass | Same-build saved non-silent known stimuli and timing on each of three PCs; clean recording path |
| 2. Speaker-grouped live transcript | Real live words seen on Mac/Windows; provisional live diarization exists | Two known remote voices distinguished in real-time; objective grouping accuracy and latency |
| 3. Final labeled transcript | Mac historical final 619 segments / 8,341 words, remote labels; public AMI evaluations identify speaker contamination | One-to-one truthful identification of local + two remote voices, reference transcription accuracy |
| 4. Audible transcript click-to-seek | Automated seek/reopen coverage and observed playback transport | Measured landing accuracy plus actual audible correct speech at beginning/middle/end |
| 5. Complete transcript copy | Synthetic Electron tests covered long/offscreen transcript text; earlier app showed copy toast | Compare *entire* clipboard to saved final text on each installed candidate |

An older installed Mac lacked the Copy button despite newer source implementing it, illustrating why source merges **must not** be called deployed features. REGIURN's past development-mode copy toast and playback movement do not establish byte-complete copy or correct seek. Restart persistence is a separate verification. Distinguish whole-computer loopback from process-target Teams capture; one does not certify the other. See [M1 issue #340](https://github.com/raisinbran/scrb/issues/340).

**Platform installation status:** Mac previously launched an older known-working application, but latest candidate/installed revision is not verified; REGIURN's latest development Electron launch is blocked, and no complete recording-capable installed Windows build is proven; BCHEN-W10 packaged the six-tool Windows **shell** and passed no-recording smoke, not a seven-tool recording build. **No complete, updated installed M1 candidate has been verified on all three computers.**

## 5. V1 work remaining after M1 delivery

The 15 numbered V1 requirements in [V1 v1.2](../../dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md) remain unaccepted. The [November 17 source audit](v1-status-and-independent-slices-20261117.md) predates this session's merges; update its documentation and runtime claims rather than repeating obsolete open-PR statuses.

| V1 requirement | Remaining functionality or installed proof |
| --- | --- |
| 1 — Mic/meeting audio | Fully packaged Windows capture, app-target compatibility, interruptions, Mac/Windows sustained integrity |
| 2 — Live multiple remote speakers | Accurate distinction of remote voices and measured live-label delay |
| 3 — Live corrections | Prove correction during ongoing installed capture without losing selections/words |
| 4 — Corrections reused | Prove later-meeting recognition benefit; conservative vocabulary handling |
| 5 — Returning voice profiles | **Production create/grow/suggestions still incomplete**; consent, persistence, matching, undo/deletion, cross-meeting evidence |
| 6 — Final pass | Correct remote diarization, preserved user corrections, final recognition accuracy on known speech |
| 7 — Pause/resume | Installed continuity, device changes, interruption/restart reliability |
| 8 — Brief/Full summaries | Local installed model and complete decisions/actions; historical recall ~68% versus ~80% target |
| 9 — DOCX/PDF export | Installed file/save/open behavior, document parity, long transcripts |
| 10 — Storage/deletion | Retention and deletion verification without data loss |
| 11 — Working input modes | Voice Isolation/Studio/Custom effects, not just persisted switches; follow [#335](https://github.com/raisinbran/scrb/issues/335) |
| 12 — UI/accessibility | Installed screen-reader, keyboard, scrolling, responsive behavior; #352 is now merged |
| 13 — Local/offline distribution | Seven-tool Windows app, verified models, installer/update and clean-PC offline proof |
| 14 — About/manual | **Offline manual #362 merged; processing label #360 merged**; real model inventory #361 remains blocked; installed disclosure/license truthfulness still to validate |
| 15 — Imported audio | Installed WAV/MP3/M4A/FLAC/Opus, final pass, cleanup, speaker/summary/export parity |

Other V1 gates: safe close/quit during recording or final processing remains separate under [#49](https://github.com/raisinbran/scrb/issues/49); the new label does **not** imply checkpoint resume. Mac Gate 8 long-run saved result remains **FAIL**: 7:29:58.604, 4.3469 seconds reported mic gaps, worst drift 65.81 ms versus 50 ms target; a run-specific owner interpretation of accidental AirPods handover did **not** erase the original failed report. Windows full endurance and Mac 44.1 kHz USB mic compatibility require separate evidence. No repeat eight-hour run is authorized by this handoff. See [recovery audit](three-machine-recovery-audit-20261115.md).

## 6. Process, incident and resource safeguards

- [AGENTS.md](../../AGENTS.md): exact-head Windows/macOS checks, independent **separate-session** formal GitHub review after checks, owner-authorized merge. The owner's November 18 follow-up authorizes scoped preflight and merge activities (see [#340](https://github.com/raisinbran/scrb/issues/340#issuecomment-6993657203)); it does **not** waive owner-only merge control. For each future merge verify applicable explicit authorization, successful exact-head CI and a separate-session independent formal unconditional APPROVE. An old-head review, P1 rejection or administrative hold is not authorization. No direct main push.
- [Reporting issue #358](https://github.com/raisinbran/scrb/issues/358) remains **OPEN**. Confirmed failures A-771 and later A-785 illustrate that a 12-column row **alone** does not make an original owner-facing handoff compliant. Every task including BLOCKED requires a truthful owner-facing footer and one row under [agents/usage-log](../../agents/usage-log/README.md); inaccessible model/effort/quota data must state a source-specific reason. Do not invent timestamps or meter readings.
- **Incident collision:** merged #362 owns A-780 and merged #360 owns A-781/A-782. Claims of unpublished Mac A-780/A-781 reservations remain **unverified**; known Mac A-722/A-778/A-779 and Regiurn old A-724–A-726 and newer A-727–A-730 require original-file inspection and unique renumbering before publication. Rejected #364's A-781/A-782 replacement proposal must **not** be applied. Preserve every original history and linkage; avoid unreviewed mass renumbering.
- Never use private meeting recordings/transcripts without narrow current owner approval; protect and preserve raw test evidence and all normal libraries. No accidental cleanup/reset/worktree restoration.
- Any physical test **planned** to exceed 20 minutes *including setup, processing and cleanup* requires advance owner approval. An inadvertent slight overrun is not permission for a second planned test. Do not rerun a failed physical test automatically.
- Device work should be for concrete **application-delivery** outcomes, not repeated Codex diagnostics. Use the functioning host/build path; do not weaken Electron, OS or repository security settings to bypass restrictions.

## 7. Exact next actions

1. **Phase A0 — now:** BCHEN-W10 and REGIURN confirm current Windows 11 via winver (past evidence says both Windows 11), enumerate build assets and local app backups; Mac M5 confirms old Scribe.app backup/rollback feasibility and exact native-tool provenance. Record any unsupported dependency and stop there.
2. **Phase A1 — parallel:** BCHEN-W10 completes **seven-tool Windows** staging, helper/runtime closure and verified unpacked package, followed by a **per-user installer** as a separate bounded PR. Mac M5 builds ad-hoc-signed ARM64 app in **build-only** mode, verifies native provenance and prepares a non-destructive swap/rollback procedure. REGIURN prepares clean-PC deployment; **do not relaunch old dev Electron**.
3. **After implementation merges:** freeze a **new** final candidate SHA. Produce both platform artifacts from this exact source commit with manifest-hashed helpers, tools, shared libraries and model digests. No cross-checkout binary may enter unnoticed.
4. **Milestone A:** install normally and smoke-test on **all three** computers using isolated safe test data, real backend, short verified two-track capture, and normal GUI launch **without Codex**. An unpacked Windows folder alone is only an intermediate check.
5. **Milestone B:** obtain explicit owner approval for numerical speaker, timing, seek, sync and gap thresholds before a controlled three-voice same-recording test. Score each of five M1 requirements on each installed candidate; verify restart separately. Fix only demonstrated failures in bounded reviewed PRs.
6. **After M1:** pursue V1-specific capabilities, safe quit, profiles, audio presets, summaries, imports/exports, longer Gate 8 durability and genuine installed offline operation. M1 certification does not certify all V1 requirements.

**Next deliverable:** an A0 **PASS/BLOCKED per machine** report with OS/version, candidate-source starting SHA, validated binary/model inventory, installed-app backup readiness, and scoped Windows/Mac packaging PRs. **Do not return to repeated sandbox preflights.** No new M1 recording, installed build or gate approval occurred while authoring this handoff.

## Addendum: first A0 outcomes and corrected recovery, November 18 PT

This section supersedes the original A0 **execution directions only**; it does not rewrite historic M1/V1 evidence. Authoritative bounded instructions: [issue #340 correction](https://github.com/raisinbran/scrb/issues/340#issuecomment-6994807978). These A0 observations are **owner-supplied physical-machine reports**, not cloud-executed checks. The local detailed inventories and incidents are not accessible to this GitHub connection and remain unpublished.

- **BCHEN-W10 — A0 BLOCKED for build/provenance readiness.** Microsoft identifies 26H2 build 26300.9974 as **Windows 11**, despite a reported registry ProductName saying Windows 10. One failed `winver` launch is not reason for another GUI attempt. Current checkout `1e9d207` on `cod/dev-auto-location-issue349` is dirty and must remain untouched. Node 26 on PATH is not proof the previously reported user-local Node 22.23.4 binary is absent; MSVC/CMake/Ninja not on PATH is not proof that tools under `C:\BuildTools` are absent. `scripts/package-win.ps1` places the generated staging files under `apps/desktop/build/win-stage/bin` and unpacked output under `apps/desktop/release/win-unpacked`, *per checkout*, so a missing repo-root `build/win-stage` does not prove earlier artifacts were lost. The five-model handover is separate (`scripts/stage-win-models.mjs`), and the existing capture helper is not proven package-compatible. Check only previously documented paths once, without build, install, Git reset, helper execution or whole-drive scan; otherwise plan bounded W1 restage/source verification and separate W2 installer.
- **Mac M5 — existing installation/backup preserved, A1 packaging readiness BLOCKED.** Installed Scribe.app 0.1.0 is arm64/ad-hoc-signed and the byte-identical backup also verifies. No restore was physically exercised, which is correctly a later disposable-copy rehearsal rather than reason to repeat A0. Existing staged capture helper predates available source and exact matching build provenance is missing; old installed app source SHA is unknown; the local report names an unresolved third-party notice deficiency, which must be inspected from its original evidence before a specific fix is scoped. Source `scripts/package-mac.sh` can fall back to tools in another checkout and its `--install` path removes the current app before a new copy succeeds. **No GUI, build, install, source rewriting or new recording is authorized by this A0 addendum.**
- **REGIURN — A0 NOT REPORTED** at this checkpoint. Perform its original one-time normal-host receiving, preservation and unsigned-installer-policy check, with no old dev Electron launch. No missing report is a physical-app FAIL.
- **Accounting holds:** W10 provisional A-760/A-761/A-762 are local and collide with distinct incidents on main. Mac local A-780/A-781 collide with main and A-784 collides with open PR #361. On the newer #361 branch, A-785/A-786 collide with currently open PRs #365/#366. Coordinator's earlier PR #367 provisional A-787 collided with newly advanced #361 and was renumbered on its **unmerged draft branch** to A-788, with the usage-row reference updated; this fixes only that pairwise published-branch collision, not undisclosed local reservations. Each executor must preserve original incident text and reconcile all current public/local reservations **before** its own publication. Keep [issue #358](https://github.com/raisinbran/scrb/issues/358) OPEN.

**Physical status:** BCHEN-W10 BLOCKED, Mac M5 packaging BLOCKED (backup PASS), REGIURN NOT REPORTED. No single final RC SHA, installed three-computer M1 candidate, approved B thresholds, or M1/V1 acceptance has been produced.
