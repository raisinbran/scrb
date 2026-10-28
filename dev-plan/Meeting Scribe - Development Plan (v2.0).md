# Meeting Scribe — Development Plan (v2.0)

Oct 28, 2026

Author: BJC

## Summary

Build the app in nine gated phases, proving audio capture on both machines before anything else. This plan implements V1 Requirements v1.2 and replaces Development Plan v1.3. How the work is done (Planner, skill-lessons, comment review, AI subagents) lives in the separate Development Process document.

**Authorization:** Phase 0 throwaway spikes are authorized now, in a separate scratch repository, exempt from Planner and comment review. Phase 1 starts the real repository after Gate 0 passes.

**Team:** one developer (you), assisted by AI coding agents. Every gate is approved by you.

**Main changes from v1.3**

- Sentiment, .doc export and the Python diarization runtime are removed.
- The AI stack is native only: whisper.cpp, sherpa-onnx and llama.cpp. No bundled Python.
- Meeting folders are the true copy of each meeting; the small index holds no transcript text.
- Final-pass conflicts freeze corrected words. Summaries show "May be outdated" after edits rather than tracking per-item dependencies.
- Live multi-speaker diarization is in scope, with renumbering allowed in the final pass.
- The eight team roles, three-person gate approvals and the process sections moved out or collapsed.

## Architecture

```
                    +-----------------------------+
                    |          Interface          |
                    | Live, Recordings, Speakers, |
                    | Vocabulary, Settings (React)|
                    +-----------------------------+
                                  ^
                                  | narrow IPC
                                  v
+-------------------+  control  +-----------------------------+  jobs   +----------------------+
|   Audio worker    | <-------- |          App core           | <-----> |      AI workers      |
| Meeting app + mic |           | Sessions, jobs, index,      |         | Speech: whisper.cpp  |
| Original chunks   |           | export (Tauri or Electron)  |         | Speakers: sherpa-onnx|
| Never waits on AI |           +-----------------------------+         | Summary: llama.cpp   |
+-------------------+                         |                         +----------------------+
          | writes chunks                     | transcript, summary, index        ^ reads chunks
          v                                   v                                   |
+-------------------------------------------------------------------------------------------+
|                                     Local storage                                         |
|  Meeting folders: audio chunks, transcript.json, summary.json, exports                    |
|  index.sqlite (no transcript text), models, logs                                          |
+-------------------------------------------------------------------------------------------+
```

The audio worker writes straight to disk, so a stalled or crashed AI worker can never interrupt a recording.

## Technology choices

Each choice follows common practice for local desktop AI apps. Phase 0 benchmarks confirm the model sizes.

| Area | Choice | Reason |
| --- | --- | --- |
| UI | React + TypeScript | Same in either desktop shell; largest ecosystem for AI-assisted coding |
| Desktop shell | Tauri (if the Meetily fork passes) or Electron | Decided at Gate 0 by the rule below |
| Windows capture | WASAPI process loopback for the meeting app, plus the mic; full loopback as fallback | Per-app capture is built into Windows 11 |
| macOS capture | Core Audio process taps, plus the mic | Apple's supported per-app capture API (macOS 14.2+) |
| Recording format | Opus, one file chunk every few seconds per track, original and unprocessed | About 30–60 MB per hour per track; crash-safe |
| Echo cancellation | WebRTC audio processing module | The standard open-source echo canceller, used by browsers |
| Noise suppression | RNNoise or DeepFilterNet | Free equivalents of Krisp |
| Speech recognition | whisper.cpp, quantized; a small fast model live, large-v3-turbo class for the final pass | Native, uses Apple and Windows GPUs, no Python |
| Speaker separation | sherpa-onnx segmentation and speaker-embedding models, with incremental clustering for live use | Native and offline; pyannote is used only as a quality yardstick in testing |
| Summary model | llama.cpp running a 7–9B instruct model, 4-bit quantized | Fits in about 5–6 GB; JSON-schema output keeps action tables structured |
| Index database | SQLite | Standard local database; no server |
| DOCX export | A DOCX-writing library in the shell's language | Produces true Word files |
| PDF export | The shell's built-in web engine prints the same layout | No extra converter to install |
| Installer | Tauri or Electron's own bundler: MSI/NSIS on Windows, DMG on Mac | One installer, nothing system-wide |

**Memory rule:** only one large model is loaded at a time after Stop. During recording, at most the live speech model and the live speaker model are loaded.

## Framework decision rule

Fork Meetily and move to Tauri only if every test below passes on both machines; otherwise use Electron and borrow selectively.

**Meetily (Tauri) must:**

1. Record the mic and one meeting app as separate, synced tracks on Windows 11 and on the Mac.
2. Keep recording while its transcription worker is deliberately crashed.
3. Build and install from source on both machines in under a day of effort.
4. Allow its cloud providers and analytics to be removed cleanly.
5. Show that its audio, settings, model-download and meeting-list code covers most of Phases 1–3. Judge this by requirements met, not by file count.

Pin the tested Meetily commit and record its license (MIT) in a third-party notices file.

