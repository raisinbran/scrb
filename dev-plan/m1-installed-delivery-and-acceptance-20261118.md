# M1 plan — deliver and certify installed Scribe on three computers

**Version:** 2.1, November 18, 2026 (Pacific)  
**Status:** Two-milestone strategy independently reviewed and approved with sequencing corrections. **Phase A0 preflight authorized by the owner's November 18 follow-up** (recorded in [issue #340](https://github.com/raisinbran/scrb/issues/340#issuecomment-6993657203)); physical long tests, risky implementation, and numeric Milestone B acceptance require their separate approval gates.  
**Repository:** [raisinbran/scrb](https://github.com/raisinbran/scrb)  
**Development starting baseline:** [e0ff737f3b928283f53cd9abbd1b294bbe90e584](https://github.com/raisinbran/scrb/commit/e0ff737f3b928283f53cd9abbd1b294bbe90e584)  
**Final release-candidate (RC) SHA:** **TBD only after packaging/installer implementation PRs merge**  
**Session evidence / environment lessons:** [November 18 handoff](../docs/handoffs/2026-11-18-codex-blockers-m1-v1-installed-delivery-handoff.md)  
**M1 tracker:** [#340](https://github.com/raisinbran/scrb/issues/340)

## 1. Objective and meaning of completion

Deliver an updated, ordinarily launchable, locally operating Scribe application on **Mac M5 (Apple Silicon), BCHEN-W10 (Windows 11 despite its machine name), and REGIURN (Windows 11)**. Then measure and prove that **all five M1 behaviors work together on each installed build**.

This explicitly replaces the previous strategy of waiting for Codex-controlled **development Electron** to launch successfully. It does **not** abandon or lower M1 feature tests. Development-sandbox problems must not be mistaken for installed-app defects or used to explain away demonstrable defects.

**Milestone A — installed M1 candidates:** all three computers run the **same final approved source revision** as appropriate macOS ARM64/Windows x64 artifacts, with component provenance, native recording dependencies, models, normal GUI launch, verified isolated storage, short two-track recording, safe update/rollback. Windows needs a validated **per-user installer**; an unpacked Scribe.exe is an intermediate diagnostic, not an installed release, unless the owner explicitly permits portable deployment.

**Milestone B — M1 acceptance:** all **five** features pass a single reproducible three-voice, same-recording test **on each of the three installed machines** (15 machine-specific acceptance cells). Restart persistence is separately tested and recorded. Successful automated component tests and prior physical pilots remain valuable evidence, but do not populate the new 15-cell installed-RC matrix.

**Non-goals for this effort:** repairing all Codex desktop permissions; eight-hour Gate 8 runs; arbitrary device-switch testing; shipping a publicly distributed/signed commercial product; implementing every V1-only voice profile, audio preset or summary feature. Those have separate gates.

## 2. Two SHA identities: do not conflate them

| Identity | Rule |
| --- | --- |
| **Engineering baseline** | e0ff737f3b928283f53cd9abbd1b294bbe90e584 anchors the planning snapshot and existing merged improvements. New work starts from the latest current main as appropriate, without resetting a newer main back to this commit. |
| **Final installed RC** | Select a **new exact main commit only after** Windows seven-tool packaging, installer and necessary Mac safe-update implementation PRs have passed checks, received separate-session independent formal APPROVE reviews, and merged. |
| **Per-platform binary identity** | For both operating systems, record source RC SHA **and** separately record hashes/provenance of native capture, Whisper/sherpa/FFmpeg/llama binaries, DLL/dylib closure, model digest manifest, and final application artifact. Identical source SHA alone does not establish identical dependency inputs. |
| **Installed machine identity** | Mac M5, BCHEN-W10 and REGIURN each report actual installed app version, RC commit, package hash, verified helper/runtime components, installed model digest status, OS build, and whether older user data remains intact. Do not infer from origin/main or from a downloaded package name. |

A changed native component, dependency manifest, packaging script or source code after freeze creates a **new RC**, with an explicit reason and affected validation repeated. Mere accounting/documentation commits do not justify unplanned native rebuilds, but may change main SHA; therefore do not silently substitute a later main for the frozen RC.

## 3. Phase A0 — narrow preflight (authorized now)

**Preflight objective:** confirm that packaging can begin and existing user data can be recovered. **No recording, normal-library inspection, destructive app replacement, or repeated development GUI launches.**

| Executor | Required checks | Report |
| --- | --- | --- |
| **BCHEN-W10 — primary Windows build owner** | Fresh winver; previous [#339](https://github.com/raisinbran/scrb/pull/339) already identified Windows 11 build 26300.9974. Confirm Node 22.23.4 tool selection, MSVC/CMake/Ninja, pinned six runtime tools, 12-DLL closure/provenance, seven-tool packaging script/test availability, capture-helper source and model-handover inputs. Check staged assets rather than rebuilding them automatically. | OS build; exact baseline/main; six-tool and model artifact inventory with hashes; native helper/source readiness; explicit missing dependencies; proposed bounded implementation PRs. |
| **REGIURN — clean-PC deployment owner** | Fresh winver; [issue #327](https://github.com/raisinbran/scrb/issues/327) already records Windows 11 build 26300. Confirm ordinary host installer/shortcut access, known data backup and safe disposable test library, without triggering old development electron.exe. Identify any local Windows protection that might prevent an unsigned personal-use installer; do not change protection settings. | OS build; receiving/install readiness; preservation status; genuine host blocker, if any. |
| **Mac M5 — Mac build owner** | Confirm OS, available toolchain, the existing signed/working Scribe.app identity, non-destructive backup and restorable app copy, native helper and runtime artifacts. The existing package script can fall back to prebuilt files in another checkout; capture real source revision and SHA-256 of each input before release packaging. | OS build; working-app backup and rollback rehearsal plan; helper/tool/dylib/model manifest and source provenance; missing dependencies, if any. |
| **Coordinator** | Confirm #346/#339/#360/#362 and other already merged work are not reimplemented. Leave [#361](https://github.com/raisinbran/scrb/pull/361) excluded until corrected/reviewed. Reserve non-overlapping implementation scopes. Preserve open reporting and acceptance trackers. | A0 PASS/BLOCKED per machine, actual provenance gaps, next PR boundaries. |

**A0 PASS:** verified OS/platform suitability, existing tools/assets accounted for or explicitly missing, known-working app preserved and rollback feasible; all three machines ready for the next defined work. If REGIURN proves not to be Windows 11, stop its acceptance and obtain an explicit platform-scope decision (do not quietly relabel Windows 10 as supported).

**A0 stop rule:** one check per prerequisite; unknowns are UNKNOWN, not grounds for repeated general Codex environment debugging. Avoid host permissions, ACL, sandbox, SIP/TCC or Smart App Control changes without specific owner authorization.

## 4. Phase A1 — parallel bounded packaging implementation

### Windows workstream: BCHEN-W10 builds, REGIURN receives

**Starting assets:** Windows slice 2 merged [#339](https://github.com/raisinbran/scrb/pull/339) and demonstrated a packaged no-recording six-tool shell, six probes, 12 DLLs and a temporary-profile smoke. [#346](https://github.com/raisinbran/scrb/pull/346) merged five-model portable handover and atomic/hash-verified installer logic, but **physical handover has not been demonstrated**. REGIURN also reported a successful source build of scrb-capture.exe from historical aea9432e; it **was not executed** and must not be assumed final-RC compatible.

**Windows slice W1 — seven-tool complete runtime (focused PR):**

1. Reconcile final intended native helper source revision with current main. Reuse a source-verified existing binary only when its source, architecture and dependency closure match; rebuild if changed or unproven.
2. Add **scrb-capture.exe** as the seventh required Windows executable alongside whisper-cli, whisper-server, whisper-vad-speech-segments, scrb-sherpa, ffmpeg and ffprobe. Include local MSVC runtime dependencies when using /MD, or a separately verified /MT rebuild of helper/Opus. Do not silently switch CRT policy.
3. Extend staged dependency audit and packaged-output verifier to fail closed for missing, mismatched, unexpected or unresolvable non-system binaries and DLLs; retain hash/provenance and bundled licenses.
4. Build the complete **win-unpacked/Scribe.exe** and run controlled packaged launch, real-backend presence and missing-model refusal smoke using invented data. **No recording acceptance claim** from these tests.
5. Add invented-data regressions for corrupted/missing helper, DLL and manifest, with genuine Windows staging checks.

**Windows slice W2 — per-user installer (separate PR):**

1. Implement/test a Windows x64 NSIS per-user installation with Start-menu/Desktop launch, no administrator elevation in the normal path, and no automatic deletion/movement of recordings, models or userData.
2. Verify install, upgrade of the same app, normal launch, uninstall and preservation of the owner's data paths. Use an independent test profile; never overwrite real data as a fixture.
3. Preserve signed/unsigned distribution truthfulness; if SmartScreen/Smart App Control prevents an unsigned application, stop and request an owner decision rather than disabling system-wide security.
4. Do not call an unpacked executable a completed installation unless the owner explicitly authorizes portable deployment.

Do not conflate Scribe app startup with actual process-target Teams loopback. Prior Windows evidence reports silent communications audio for some process-loopback modes. Whole-computer capture is the bounded M1 synthetic route and **cannot certify per-app Teams capture**.

### Mac workstream: Mac M5

1. Build updated Scribe.app using **scripts/package-mac.sh in build-only mode**, with macOS ARM64 runtime tools staged and ad-hoc signatures verified. Check the entire packaged binary/dylib closure and licenses.
2. Record exact helper/Whisper/sherpa/FFmpeg/llama source and binary hashes, plus model manifest SHA-256. Existing script fallback to binary assets outside the checked-out revision is allowed **only if independently identified and accepted**.
3. Do not run the existing **--install** replacement sequence: it removes /Applications/Scribe.app before the new copy has succeeded. Add or document a safe candidate-install/backup/restore method and **prove rollback on a disposable app copy**, without changing a recording library.
4. Conduct the first candidate GUI launch in a **supported owner-host/Finder context**, not through an already denied Codex Terminal/GUI sandbox. Use an explicitly isolated user-data profile and library where supported; do not infer the backend storage identity just from passing an environment flag.
5. No new signed candidate replaces the known-working /Applications app until its isolated launch and backup/rollback gates are PASS.

**Change management:** scope W1, W2 and any Mac rollback code separately; use stacked PRs only if a tightly coupled integration genuinely exceeds an independently reviewable diff. Preserve source ownership and Electron security/IPC contracts; obtain an approved risky-change plan before crossing those boundaries. Run targeted checks then exact-head Windows/macOS CI, obtain a separate-session formal review, and merge only when the owner has authorized the relevant PR or scoped merge activity, exact-head checks pass, and a separate-session independent formal review gives an unconditional APPROVE. Do not merge P1-rejected or administrative-hold reviews just because their tests are green.

## 5. Phase A2 — select and reproduce the final RC

**Prerequisite:** all code required for the selected installed-candidate scope is merged; no pending packaging or rollback dependency.

1. Coordinator records **FINAL_RC_SHA = [new exact main commit]**, distinct from the historical development starting revision. Confirm both build workstreams take inputs from that exact source commit.
2. Build the final Windows and Mac artifacts from RC SHA, not merely previous intermediate package outputs. Reuse proven unchanged native assets only with a matching source/provenance manifest; if they cannot be established, rebuild once using the pinned toolchain and record hashes.
3. Write a **per-platform release manifest** with: source RC SHA, app version, actual build time, OS/toolchain versions, capture-helper SHA-256 and source provenance, six other tool hashes, recursive DLL/dylib closure, required model file hashes and model-digests manifest SHA-256, relevant notices, final unpacked/installer/app SHA-256, signature status, and reproducibility limitations.
4. Verify package contents against manifests *after packaging*. Test helper/tool probes without relying on developer PATH or untracked source assets; fail closed on missing dependencies. No models or private audio committed to Git.
5. Stage reviewed RC packages and model handover for transfer. If source or critical binary identity changes, mint a new RC rather than silently mixing old and new inputs.

**A2 PASS:** Mac Scribe.app and Windows installable artifact trace to the same final source SHA and separately identified native dependencies; missing-model refusal and package-manifest checks pass.

## 6. Phase A3 — safe installation and short smoke on all three PCs

| Machine | Deployment | Required checks |
| --- | --- | --- |
| **REGIURN** | Receive Windows installer and independently hash-verified five-model handover **without repo, development checkout, or Node dependency**. | Normal installed launch, exact RC identity, models hash-verify, backend storage isolated, helper readiness, safe close. |
| **BCHEN-W10** | Install the **same** Windows RC via per-user installer (not an old six-tool shell). | Same checks, plus existing-data preservation; avoid screen/speaker sleep invalidating a test. |
| **Mac M5** | Verify candidate in normal Finder/host context, then install with tested backup/restore method after confirming app is idle. | Signed package and tool closure, correct RC identity, real backend and isolated library, safe launch/quit, rollback verified. |

**Smoke for each computer, within approved duration:** check real microphone levels, correct named microphone/output device and actual meeting-audio loopback; play short public/invented reference stimuli, start one short recording, stop cleanly, and verify **two saved non-silent synchronized tracks** with the expected signal. Test data must remain separate from owner recordings. Record both source and saved audio identity where practical; mere output sound playback is not evidence of captured meeting audio. Check offline operation without opening a network service.

A normal installed launch must not invoke a dev Electron launcher or Codex environment. If the installed app reproduces a crash, preserve one new distinct diagnostic and classify it as an installed-app blocker. **Do not** make repeated attempts in the old restricted development environment.

**Milestone A PASS:** every machine has a known, updated installed app, validated runtime/model components, a real two-track short recording, preserved owner data and proven recovery path. An incomplete shell or an app that only opens **does not pass**. Record A PASS/FAIL/BLOCKED separately for each machine.

## 7. Phase B0 — preapprove a measurable M1 test contract

**No Milestone B recording begins until the owner approves the actual numbers, routing and test budget.** The values below are **proposals**, not historical owner-approved thresholds; they must be frozen *before* observing a test result. Use existing approved thresholds if applicable and document which rule takes precedence.

### Reference scenario

- **Three ground-truth voices:** one local microphone speaker (“You”), Remote A, and Remote B. Each reads **10 preassigned, clean non-overlapping turns** with unique, recognizable phrases and known reference word/turn timestamps.
- **Routing:** record actual physical/virtual microphone input, speakers/headphones output, selected meeting-audio source, audio sample rates, gain and whether Windows uses **whole-computer loopback** or **process-target** capture. Baseline testing uses whole-computer route where supported and declares that process-target Teams remains untested unless separately verified.
- **Bleed control:** prefer a reference routing arrangement that minimizes mic pickup of remote output; analyze each track against the known stimulus. If bleed prevents attribution to the correct source, classify the affected cell **NOT VERIFIED (invalid stimulus)**, not PASS or speaker-model FAIL. Do not alter original saved audio to hide bleed.
- **Reference timing:** use precisely scheduled or source-marked distinct sync sounds at the beginning and end of the test; align recorded tracks to the source schedule and report measured offset/drift, clipping and discontinuities. If a valid common timebase cannot be established, timing is NOT VERIFIED.
- **Speaker scoring:** compute **one global one-to-one mapping** between generated speaker identities and the three reference people over the whole recording, then freeze it for scoring. No remapping per turn or hiding one false speaker in a catch-all group. Score both recognizable words and speaker assignment; a count of three labels is not sufficient. Document omissions and extras.

### Proposed acceptance limits (OWNER APPROVAL PENDING)

| Item | Proposed measurable criterion |
| --- | --- |
| **Saved tracks** | Intended microphone/meeting stimuli in the correct independent saved tracks; all 30 scripted turns represented. Proposed **absolute alignment <= 250 ms**, **start-to-end relative drift <= 50 ms**, **no unexplained continuous audio gap > 100 ms**, and no clipped/missing reference turn. Measurement method, timestamp resolution and whether calibration corrects fixed device latency must be approved first. |
| **Live text and grouping** | Real text during capture. Existing repository live-text target: median <= 3 s and >= 95% within 6 s in covered windows (identify denominator/exclusions). Propose **>= 8/10 correctly attributed clean turns for each remote voice** after one global speaker mapping, with their reference phrases recognizable. Track provisional speaker label latency separately. |
| **Final text and speaker labels** | Full final pass finishes; local and two remote voices retain **three distinct mapped identities**. Propose **>= 9/10 correctly attributed clean turns per voice**, no collapse of Remote A and B, no lost/fabricated scripted turns. Preserve explicit user corrections. Report speaker-error and missing/extra word counts, not just percentage. |
| **Audible click-to-seek** | Select predefined word timestamps near the beginning, middle and end. Propose measured playback-position error **<= 500 ms** at each target, plus human/audible verification that the correct reference speech plays. A moving transport indicator alone fails this evidence requirement. |
| **Complete copy** | Use Copy entire transcript and compare against the *complete saved final transcript*, including offscreen virtualized segments. Permit only a predeclared, mechanically specified whitespace normalization; no missing/extra/duplicated words or speaker sections. A toast alone does not pass. |
| **Restart persistence (separate)** | Fully quit/relaunch normally; reopen the same saved meeting and verify audio tracks, transcript, corrections/labels and timestamp seeking remain accessible, with no data loss. |

The 250-ms alignment, 50-ms drift, 100-ms gap and 500-ms seek values above are newly proposed **test limits**, not established repository gate values. They must be either expressly approved or replaced before testing. They do **not** supersede stricter Gate 8 endurance limits. Do not weaken them after seeing results merely to obtain PASS.

**Test duration:** before executing, estimate host setup + reference playback + capture + final processing + seek/copy + inspection + cleanup. Obtain explicit owner approval if **planned total > 20 minutes**, even if recording itself is short. Do not automatically repeat a failure or exceed the approved scope.

## 8. Phase B1 — same-recording M1 acceptance, three machines

For **each** final-RC installation, execute **one** reference scenario with the *same approved script*, profile isolation, routing declaration, metrics and human/automated evidence. Retain raw audio, reference timestamps, per-turn mapping/scoring, final transcript, playback observations, full clipboard comparison and diagnostic metadata in protected local evidence. Publish only sanitized aggregate metrics.

| M1 check | Mac M5 | BCHEN-W10 | REGIURN |
| --- | --- | --- | --- |
| 1. Two separate synchronized mic and meeting tracks | NOT VERIFIED on new RC | NOT VERIFIED on new RC | NOT VERIFIED on new RC |
| 2. Live transcript, three voices grouped | NOT VERIFIED on new RC | NOT VERIFIED on new RC | NOT VERIFIED on new RC |
| 3. Complete final text and correct distinct voices | NOT VERIFIED on new RC | NOT VERIFIED on new RC | NOT VERIFIED on new RC |
| 4. Audibly correct, measured transcript seek | NOT VERIFIED on new RC | NOT VERIFIED on new RC | NOT VERIFIED on new RC |
| 5. Full saved-transcript clipboard parity | NOT VERIFIED on new RC | NOT VERIFIED on new RC | NOT VERIFIED on new RC |

**Initial score:** **0 of 15 newly verified installed-RC checks**, *without discounting* historical component evidence. Use PASS / FAIL / NOT VERIFIED in the table. For an invalid stimulus or denied platform access, retain NOT VERIFIED with a precise reason; never convert lack of evidence to a product PASS or product FAIL. Persistence is separately scored and required before final owner sign-off.

**Milestone B PASS:** all 15 cells PASS on their actual installed RCs under the preapproved thresholds, valid evidence and restart verification. An owner review then explicitly certifies M1; engineers or automated CI must not self-certify it.

## 9. Phase B2 — bounded fixes only where evidence identifies a failure

1. Classify each issue as **packaging/installation, storage identity, native capture/routing, live ASR, live diarization, final ASR/diarization, seeking/playback, clipboard/UI or external execution environment**.
2. Preserve the original failing evidence, exact tested RC identity and diagnostic. Use the narrowest invented-data/public fixture that reproduces the issue. Do not read other private meetings.
3. Make one small, owner-reviewable implementation PR per distinct defect domain. If a feature is large and tightly dependent, use individually reviewable stacked branches rather than a multi-thousand-line undifferentiated PR.
4. Run focused checks and exact-head CI on Windows/macOS **before** a separate-session formal review. Approval must be for the final head; then merge only under applicable explicit owner authorization for that PR or scoped activity. If the head changes, redo only affected checks/review.
5. Build a **new** RC from the corrected source and rerun only the failed and materially affected installed checks, preserving earlier results for unaffected components while keeping final certification tied to the final installed RC.
6. A known Codex sandbox restriction is **not** a reason to relax an actual Scribe product requirement. Do not rerun restricted GUI launchers or modify OS security without an identified, owner-approved need.

## 10. Ownership, controls and resource efficiency

- **Coordinator / cloud:** exact baseline and issue/PR inventory, manifests, release freeze, acceptance scoring contract, triage, formal review assignments and aggregate reporting. No direct private audio or physical test claims.
- **BCHEN-W10:** Windows x64 seven-tool staging and per-user installer engineering. Use verified existing artifacts and a functioning host/CLI, not repeated Codex GUI permission work.
- **REGIURN:** Windows 11 clean-host receiving/install and M1 installed validation; do not repeat the failing **development electron.exe** launch.
- **Mac M5:** native tool provenance, build-only signed app, backup and safe rollback, supported normal GUI launch, M1 installed validation.
- **Independent reviewer(s):** after CI, formally comment on each PR's current head with an explicit APPROVE or rejection and precise findings; treat original QA criticism on its merits, not as automatically correct.
- **Owner:** approve any risky scope, platform exception, physical planned >20-minute test, final B thresholds and final M1 certification. The owner's November 18 follow-up authorizes scoped preflight and merge activities (see #340), but does not grant a permanent reviewer-triggered merge delegation. Verify explicit applicable owner authority, successful exact-head CI and separate-session unconditional formal APPROVE for each PR; never merge P1 rejects or unresolved administrative holds.

Per [AGENTS.md](../AGENTS.md), every task including BLOCKED must report the actual model/effort (or source-specific unavailability), PT observations, five-hour and weekly remaining values or unavailable reason, resets/overlap, retries, outcome, new **12-column** row under [agents/usage-log](../agents/usage-log/README.md), incident disposition and staged/PR/merged status. Never infer shared-credit expenditure. [Issue #358](https://github.com/raisinbran/scrb/issues/358) stays open until genuine compliance evidence. Reconcile unpublished Mac/REGIURN incident identifiers against current main/open branches before publication; merged #360/#362 already use A-780/A-781/A-782.

Never overwrite a production library, delete evidence after a passing smoke, restart a running recording, circumvent Mac Terminal restrictions, weaken sandbox/OS security, or automatically repeat long recordings. Guard every iteration with **new observable progress**, not a task-percentage completion claim.

## 11. Follow-on V1 work — after (or independently of) M1

M1 certification is not V1 approval. Remaining V1-only work includes production returning-speaker learning with privacy/undo/delete, actual Voice Isolation/Studio/Custom processing (not just stored Settings), measured summary decision/action recall, import/export format parity, safe quit and truthful interrupted-processing behavior, reliable model inventory and updates, Mac USB 44.1-kHz compatibility, and full Gate 8 Windows/Mac duration, drift, continuity and recovery. Historical Mac Gate 8 saved result remains FAIL; do not schedule another eight-hour run without owner permission. See [V1 audit](../docs/handoffs/v1-status-and-independent-slices-20261117.md), [#49](https://github.com/raisinbran/scrb/issues/49), [#335](https://github.com/raisinbran/scrb/issues/335), and [M1 tracker #340](https://github.com/raisinbran/scrb/issues/340).

## 12. Checkpoints and decision log

| Checkpoint | Required deliverable | Who can authorize continuation |
| --- | --- | --- |
| **A0** | Windows winver x2, Mac OS and known-app backup, verified asset provenance, precise packaging gaps, one PASS/BLOCKED per machine | Owner authorized A0 in the November 18 follow-up (#340); bounded A1 begins only after verified prerequisites and applicable risky-change approvals |
| **A1** | Seven-tool Windows package and safe Mac candidate; separate per-user installer and rollback provisions, passing exact-head CI + independent formal review/merges | Verify the applicable explicit owner merge authorization for each PR or scoped activity; risky changes require separate approval |
| **A2** | New frozen FINAL_RC_SHA, reproducible or accurately qualified artifact manifests and package hashes | Coordinator verifies exact-source/dep consistency |
| **A3 / Milestone A** | All three installed builds launch/record from a normal GUI, preserve libraries, verified rollback and two tracks | Owner confirms Milestone A |
| **B0** | Approved voices/script/routing, global ID matching, exact speaker, seek, sync and gap thresholds and total test budget | **Explicit owner approval required before Milestone B tests** |
| **B1 / Milestone B** | All 15 new RC checks PASS, valid evidence, separate persistence verification | **Explicit owner M1 certification** |
| **V1** | Separate verified functional and Gate 8 requirements beyond M1 | Separate owner V1/Gate 8 acceptance |

**First action:** Execute A0 once, in parallel across the three computers, and return concrete asset/backup/platform facts. **Do not reopen the Codex environment loop or start Milestone B before its approved test contract.**
