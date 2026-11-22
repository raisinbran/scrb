# V1 installed-app acceptance checklist — approved v1.2 requirements

**Status: SOURCE/TEST CROSSWALK ONLY — ALL INSTALLED CELLS NOT VERIFIED.**
**Source inspection checkpoint:** `main=6ce2125dadd4c624c6d3532bf595dbb2bc453eb3` (2026-11-22).
**Controlling requirements:** `dev-plan/Meeting Scribe - V1 Requirements v1.2.md`, the **15 "V1 must" functions** and the separate **14 installed-app completion checks**.
**Coordination:** issue #335 [2026-11-22 P1 instructions](https://github.com/raisinbran/scrb/issues/335#issuecomment-7082984755); V1 must be accepted on **Windows 11 and an Apple Silicon Mac**. M1's separate 3-machine **15/15** remains unchanged and must not be confused with this 14 × 2 V1 tracking matrix.

No physical host, bundled binary, private model, owner recording, eight-hour run, crash, CI rerun, installed app or end-to-end V1 workflow was used to prepare this checklist. The source and test names below were checked for existence on the stated `main` tree, **not** claimed to have passed installed acceptance. Revalidate after each future source/packaging change.

## Exit checklist: all 14 completion criteria on each installed platform

**Statuses:** PASS = genuine installed behavior and original cited evidence reviewed for the same identified release; FAIL = actual measured nonconformance; NOT VERIFIED = no admissible exact-build evidence or blocked setup. Do not convert a source unit test, AMI fixture, or old provisional build into PASS.

