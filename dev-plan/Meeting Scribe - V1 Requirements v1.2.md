# Meeting Scribe — V1 Requirements (v1.2)

Oct 28, 2026

Author: BJC

## Status and purpose

This is the approved V1 requirements baseline. It supersedes `Call_Transcriber_Implementation_Plan.md` v1.1. Development is authorized only as described in the companion Development Plan v2.0, starting with throwaway Phase 0 spikes.

Meeting Scribe is a personal, solo-developed desktop tool for Windows 11 and Apple Silicon Macs. It records online meetings without a bot or plugin, transcribes them live with speaker separation, learns from corrections, and produces summaries. Everything stays on the local computer. License: © 2026 BJC, all rights reserved; personal use only. Borrowed code and models keep their own licenses, listed in the third-party notices.

**Changes from v1.1**

| Area | v1.1 | v1.2 |
| --- | --- | --- |
| Sentiment observations | V1 feature | Deferred past V1 |
| Legacy .doc export | Required | Removed; DOCX and PDF only |
| Platforms | Windows 10/11, macOS 14.2+ | Windows 11; Apple Silicon (M1+) on current macOS |
| System audio | Whole output mix | Per-app capture with whole-system fallback |
| Pause/resume | Optional | Required |
| Summary lengths | Concise / Standard / Detailed | Brief (email length) and Full (1–2 pages) |
| Voice profiles | User-confirmed only | Built silently; deletable; privacy banner where applicable |
| Storage | SQLite holds transcripts; JSON duplicates | Per-meeting folder is the true copy; small index holds no transcript text |
| Retention | Until manual deletion | Plus optional auto-delete (audio only, or everything) |
| Install | Unspecified | One installer; models downloaded on first launch |
| Distribution | Unspecified | Personal/internal only |

**Amendment, Oct 29, 2026 (owner approved):** audio-file import moved from "Not in V1" to a V1 feature. See V1 item 15 and "Audio file import."

## V1 requirements and non-goals

**V1 must:**

1. Capture the microphone and a selected meeting app's audio at the same time, as separate synchronized tracks.
2. Show a live transcript grouped by speaker, using true live multi-speaker diarization. Live labels are provisional and may change in the final pass.
3. Let the user select and correct words or phrases during recording without interrupting capture.
4. Remember approved corrections for future meetings.
5. Recognize returning speakers across meetings using silently built voice profiles.
6. Run a higher-accuracy final pass that never overwrites user-confirmed edits.
7. Support pause and resume.
8. Offer an optional summary in two lengths, always followed by a complete action-item and decision table.
9. Export the transcript and the summary, separately or together, to DOCX and PDF.
10. Keep files locally until the user deletes them or a user-set auto-delete period expires.
11. Provide Voice Isolation, Studio and Custom audio presets in Settings.
12. Offer Light, Dark and System themes, with a Discord-style sidebar and resizable panels.
13. Work fully offline once installed and models are downloaded.
14. Include an About screen and a built-in, searchable User Manual that work offline.
15. Import an existing meeting audio file and transcribe it to the same requirements as a recorded meeting, except where they cannot apply to a finished file.

**Not in V1:**

- Participant sentiment or tone analysis.
- Legacy .doc export.
- Importing video files. Audio file import is in V1; see "Audio file import."
- Meeting bots, plugins, calendar links or automatic meeting joins.
- Cloud transcription, cloud summaries or accounts.
- Whole-library export or import. "Open folder" buttons replace it.
- Mobile, web, Intel Mac or Windows 10 support.
- Model fine-tuning from corrections.
- Public distribution, paid code-signing or auto-updates.

## Platform and hardware baseline

| Item | Requirement |
| --- | --- |
| Windows | Windows 11 only |
| macOS | Apple Silicon (M1 or newer) on the newest macOS the M1 supports; 14.2 is the technical floor for the audio-capture API |
| Memory target | Runs well on 16 GB RAM, apart from rare edge cases |
| App memory budget | About 6 GB or less during recording plus live transcription |
| GPU | Used when available (Apple GPU on Mac, NVIDIA or other GPUs on Windows); never required |
| Meeting length | Up to 8 hours; usually 0.5 to 2 hours, rarely over 4 |
| Resource behavior | Background processing at lower priority; models unloaded when idle; never all models at once |

Recording has absolute priority. Under heavy load, live transcription may fall behind, but the recording never does.

## Audio capture and audio settings

The app records the way Teams' recording feature appears to: your microphone plus the meeting's audio, captured on your own computer.

**Capture**

