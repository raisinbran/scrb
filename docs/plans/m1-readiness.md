# M1 readiness: what is real, what is left, how to try it

**Status:** audit, 2026-11-13, docs only. Independent review pending. Based on `main` at `097f252`. Evidence is from reading code; nothing was run, and no recordings were read. Where I trust a merged PR's claim rather than re-checking, it says so.

**M1** = a build the owner can run on real ongoing meetings (dev build, not packaged): accurate transcription, speaker grouping, corrections that become vocabulary suggestions, record + playback + export.

## 1. Feature status in the Electron app today

How the app decides: `apps/desktop/src/ui/lib/hybrid-backend.ts` sends a call to the real backend when it is in `REAL_CALLS` or names a real meeting (`MEETING_CALLS`); otherwise to the mock. `apps/desktop/src/main/backend.ts` builds the real handlers. A real-meeting call with no handler returns "This feature is not available yet" (`dispatch.ts:32`); it does not fall back to the mock.

| Feature                                                | Status                                 | Evidence                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Record (start, pause, resume, stop)                    | **Real**, opt-in by env var            | `backend.ts:58,83` builds `RecordingController` only if `SCRB_CAPTURE_HELPER` is set (not packaged); calls in `REAL_CALLS`; `e2e/real-recording.spec.ts`. Without the variable the Live screen is the mock.                                                                                                                                                                                                 |
| Live text while recording                              | **Real**, opt-in                       | `backend.ts:72-77` needs `SCRB_LIVE_CONFIG` as well; `e2e/real-live-run.spec.ts`. Whisper `small.en` in `live.json`.                                                                                                                                                                                                                                                                                        |
| Accurate final transcript                              | **Real**, opt-in                       | `backend.ts:60-70` queue needs `SCRB_FINAL_PASS_CONFIG`; large-v3-turbo model in `final-pass.json`; runs after Stop and resumes after a restart (`resumeFinalPasses`); `e2e/real-final-pass.spec.ts`. Vocabulary hints are fed to the pass (`final-pass.ts:253`, `vocabulary-hints.ts`). Their benefit is not proven (Gate 5 open, Stage 2 on hold). Accuracy on the owner's own meetings is unmeasured.    |
| Import audio file                                      | **Real**, opt-in                       | `imports.ts`, `backend.ts:104-147` (same variable); `e2e/real-import-playback.spec.ts`. Useful as a safe test path with AMI audio.                                                                                                                                                                                                                                                                          |
| Speaker grouping                                       | **Real** (final pass), live per PR log | Final pass runs the sherpa sidecar (`final-pass.json` `segmentation`, `embedding`). Live multi-speaker and name transfer to the final transcript: slices 1, 2a, 2b merged (`docs/handoffs/2026-11-11-live-diarization-slice1.md`, `live-multi-speaker-diarization-slice2b.md`). Overlapped speech is known to be lost (~61-65% of misses; Phase 4 task open). Fine for M1; expect errors in crosstalk.      |
| Speaker rename, merge, split, reassign, voice profiles | **Real**                               | `meetings.ts:386,419,497-579` (`renameSpeaker`, `mergeSpeakers`, `splitSpeaker`, `reassignSpeaker`, `listProfiles`, `deleteProfile`). `renameSpeaker`/`mergeSpeakers` are routed by `meetingIdForCall` in hybrid-backend.                                                                                                                                                                                   |
| Playback with seek and word highlight                  | **Real**                               | `playback-media.ts` (`seekAudio`, `pauseAudio`, `getPlaybackMedia`); word highlight merged in #129; `e2e/real-import-playback.spec.ts`.                                                                                                                                                                                                                                                                     |
| Transcript edits (typo, misheard), undo/redo           | **Real**                               | `meetings.ts:358` `applyCorrection`, `446/455` undo/redo; corrections survive final-pass reruns per the revision design (`docs/plans/transcript-layers-and-frozen-spans.md`).                                                                                                                                                                                                                               |
| Corrections become vocabulary suggestions              | **Real** (storage and screen)          | `meetings.ts:599-656` `listVocabularySuggestions`, `answerVocabularySuggestion`, vocabulary undo/redo, `listTerms`, `updateTerm`, `deleteTerm`; all in `REAL_CALLS`. Accepted terms feed the next final pass as hints. Not exercised in a real-app e2e spec; the first-run procedure below does this by hand. No "add a term by hand" call exists in `meetings.ts`; suggestions are the only entry path.    |
| Export (DOCX/PDF)                                      | **Missing for real meetings**          | The contract has `exportMeeting` (`packages/contracts/src/backend.ts:205`), the UI has `ExportDialog.tsx`, the renderers exist in `packages/export/src` (`renderDocx`, `renderPdf`). But no `exportMeeting` handler exists under `apps/desktop/src/main/`, so a real meeting's Export returns "not available yet". The mock only answers for mock meetings. **This is the one M1 feature that is missing.** |
| Summaries                                              | **Missing** (not in M1 list)           | `getSummary`/`updateSummaryItem` are real; `generateSummary` has no handler. `packages/summary` exists. Skip for M1 unless the owner wants it.                                                                                                                                                                                                                                                              |
| Typed-notes fill                                       | **Missing** (post-M1)                  | Plan only: PR #131.                                                                                                                                                                                                                                                                                                                                                                                         |
| Setup/model download, permissions, model updates       | **Mock**                               | Not in `REAL_CALLS`; not needed because the dev build uses the env-var files.                                                                                                                                                                                                                                                                                                                               |
| Packaged app                                           | **Not available**                      | `app.isPackaged` disables the env vars (`backend.ts:58-72`). M1 is the dev build run with `npm start`.                                                                                                                                                                                                                                                                                                      |