| ID | Installed v1.2 completion check and objective evidence | Current-main source / automated-test entry points (not acceptance) | Mac M5 | Windows 11 |
| --- | --- | --- | --- | --- |
| V01 | Clean standard-user install; first-launch required models download with verified hashes/retry/cancel; optional summary download; fully offline launch, capture/transcribe/summary/export without account/network after setup; packaged runtimes and licenses verified. | `apps/desktop/src/main/{packaged-setup,model-download,setup-status}.ts`; `apps/desktop/src/main/{packaged-setup,model-download}.test.ts`; `apps/desktop/src/ui/screens/model-download.test.tsx` | NOT VERIFIED | NOT VERIFIED |
| V02 | Real non-silent, independent mic and selected meeting-app tracks with synchronized timestamps and audible correct source selection; whole-system fallback separately declared; no plug-in/bot or source-app modification; retain unprocessed originals. | `apps/desktop/src/main/{recording,sources}.ts`; `apps/desktop/src/main/recording.test.ts`; `native/{macos,windows}-capture/` | NOT VERIFIED | NOT VERIFIED |
| V03 | **Eight-hour** installed run with pause/resume and correctly marked gaps, drift, continuous original audio, Stop/final processing, and separately induced safe forced-crash recovery of saved chunks; distinguish crash from normal stop. No run before separate duration/safety permission. | `packages/app-core/src/{recording,recovery}.ts` and `{recording,recovery}.test.ts`; `docs/plans/pause-resume.md`; Gate 8 evidence | NOT VERIFIED | NOT VERIFIED |
| V04 | Real live **two different remote speakers** grouped, provisional labels, and editable text while capture continues. Verify selection/undo, playback alignment, view across tabs, and no recording interruption. Preserve the M1 30-turn B0 gate separately. | `apps/desktop/src/main/live-feed.ts`; `packages/transcription/src/meetingDiarizer.ts`; `apps/desktop/src/ui/screens/LiveScreen.tsx`; `apps/desktop/src/ui/screens/LiveScreen.test.tsx`; `apps/desktop/src/main/live-feed.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V05 | Import **WAV, MP3, M4A, FLAC and Opus** into ordinary saved meetings; final diarization, correction, optional profile opt-in (default off), transcript seek, summary and exports; cancel/fail leaves no meeting or temp debris, preserves original file, never preempts active capture unsafely. No live/pause/dual-track claims for finished single-source imports. | `apps/desktop/src/main/imports.test.ts`; `packages/transcription/test/import.test.ts`; `apps/desktop/e2e/real-import-playback.spec.ts` | NOT VERIFIED | NOT VERIFIED |
| V06 | Remember/correct vocabulary across **two separate recordings** with context-safe recognition; silently grow speaker profiles under privacy policy, recognize the same returning voice reliably, allow profile rename/merge/delete and verify its voice data removed after restart. Seeded profiles alone do not count. | `packages/app-core/src/{vocabulary-hints,profile-matching}.ts`; `packages/app-core/src/{vocabulary-hints,profile-matching}.test.ts`; `packages/storage/src/db/voice-profiles.ts`; `packages/transcription/test/profiles.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V07 | A privacy-law location selected during onboarding/settings prompts a nondismissable-for-future-recordings, per-recording voice-profile banner; dismissal is per session; location changes alter eligibility correctly; recorded original remains local. | `apps/desktop/src/main/backend.ts`; `packages/app-core/src/settings.ts`; `apps/desktop/src/ui/screens/SettingsScreen.tsx` | NOT VERIFIED | NOT VERIFIED |
| V08 | User-confirmed live/final corrections remain unchanged through the higher-accuracy final pass, edits and restarts; verify original text/timing and undo recovery; final word and speaker labels accurately correspond to reference voices. | `packages/storage/src/corrections.ts`; `packages/storage/test/corrections.test.ts`; `packages/app-core/src/final-pass.test.ts`; `packages/transcription/test/final-pass-speakers.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V09 | From transcript words at beginning/middle/end and after restart, real audible seek reaches intended mic/meeting voice within approved timing tolerance; not merely a moving time indicator; verify preserved audio and access after corrections. | `apps/desktop/src/main/playback-deletion.test.ts`; `apps/desktop/e2e/real-import-playback.spec.ts` | NOT VERIFIED | NOT VERIFIED |
| V10 | Generate **Brief** (≤3 body paragraphs) and **Full** (1–2 page body) on finalized transcript. Each must include **complete action-item and decision tables**, accurate timestamp-linked playable source, unknown fields not invented, editing preserved and outdated warning/re-generation. Verify real local model/long-text behavior, not only summary presence. | `packages/summary/src/{extract,evidence}.ts`; `apps/desktop/src/main/summary.test.ts`; `packages/app-core/src/summary.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V11 | Export **Transcript**, **Summary** and **Both**, each as **DOCX and PDF** (six combinations). Check parity, layout/metadata/long content/corrections, file open and read-back on installed host, including imported meetings. | `packages/export/src/{render-docx,render-pdf,layout}.ts`; `packages/export/test/{parity,pdf,layout}.test.ts`; `apps/desktop/src/main/export.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V12 | Open actual meeting/audio folders in OS file explorer; complete manual meeting deletion; auto-delete Never/30/90/180 days/one-year with audio-only vs entire-meeting scopes and preservation of unrelated data; verify actual filesystem after restart. No synthetic mock picker called a real library move. | `packages/storage/src/library.ts`; `packages/storage/test/library.test.ts`; `apps/desktop/src/main/playback-deletion.test.ts` | NOT VERIFIED | NOT VERIFIED |
| V13 | **Functioning** Voice Isolation, Studio, Custom and each supporting microphone toggle must change **recognition-copy processing** measurably while saving untouched originals; check no physical output attenuation, doubled voice suppression or broken drift. Verify mic/test/device controls, Light/Dark/System, sidebar/layout/keyboard, and applicable performance/quality targets. Stored flags and unavailable disclosures are **NOT** functional PASS. | `apps/desktop/src/ui/screens/settings/{AudioSection,presets}.tsx` (preset module is `presets.ts`); `apps/desktop/src/ui/theme/ThemeProvider.tsx`; `apps/desktop/src/ui/screens/screens.test.tsx`; `docs/gates/gate-8-input-settings-acceptance.md` | NOT VERIFIED | NOT VERIFIED |
| V14 | Packaged About shows **actual build/version/date, installed model names/versions, author/copyright, privacy/local-data statement and complete licenses**; offline searchable built-in manual, navigation, F1, help links, keyboard/screen reader and installed UI match exactly that release. | `apps/desktop/src/ui/screens/{HelpScreen.tsx,HelpScreen.test.tsx}`; `docs/user-manual/README.md`; `apps/desktop/src/main/backend.ts`; merged #361 About model inventory | NOT VERIFIED | NOT VERIFIED |

**Tracking summary:** Mac **0/14 VERIFIED**, Windows 11 **0/14 VERIFIED**, aggregate **0/28**. This is a lack-of-installed-evidence score, **not** 28 measured failures. No requirement is waived when a host is unavailable. M1 remains independently 0/15 unless its own accepted final-RC evidence changes.

## Mapping the 15 distinct "V1 must" functions

| Must # | Requirement | Installed completion ID(s) |
| --- | --- | --- |
| 1 | Separate synchronized mic + meeting app tracks | V02, V03 |
| 2 | Live true multi-remote-speaker grouping | V04 |
| 3 | Edit live transcript without interrupting recording | V04, V08 |
| 4 | Learn approved corrections for future meetings | V06 |
| 5 | Silently grow/reuse returning speaker profiles | V06, V07 |
| 6 | Higher-accuracy final pass never overwrites corrections | V08 |
| 7 | Pause and resume | V03 |
| 8 | Optional Brief/Full summaries with complete tables | V10 |
| 9 | Transcript/summary/both DOCX + PDF | V11 |
| 10 | Local files, manual deletion and user-configured retention | V12 |
| 11 | Actual functional Voice Isolation/Studio/Custom | V13 |
| 12 | Light/Dark/System and resizable sidebar/workspace | V13 |
| 13 | Fully offline once models downloaded | V01 |
| 14 | True installed-version About and searchable offline manual | V14 |
| 15 | Audio-file import with final meeting parity | V05, V08–V12 |

## Additional v1.2 non-checklist commitments — do not lose in the matrix

- **Model lifecycle:** v1.2's install/update section requires manual model-update checks, staging a verified new model beside the existing one, trial on a prior meeting, one-click rollback and a warning before speaker-model invalidation. Those are **NOT VERIFIED / currently unavailable**, and should not be replaced with fake mock actions. UI-only #335 Scope 1 is truthful disclosure, not V1 model-lifecycle fulfillment. Track as `X01=NOT VERIFIED` per platform until an owner-approved real update/rollback implementation.
- **Audio settings:** input sensitivity/Automatic, noise suppression Off/Standard/Strong, AEC, AGC, bypass, advanced VAD, no-audio warning, device suggestions; V1 requirement is their **measured functional effects** and untouched originals. Refer to #335/#338 and Gate 8, not simply saved Settings values.
- **Integrity/resource/privacy:** recording priority over transcription, app memory target ~6 GB, recording interruption/crash boundaries, a visible truthful lag/processing status (#360/#423 source merged), original no-loss logs, and local-only storage/permissions. Each relevant row requires actual installed evidence, not a new abstract performance PASS.
- **Known open source/acceptance gaps:** true returning-profile growth/recognition, measured remote-speaker grouping, summary complete recall, genuine export/import/file-format parity, actual voice DSP, real manually pinned model updates and rollback, true build date/licenses, complete offline manual/installed QA; the 2026-11-17 audit is historical and not a current installation certification. Preserve separately owner-approved milestones and do not revive an already merged #423 indicator implementation.

## Evidence intake — identical discipline on Mac and Windows

For **every** V01–V14 per-host verdict, store locally:
`requirement_id | OS/device | source_sha | package SHA-256 | installed executable/bundle SHA-256 | helper/model manifests | run/capture ID | actual operation | measured result + threshold and denominator | PASS/FAIL/NOT VERIFIED | raw evidence location | owner/reviewer disposition`.

- Verify source identity **separately** from each platform's package and tool/model hashes. Matching app version is not binary equivalence. Do not use older provisional Mac/Windows builds as final-source V1 evidence.
- Use a disposable OS user/library/profile where needed; never overwrite the owner recording library. Retain original audio, transcript, logs and failed-run evidence. A failed cell triggers a bounded causal follow-up, **not** blanket reruns.
- Plan Windows 11 and current Apple Silicon macOS runs independently; BCHEN-W10 needs a verified Windows 11 build/runtime before Windows 11 is claimed. REGIURN is unavailable and receives no work while unavailable.
- For imported files, explicitly score every named format and separate decode/speaker/profile/correction/summary/export/cleanup stages. Live/pause/mic requirements do not apply to a finished one-track import.
- For eight-hour endurance, forced crash, microphone-output measurement and physical DSP, set up safe known-input fixtures and the owner's controls; synthetic/AMI runs are supporting research, not installed V1 PASS.
- Use actual installed GUI, real clipboard, audible seek, manual/offline pages and persisted data. Include accessibility (keyboard, screen reader, focus, 200% zoom) and complete virtualized transcript. No hidden shortcuts through mock data.
- In each test authorization, list **setup + capture/import + processing + review/verification + cleanup = total**. **Any newly planned total >20 minutes requires separate task-specific owner approval beforehand**. A long or destructive test may need approval even below 20 minutes. No automatic four/eight-hour run, shutdown stress, model download, owner audio or device tests.
- Order: source fixes → exact-head cross-platform CI → independent formal GitHub review → explicit owner merge permission → source freeze → per-platform package identity → isolated safety → specific owner test budget → installed measurements → owner V1 acceptance. **M1 physical packaging and two-remote-voice acceptance remain higher priority.**

**Current workstream boundaries:** V1-A Scope 1 = isolated UI-only controls in draft PR #436. V1-A Scope 2 = separate audio Settings disclosure; safe-quit #49 = protected owner decision (no implementation permission yet); V1-C #338 = safe speech feasibility and optional offline recognition-copy prototype; V1-D = this checklist only. PR #423 was already merged; no duplicate processing status work.