- An app picker selects the meeting app (Teams, Zoom, Webex, Discord, a browser). It defaults to the last used app.
- "Whole computer audio" is the fallback. It also covers browser meetings, where per-app capture records the entire browser, including other tabs.
- The microphone is always recorded as its own track.
- The app never changes the meeting app's settings or what other participants hear.
- Each track keeps an unprocessed original. Presets affect only the copy sent to the transcriber, so a bad setting can be fixed later by reprocessing.

**Settings (Discord-style)**

| Setting | Behavior in this app |
| --- | --- |
| Input device and output source | Mic picker and meeting-app picker, with live level meters and a mic test |
| Input sensitivity (0 to −100 dB slider, plus Automatic) | Sets what the transcriber treats as speech. Never cuts audio from the recording. |
| Noise suppression | Off / Standard / Strong, using a free model (RNNoise or DeepFilterNet class) |
| Echo cancellation | On by default; prevents the mic from re-transcribing remote voices when not on a headset |
| Automatic gain control | Toggle |
| Advanced voice activity | Toggle for the transcriber's speech detection |
| Bypass system audio input processing | Toggle; skips Windows or macOS mic enhancements |
| No audio detected warning | On by default |
| Audio device suggestions | Prompt when a new device is plugged in, including mid-meeting |

**Presets**

- **Voice Isolation:** strong noise suppression, echo cancellation and automatic gain control on.
- **Studio:** all processing off.
- **Custom:** individual toggles above.

Excluded from Discord: push to talk, voice-channel warnings, quality of service and global attenuation. Global attenuation would lower other apps' volume, which this app must never do.

## Recording integrity and pause/resume

No audio may be lost silently. If a gap ever occurs, the app shows it and marks it in the meeting.

- Audio is saved continuously in short compressed chunks (Opus, about 30–60 MB per hour per track). Nothing waits until Stop.
- After a crash, the app recovers every saved chunk and marks exactly where the recording ended.
- Pause stops writing audio on both tracks and shows a clear "Paused" state. The transcript records the paused span. Resume continues the same meeting with tracks kept in sync.
- Live transcription can lag, restart or fail without affecting the recording. Recording health and transcription lag are shown separately.
- The app warns about low disk space, missing permissions, a silent mic and device changes.
- A small, always-visible recording indicator serves as the passive recording notice.

## Transcription, diarization and speaker profiles

**Two passes**

- **Live pass:** shows speaker-grouped text within about 3 seconds. Text is marked provisional.
- **Final pass:** after Stop, reprocesses the whole meeting for better words, punctuation, timing and speaker labels. Corrected words are frozen and never replaced.
- The transcript keeps the spoken words. It is never paraphrased.

**Speakers**

- Live diarization separates multiple speakers on the meeting track. Your mic track is labeled "You."
- Unknown voices appear as Speaker 1, Speaker 2, and so on. Live labels may be renumbered or merged in the final pass.
- The user can rename, merge, split and reassign speakers at any time.
- Names come only from voice profiles. The app cannot read participant names from the meeting software.

**Voice profiles**

- Profiles are built silently from each meeting's voices and grow more accurate over time.
- When a profile has a name, the app assigns it automatically only above a tested confidence level. Below it, the app suggests the match or leaves the speaker unknown.
- The Speakers screen lists every profile with rename, merge and **Delete** buttons. Deleting a profile removes its voice data.

**Privacy banner**

- At the start of each recording, a quiet banner notes that voice profiles are being built, when the device appears to be in a place with biometric-privacy laws.
- The banner can be dismissed for that session but cannot be turned off. It returns at every new recording.
- "Appears to be" comes from a question at first launch. Outside the US, the app uses the OS country setting. In the US, the user picks their state of residence or the state they most often work from, so the banner shows in the US only when that state is on the list. Choosing a listed state, such as Illinois, shows a short warning directly under that option. The choice can be changed later in Settings.
- The jurisdiction list is a plain settings file that can be edited, starting with the EU/EEA, UK, Illinois, Texas, Washington, California and Colorado.

## Audio file import

The user can import a finished recording of a meeting from the Recordings screen. It becomes an ordinary meeting.