Mixed mode warning: if any of the three env variables is missing, parts of the app silently use the mock (fake meetings appear in the list beside real ones). The first-run procedure checks for this.

## 2. Smallest remaining tasks to M1

| #   | Task                                                                                                                                                                                                                                                                  | Hours | Side                                           | Contract change?                                                                                 | Plan first?                                                                                                                  | Parallel?                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 0   | Owner first-run on a real short test meeting (section 3). Its findings can reorder the rest.                                                                                                                                                                          | 0.5   | n/a                                            | no                                                                                               | no                                                                                                                           | Yes; do it first, and keep it going alongside everything else.                                         |
| 1   | **Real `exportMeeting`**: handler in a new `apps/desktop/src/main/export.ts` using `@scrb/export` (docx and pdf), a save-location choice, and the existing `exportFinished` event; wire the package into `apps/desktop/package.json` and `scripts/build-electron.mjs` | 5-7   | Backend                                        | Probably none (call, request and event exist). Confirm `ExportRequest`/`exportFinished` suffice. | Yes, short: it touches Electron main (PDF printing needs a hidden window), which is on the Development Process "risky" list. | Yes. Files: new `main/export.ts` (+test), `backend.ts` (spread handler), `package.json`, build script. |
| 2   | Make the dev build enable real mode with one command (a `scripts/m1.sh` that exports the three variables and runs `npm start -w @scrb/desktop`, failing loudly if a file is missing) and show a visible "mock backend" marker if any variable is unset                | 1-2   | Backend for the script; a small UI badge is UI | No                                                                                               | No                                                                                                                           | Yes. The script is a new file; the badge is `ui/shell/`. Does not touch tasks 1 or 3.                  |
| 3   | Fixes from the first run (task 0): unknown until the owner runs it. Budget a block, not a feature.                                                                                                                                                                    | 2-4   | Either; one PR per side                        | Unknown                                                                                          | Per finding                                                                                                                  | Only after task 0; avoid files tasks 1-2 touch.                                                        |
| 4   | Optional, if task 0 shows suggestions are hard to reach: an "add term" path on the Vocabulary screen                                                                                                                                                                  | 3     | UI + Backend                                   | **Yes** (new call; owner approval)                                                               | Yes                                                                                                                          | Yes, separate files from task 1 (`screens/vocabulary/*`, `meetings.ts`).                               |

Critical path: tasks 0 and 2 in parallel (about 2 h of work), then 1 (about 6 h), then 3. Roughly **1 to 1.5 working days** to M1 if the first run finds nothing serious. Until export lands, the owner can already use the app for record, transcript, speakers, corrections and playback; transcripts can be copied from the screen as a stopgap.