**If it fails:** build on Electron with project-owned code, and borrow ideas or MIT-licensed files from:

- **Meeting Transcriber (pasrom):** its macOS capture package and tests.
- **Anarlog:** transcript display and word-selection components. Exclude its `enterprise/` folder.
- **Buzz:** export and model-handling approaches, as reference only.

The Windows capture adapter is written fresh in either case unless a borrowed one passes the device tests.

Recheck v1.3's notes on these projects when the spike starts, since open-source code changes quickly.

## Data and storage rules

The meeting folder is the source of truth; the index can always be rebuilt from the folders.

- Every meeting, track, chunk, segment, word, speaker and action item has a permanent ID.
- `transcript.json` stores model text and user corrections as separate layers. Display rule: a user correction always wins.
- Final-pass rule: words inside a corrected span are frozen. The final pass may realign timing around them but never replaces their text.
- Summary rule: after any transcript or speaker edit, the summary is flagged "May be outdated." Regenerating keeps user-edited summary items.
- Files are written to a temporary name, then renamed, so a crash never leaves a half-written file.
- Every file format and the index carry a version number, with a tested upgrade step for each change.
- Voice profiles store speaker embeddings (number lists), never audio clips.
- Delete removes the folder, the index entry and any cached files, then checks that nothing remains.
- Logs record events and errors only: no transcript text, no audio. Kept 14 days.

## Phases and gates

Nine phases, each ending in a gate you approve. A gate passes only with test evidence on both machines. From Phase 1 on, each phase starts by freezing the contract changes it needs; Claude Code then builds the UI against the mock backend while Codex builds the backend, and the two are merged before the gate (a user-specified split; see the Development Process and UI Specification documents).

### Phase 0: Feasibility spikes (throwaway code)

- Probe per-app capture plus mic on Windows 11 and the Mac: sync drift, device changes, sleep/wake, Bluetooth headsets, permission prompts.
- Run the Meetily fork test against the framework decision rule.
- Benchmark whisper.cpp models for live delay and final accuracy, and measure memory use.
- Prototype live diarization with sherpa-onnx on 3–6 speaker recordings and measure how often live labels are wrong or renumbered.
- Measure how much a vocabulary hint improves recognition of 20 custom terms.
- Benchmark two or three 7–9B summary models on an AMI meeting for action-item recall and memory.
- Measure Opus storage per hour and CPU load during a long recording.

**Gate 0:** synced dual-track capture works on both machines; recording survives a crashed AI worker; models fit the 6 GB budget; live diarization is usable (or the fallback below is accepted); the framework is chosen.

### Phase 1: Foundation

Create the real repository, the desktop shell, the sidebar and screens as empty shells, Light/Dark/System themes, settings storage, the index database with versioned upgrades, logging rules and an automated build on both platforms. Also set up the UI/backend agent split: the contract folder, `AGENTS.md` and `CLAUDE.md`, the branch boundary check, the mock backend framework and the `docs/handoffs/` folder.

**Gate 1:** clean install, launch, restart and settings survive; the security checklist passes (Electron: context isolation, sandbox, narrow IPC; Tauri: restricted command permissions).

### Phase 2: Recording core

Capture adapters behind one shared interface, the app picker and fallback, the mic picker, meters, start/pause/resume/stop, crash-safe chunks, crash recovery, low-disk and silent-mic warnings, synced playback, the recording indicator, and the audio settings and presets.

**Gate 2:** an 8-hour recording with pauses, a device change and a forced crash loses no saved audio and stays within the drift target.

### Phase 3: Live and final transcription

The live speech worker reading saved chunks through a bounded queue, provisional text labeled "You" or "Meeting," the final pass after Stop, word timing, click-to-play, the lag indicator, and a transcript view that stays fast at 8 hours.

**Gate 3:** live delay and memory meet targets; the final pass is measurably more accurate; killing the worker never affects recording.

### Phase 4: Speakers

Live multi-speaker diarization on the meeting track, speaker relabeling in the final pass, silently built voice profiles, confidence-gated name assignment, the Speakers screen with rename/merge/split/delete, and the location-based privacy banner.

**Gate 4:** speaker accuracy and wrong-match rate meet targets; every assignment can be undone; the banner reappears on each new recording where the rule applies.

### Phase 5: Corrections and vocabulary

Word and phrase selection during recording, the inline editor, undo/redo, separate correction layer, frozen corrected spans in the final pass, the Vocabulary screen, and vocabulary hints in later meetings.

**Gate 5:** 100% of corrections survive restarts and final passes; learned terms improve recognition without exceeding the false-replacement limit.

### Phase 6: Summaries

Structured extraction of actions, decisions, impacts and open questions; the coverage-check pass; Brief and Full narratives with the appended tables; timestamp links; section-by-section handling for long meetings; editing; the "May be outdated" flag.

**Gate 6:** on the evaluation set, action-item and decision recall and precision meet targets, and every item links to valid source text.

### Phase 7: Library, export and cleanup

The Recordings list and search, meeting detail tabs, open-folder buttons, DOCX and PDF export for transcript, summary or both, manual delete with verification, and auto-delete.