- **Formats:** WAV, MP3, M4A, FLAC and Opus audio files. Video files are not accepted.
- **What applies:** the final pass, multi-speaker diarization, speaker renaming and merging, voice-profile naming, corrections and frozen words, vocabulary hints, summaries, synced playback, search, export, delete and auto-delete.
- **What does not apply:** capture and device handling, the live pass, pause and resume, drift, and audio presets.
- **Speakers:** a file is treated as one meeting track, so there is no automatic "You" label. The user's own voice is named through their voice profile like anyone else's. A stereo file is not split into mic and meeting tracks.
- **Storage:** the file is converted to the app's audio format in the meeting's `audio/meeting/` folder. The original file is never changed or deleted. The meeting's date defaults to the file's date and can be edited.
- **Voice profiles:** an imported file can hold voices of people who never knew they would be profiled, so building or growing profiles from it is **off by default** and chosen per file. Existing profiles may still suggest and assign names. When the user turns profile building on, the privacy banner shows under the same location rule as a recording.
- **Progress and failure:** the import shows progress and can be cancelled. A failed or cancelled import leaves no meeting behind, and an unreadable file gets a plain-language reason. A recording in progress keeps priority: an import may not start or continue in a way that risks it.

## Corrections and vocabulary

Corrections are saved as reversible vocabulary entries, not as model retraining.

1. Selecting a word or phrase opens a small editor. Recording continues and new text keeps arriving without moving the selection.
2. The original text, timing and audio link are kept beside the correction.
3. With **Remember correction** on, the term goes to the Vocabulary list with its correct spelling, the misheard versions and surrounding context.
4. Later meetings use the list to bias recognition and to make cautious, context-aware fixes. An entry is never a blind find-and-replace.
5. Every entry can be edited, disabled or deleted. Undo and redo work on all edits.

Whisper-family models accept only a short vocabulary hint, especially during live transcription. Phase 0 measures how much this helps before Phase 5 relies on it.

## Post-meeting summary

After the final pass, a **Generate Summary** button creates an optional summary from the finalized transcript. It can be rerun after edits.

| Length | Body | Always appended |
| --- | --- | --- |
| **Brief** | Up to 3 paragraphs, suitable for an email | Action-item table and decision table |
| **Full** | 1–2 pages: overview, main topics, critical decisions, project-impacting developments, open questions | Action-item table and decision table |

The tables do not count toward the length limit. Every detectable action item and critical decision appears in both lengths.

**Action-item table:** action, owner, deadline, status and source timestamp. Unknown details read "Not specified" or "Unconfirmed."

**Decision table:** decision, status (decided, proposed, tentatively agreed or unresolved), impact area (scope, schedule, cost, risk, deliverables or technical approach) and source timestamp.

**Safeguards**

- Records are extracted into a structured list first, then written as prose.
- A second pass checks the whole transcript for missed items and removes duplicates.
- Every item links to a playable timestamp.
- An inferred impact is never presented as a confirmed decision. Unclear owners or dates are flagged, never invented.
- Long meetings are summarized in sections, then combined and checked against the source.
- The summary and its tables can be edited. Edited items are protected when regenerating.
- After transcript edits, the summary shows "May be outdated — regenerate?"

## Storage, privacy and retention

Each meeting's folder is the true copy of that meeting. Transcript text exists only there.

```
MeetingScribe/                  (user-selectable location)
├── meetings/
│   └── 2026-10-28 Project sync/
│       ├── audio/microphone/   original chunks
│       ├── audio/meeting/      original chunks
│       ├── transcript.json     words, speakers, timing, corrections
│       ├── summary.json        summary and action/decision tables
│       └── exports/            DOCX and PDF files
├── index.sqlite                titles, dates, file locations, settings,
│                               vocabulary, voice profiles (no transcript text)
├── models/
└── logs/                       no transcript text or audio; kept 14 days
```

- **Encryption:** relies on BitLocker (Windows) or FileVault (macOS). No separate app encryption.
- **Open folder buttons:** each meeting has "Open meeting folder" and "Open audio folder" buttons that open the location in File Explorer or Finder.
- **Auto-delete:** a Settings choice of 30 days, 90 days, 180 days, 1 year or Never (default Never). A second choice selects what is deleted: audio only, or the whole meeting.
- **Manual delete:** removes a meeting's folder and its index entry, then confirms nothing is left behind.
- **Search:** searches meeting titles and dates from the index, and transcript text by reading the meeting files.

## Export

The user exports **Transcript**, **Summary** or **Both**, as DOCX or PDF. Both formats come from one shared document layout, so they contain the same information.

- **Transcript options:** title, date, duration, speaker names, timestamps, and whether to show corrections.
- **Summary options:** Brief or Full, the action-item and decision tables (always included), open questions and source timestamps.
- Exports are saved into the meeting's `exports/` folder, and the app offers to open it.

## Interface and workflow

The layout uses a Discord-style left sidebar and an AutoCAD-style resizable workspace with a collapsible inspector panel.