Not on the path (deliberately): vocabulary Stage 2, overlap-aware diarization (Phase 4 task), summaries, typed-notes fill (#131), packaging (Phase 8), Windows work.

## 3. First-run procedure (owner, Mac)

All commands: **Terminal app** (or the Terminal panel in Claude), **no admin / no sudo**. Run from the main checkout, **not** a worktree: the built capture helper, ffmpeg and sherpa sidecar exist only there (verified present 2026-11-13; the worktrees do not have `native/macos-capture/build` or `packages/transcription/.bin`).

Verified to exist: `~/scrb-dev-assets/config/live.json`, `~/scrb-dev-assets/config/final-pass.json`, every tool and model path listed inside them, `/Users/brandonchen/Documents/GitHub/scrb/native/macos-capture/build/scrb-capture`, `~/.local/share/scrb-node/current/bin/node`, and `node_modules/.bin/electron` in the main checkout. Not verified (cannot be checked without running): microphone permission and that the helper still passes `live-feed` on the latest `main`.

**Step 1. Update and set up.** Folder: `/Users/brandonchen/Documents/GitHub/scrb`. Admin: no.

```bash
cd /Users/brandonchen/Documents/GitHub/scrb && git pull --ff-only origin main
```

```bash
export PATH="$HOME/.local/share/scrb-node/current/bin:$PATH"
```

If the helper was built before the latest `main` changed `native/macos-capture`, rebuild it (folder: `native/macos-capture`, admin: no):

```bash
cd /Users/brandonchen/Documents/GitHub/scrb/native/macos-capture && ./build.sh
```

**Step 2. Start the app in real mode.** Folder: `/Users/brandonchen/Documents/GitHub/scrb`. Admin: no. This builds, then opens the app (the first start takes a minute or more). Use one Terminal window and leave it open.

```bash
cd /Users/brandonchen/Documents/GitHub/scrb && SCRB_CAPTURE_HELPER="$PWD/native/macos-capture/build/scrb-capture" SCRB_LIVE_CONFIG="$HOME/scrb-dev-assets/config/live.json" SCRB_FINAL_PASS_CONFIG="$HOME/scrb-dev-assets/config/final-pass.json" npm start -w @scrb/desktop
```

**Step 3. Check it is real, not mock.** On the Recordings screen the list should not contain pre-made sample meetings (those come from the mock; not confirmed what the mock lists, so ask if unsure). If it does, a variable is not reaching the app: close the app, re-run step 2 from the same window, and report it.

**Step 4. Record a 2-3 minute test (under the 20-minute limit).** Use an invented script or a public AMI clip played from speakers while you also talk, so that mic and system audio are both exercised. Do not use a real confidential meeting for this first test.

1. Live screen: choose microphone and the app or system source, press Start. Allow the macOS microphone prompt (and screen/audio capture prompt if shown); these are system dialogs and may ask for the Mac password, which you type yourself.
2. Speak for about a minute with at least two voices (you plus played audio). Watch live text appear.
3. Press Pause, wait 10 seconds, Resume, speak 30 more seconds, press Stop.
4. Open Recordings. The meeting shows "processing", then a final transcript (a few minutes for a short clip on large-v3-turbo; do not quit the app meanwhile).

**Step 5. Check each feature.**

- Transcript text: is it close to what was said? Note names and jargon it got wrong.
- Speakers: are two voices separated? Rename one speaker.
- Playback: press play, click a word, seek; the darker current word should follow.
- Corrections: fix one misheard word to a term (for example a name). Fix the same misheard word in a second place. Open Vocabulary: a suggestion should appear; accept it, then check Undo.
- Export: choose Export on the meeting. **Expect "not available yet" until task 1 ships.** That is a known gap, not a failure of your setup.
- Quit and reopen the app with the same command: the meeting and your corrections must still be there.

**Step 6. Report.** Send back: what worked, what broke, and the exact on-screen message for each problem, plus the Terminal window's last lines if the app crashed. Keep the test recording; do not delete it (gate-evidence policy).

For real ongoing meetings after this passes: same command, same folder. Start recording before the meeting begins and press Stop afterward; the final pass runs on Stop. Recordings of real meetings stay in `~/Documents/Meeting Scribe` on the Mac and must not be committed, shared or read by agents.

## Risks and limits

- The final pass is a heavy job (large-v3-turbo plus diarization) and runs right after Stop; starting a second recording during it is allowed by design but slower. Untested on a 1-hour meeting in the app itself (long-run tests exist for the capture helper only).
- Overlapped speech is mislabelled or lost; expect imperfect speaker grouping in lively meetings.
- Hint benefit for vocabulary is unproven (Gate 5 open). Suggestions and acceptance work; the accuracy gain is unmeasured.
- Dev build only: if `npm start` is run from a packaged build, all env variables are ignored and the mock answers.