**Gate 7:** a meeting can be found, reviewed, exported in both formats with matching content, and fully deleted; auto-delete removes exactly the chosen data.

### Phase 8: Packaging and hardening

Installers, the first-launch model download with checksums, offline operation, upgrade from an older build, repeated long-session tests, accessibility checks, the About screen, the finished User Manual with screenshots, and a final security and privacy review. Manual sections are drafted at the end of each earlier phase, so Phase 8 only finishes and checks them.

**Gate 8:** every V1 completion criterion passes on installed builds on both machines, with no open recording, data-loss or privacy bugs.

## Quality targets

These are the release thresholds. Phase 0 may loosen a target only if a measurement shows it cannot be met on 16 GB hardware, and the change is written down here.

| Measure | Target |
| --- | --- |
| Lost audio | None; any gap is shown and marked |
| Mic-to-meeting sync drift | Under 100 ms over 8 hours |
| Crash recovery | All saved chunks recovered; the end point marked |
| Live transcript delay | Median 3 s or less; 95% of segments within 6 s |
| Memory during recording + live transcription | About 6 GB or less for the whole app |
| CPU during recording only (no transcription) | Under 10% average |
| Final-pass accuracy | At least 15% fewer word errors than the live pass |
| Final-pass time | No longer than the meeting itself, on a GPU-capable machine |
| Corrections preserved | 100% |
| Vocabulary false replacements | Under 1 per hour of audio |
| Speaker diarization (final) | Diarization error rate 20% or less on AMI test meetings |
| Wrong automatic voice-name match | Under 2%; below the confidence line, suggest instead |
| Action-item and decision recall | 90% or more on the evaluation set |
| Invented action items or decisions | Under 5% of items; none accepted at release review |
| Evidence links | 100% of summary items link to valid source text |
| UI responsiveness | Record, pause and stop respond within 200 ms under full AI load |
| Deletion | Nothing remains after delete or auto-delete, or the failure is reported |

## Testing and evaluation data

Every phase adds automated tests; gates also need hands-on runs on both machines.

**Test layers**

- **Unit:** correction precedence, frozen spans, vocabulary rules, the summary schema, file-format upgrades.
- **Integration:** chunk writing and recovery, queue behavior, index-versus-folder consistency, delete and auto-delete.
- **Fault injection:** worker crash, app kill, disk full, permission revoked, device unplugged, sleep/wake, pause during a device change.
- **Long run:** an 8-hour recording on each machine before Gates 2, 3 and 8.
- **Hardware:** built-in mic, USB headset, Bluetooth headset, docking station; Teams, Zoom and a browser meeting on each OS.

**Evaluation data**

- The [AMI Meeting Corpus](https://groups.inf.ed.ac.uk/ami/corpus/) (CC BY 4.0) supplies real meetings with speaker and word labels.
- Add 3–5 of your own meetings where every participant agreed to be recorded for testing.
- You mark the true action items and decisions in those meetings once; this takes a few hours.
- Keep evaluation recordings in a separate test folder, never mixed with normal meetings.
- Imported audio files are supported only inside the test harness.

## Risks and fallbacks

Live multi-speaker diarization and per-app capture are the two risks most likely to change the plan.

| Risk | Likelihood | Fallback |
| --- | --- | --- |
| Live diarization is too inaccurate or too slow | High | Live labels show "You" and "Meeting"; full speaker separation runs every 30–60 s on recent audio or only in the final pass |
| Per-app capture misses audio for some apps or devices | Medium | Whole-computer audio capture, which is already in scope |
| Models exceed the 6 GB budget on 16 GB machines | Medium | Smaller live model; diarization runs only in the final pass; summary deferred to a "run later" button |
| Recording lost through an AI or UI fault | Low after Phase 2 | Separate processes, crash-safe chunks and fault-injection tests block release |
| Corrections overwritten | Low | Frozen spans plus 100%-preservation tests |
| Summary misses or invents action items | Medium | Structured extraction, coverage pass, timestamp links, user review |
| Vocabulary hints help less than hoped | Medium | Rely more on post-recognition fixes for learned terms, still context-checked |
| Meetily fork becomes hard to maintain | Medium | Electron path with selective borrowing |
| macOS or Windows update breaks capture | Medium | Pin tested OS versions in the notes; recheck capture after each major OS update |
| Voice profiles conflict with local privacy laws | Low (personal use) | Location-based banner; profile delete button |
| Index and folders fall out of sync | Low | Rebuild the index from folders on startup when they disagree |

## Open items settled by Phase 0 measurements

No decisions remain for you before Phase 0. These items are settled by measurement and recorded at Gate 0.

- [ ] Desktop shell: Tauri (Meetily fork) or Electron.
- [ ] Exact live and final whisper.cpp model sizes.
- [ ] Live diarization method, or whether the fallback is needed.
- [ ] Summary model choice among the benchmarked 7–9B models.
- [ ] Audio chunk length and Opus bitrate.
- [ ] Voice-match confidence line that meets the under-2% wrong-match target.
- [ ] DOCX library, which follows from the shell choice.
- [ ] Any quality target that measurement shows must change, with the reason.