| Screen | Purpose |
| --- | --- |
| **Live** | Start, pause, resume and stop; meeting-app and mic pickers; level meters; elapsed time; live transcript; inline correction |
| **Recordings** | Meeting list with search; meeting detail with Transcript, Summary and Audio tabs; open-folder buttons; export; delete |
| **Speakers** | Voice profiles with rename, merge and delete |
| **Vocabulary** | Learned terms with edit, disable and delete |
| **Settings** | Audio and presets, transcription quality, models, summary defaults, storage location, auto-delete, location for the privacy banner, theme |
| **Help** | User Manual and About, at the bottom of the sidebar and in the Help menu |

**Live transcript behavior**

- Provisional, final and user-corrected text look visibly different.
- Auto-scroll pauses when the user scrolls up or edits. A **Jump to Live** button returns to the latest text.
- Clicking any text plays the matching audio.
- Errors in transcription never look like the recording has stopped.
- Fonts can be resized, the full workflow works by keyboard, and focus is always visible.

**Typical meeting**

1. Open the app. The last mic, meeting app and preset are restored.
2. Press Start. The recording indicator appears, along with the privacy banner where applicable.
3. Watch and correct the live transcript. Pause and resume as needed.
4. Press Stop. The final pass runs, then the summary model can run.
5. Review the transcript and speakers, then generate a Brief or Full summary.
6. Export, or use the open-folder buttons.

**About screen**

- App name (Meeting Scribe), version and build date.
- Author and copyright: © 2026 BJC, all rights reserved; personal use only. Shown above the third-party notices.
- The speech, speaker and summary models in use, with their versions.
- A statement that recordings, transcripts and voice profiles stay on this computer.
- Third-party licenses and notices, viewable in the app.
- An "Open logs folder" button for troubleshooting.

**User Manual**

- Built into the app as local pages, so it works offline. It opens from Help or with F1.
- Searchable, with a contents list and links from relevant screens (for example, a "?" next to the audio presets opens that section).
- Sections: getting started and permissions; recording, pausing and choosing the meeting app; correcting the transcript and the Vocabulary list; speakers, voice profiles and the privacy banner; summaries; exporting and open-folder buttons; audio settings and presets; storage and auto-delete; model updates; troubleshooting (no audio, permission denied, transcription lagging, crash recovery); keyboard shortcuts.
- Written in plain language, with screenshots added in Phase 8.
- Updated in every release that changes behavior, and versioned with the app.

## Install and updates

One installer per platform sets up everything the app needs. Nothing is installed system-wide.

- The installer bundles the app and its runtimes. There is no separate Python, Node or other tool to install.
- On first launch, a setup screen downloads the speech, speaker and summary models with a progress bar and size estimate. Checksums confirm each download. The same screen asks US users for their state of residence or main work state, for the privacy banner.
- After setup, the app runs fully offline.
- Updates are manual: install a newer build. Dependencies are pinned in each build and never updated individually inside the app. There is no plugin system.
- Builds are unsigned or self-signed for personal use. Windows SmartScreen and macOS Gatekeeper show a one-time warning that must be approved.

**Model updates**

- Settings has a **Check for model updates** button. Nothing updates automatically.
- A new model downloads alongside the current one and can be tried on a past meeting before switching.
- **Revert to previous model** is always one click away.
- If a new speaker model would invalidate voice profiles, the app warns first and offers to rebuild profiles from stored meetings.

## V1 completion criteria

V1 is done when each item below works on the installed app, on both a Windows 11 PC and an Apple Silicon Mac.

- [ ] Installs with one installer, downloads models on first launch, then runs offline with no account.
- [ ] Records the mic and a selected meeting app (or whole-computer audio) as synced tracks, with no meeting-app plugin.
- [ ] Records 8 hours with pause/resume, without losing audio, and recovers after a forced crash.
- [ ] Shows a live multi-speaker transcript that can be corrected without stopping the recording.
- [ ] Imports a supported audio file into a meeting with a final transcript, speakers, corrections, summary and export; a cancelled or failed import leaves nothing behind.
- [ ] Reuses learned vocabulary and recognizes returning speakers from silently built profiles; profiles can be deleted.
- [ ] Shows the privacy banner at each new recording where the location rule applies.
- [ ] Produces a final transcript that keeps every user correction.
- [ ] Plays audio from any point in the transcript.
- [ ] Generates Brief and Full summaries, each with complete action-item and decision tables linked to timestamps.
- [ ] Exports transcript, summary or both to DOCX and PDF.
- [ ] Opens meeting and audio folders, deletes meetings fully, and auto-deletes on the chosen schedule.
- [ ] Offers the three audio presets and Light/Dark/System themes, and stays within the quality targets in the Development Plan.
- [ ] Shows an About screen and a User Manual that matches the installed version.
