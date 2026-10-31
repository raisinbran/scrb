# Meeting Scribe — V1 User Manual (draft)

**Draft for Gate 8.** Describes intended V1 behavior from Requirements v1.2, not a claim every feature is implemented in the present development build. Replace screenshot markers, verify installed Windows/macOS controls, and link from the Help screen before release. Personal/offline use; built for Windows 11 and Apple Silicon macOS.

## Contents

1. Setup and permissions
2. Record a meeting
3. Choose audio sources and mic quality
4. Watch, correct and navigate the transcript
5. Pause, resume, recover and find missing audio
6. Import existing audio
7. Speakers and voice profiles
8. Vocabulary
9. Summaries and critical decisions
10. Review, search and play back recordings
11. Export Word and PDF
12. Library storage, privacy and retention
13. Models and offline operation
14. Troubleshooting and keyboard shortcuts

## 1. Install and first launch

Install the build for your OS. Open Meeting Scribe, review the first-launch setup screen and download the required local models. Verify model sizes and progress before proceeding. Grant the operating-system microphone and meeting-audio permissions when prompted. On Windows, choose the correct microphone/input device; on macOS, approve the requested system audio capture if the OS asks. If permission is refused, change it in OS Settings and retry rather than restarting a recording blindly. Choose your US state of residence/main work, or use your computer's country setting outside the US, for the privacy reminder.

**[Screenshot pending: initial setup and permissions, Windows/macOS]**

## 2. Start and stop recording

Open **Live**. Confirm the meeting app and microphone. Make sure the meters move as expected and that all participants know recording is underway where required. Choose **Start**. The recording status changes to recording; elapsed time and warnings appear. Original microphone and meeting audio are saved on separate synchronized tracks. Use **Stop** to seal the recording. The local final transcription then revisits the recording for accuracy. Closing the window should stop capture safely; verify status before powering off.

**[Screenshot pending: Live toolbar, sources and meters]**

## 3. Audio source and quality

Choose an input microphone or follow the current system default. For meeting audio, choose a supported meeting app/browser or explicitly opt into **Whole computer audio** if that is necessary. Whole-computer capture is never enabled without your action. The **Audio presets** balance voice clarity and processing; review advanced controls only if needed. **Test mic** checks levels while idle without saving a meeting. Changing the meeting app while recording may require stopping and starting a new recording. Bluetooth hands-free microphones can reduce quality; prefer a wired or built-in source when possible.

## 4. Live transcript and corrections

The **Live transcript** displays provisional text as speech is recognized. Later, final transcription replaces provisional model words. User-corrected words are visually different and take precedence over new model text. Click a word or select a phrase, open its inline correction editor, type the correction and choose whether to **Remember correction** for future recognition. The original model words and audio times remain in the saved file. Use **Undo** and **Redo** to reverse eligible edits. If a correction is rejected because the source text changed, reload that passage and reselect it; never apply an edit to an uncertain timestamp.

Use the transcript's keyboard arrow keys to navigate words, **Enter** to edit a selection, **Space** to play a selected moment, and **Jump to Live** to return to the newest text. Auto-follow pauses when you scroll upward or edit.

**[Screenshot pending: selected word, inline editor, provisional/final/corrected styles]**

## 5. Pauses and recovery

**Pause** intentionally suspends capture; **Resume** restarts it. During a confirmed pause the timeline records a pause span, but missed or uncertain audio is marked **Audio missing** or **Possibly missing**, not mislabeled as a deliberate pause. A microphone disconnect, permissions change, laptop sleep or worker crash may produce an audio gap; warning details appear in the recording health display. If a helper fails to recover, saved chunks are preserved for recovery on the next launch. If a pause is not acknowledged, the UI must show the failure rather than pretending the capture is paused.

## 6. Import an audio file

On **Recordings**, select **Import** and choose WAV, MP3, M4A, FLAC or Opus. The original file stays untouched. Import converts the audio into a local meeting, runs final transcription and shows progress. You may cancel; a cancelled or failed import must leave no new meeting. Recording takes precedence: starting a recording stops an import, which you can retry afterward. Building new speaker profiles from imported voices is **off by default**; switch it on only when you have appropriate permission. The import's meeting date begins with the source file's date and can be edited.

**[Screenshot pending: import picker and progress]**

## 7. Speakers and voice profiles

Each meeting displays anonymous speaker labels until the voice is named. **Speakers** stores local voice embeddings, not recordings of people's voices. A model may associate an unfamiliar voice with an existing profile; low-confidence matches are suggestions for confirmation. Use **Rename**, **Merge** or **Split** to correct speaker assignments. Review suggestions before accepting them; changes must be undoable. You may delete a saved profile to remove its app-managed voice data. A voice profile does not automatically share information with other computers or cloud services.

## 8. Vocabulary

Corrections marked **Remember correction** help later recognition of uncommon terms. The **Vocabulary** screen lists learned terms, alternate mishearings and context. You can edit, disable or delete a term. Disabled terms are excluded from model hints. Remembered terms guide recognition; the app must **not** globally replace transcript text without clear evidence. Undo a correction when its original words should be restored. Vocabulary edits do not erase corrections already saved in past transcripts.

## 9. Summaries

Open a finished meeting's **Summary** tab. Choose **Brief** (email length) or **Full** (1–2 pages), then generate. The summary identifies topics, action items, decisions, open questions and developments that may alter scope, cost, risk, schedule or deliverables. Every action/decision retains an evidence timestamp where available. Unconfirmed owners, dates and uncertain evidence must be labeled. Edit items manually when needed; your edits should survive regeneration. When the transcript changes, a warning indicates that the summary may be outdated.

**[Screenshot pending: action-item table, critical decisions, source links]**

## 10. Review and playback

The **Recordings** list can be filtered by date or origin and searched by title, date or corrected transcript text. Select a meeting to review **Transcript**, **Summary** and **Audio**. Click a timestamp to play from it. Gaps and pauses remain visible, and playback must not invent missing audio. A meeting still being written may only play already sealed chunks. If audio-only retention removed a meeting's sound, the transcript and summary can remain available while playback is disabled.

## 11. Export

Choose **Export** from a selected meeting. Select **Transcript**, **Summary** or **Both**, and choose DOCX or PDF. Transcript options include title, date, duration, timestamps, speaker names and whether to show corrections. Summary options include Brief/Full, open questions and source timestamps; action and decision tables remain part of the summary. DOCX and PDF share the same content layout. Exports are written to that meeting's **exports** folder, which can be opened from the app.

**[Screenshot pending: export dialog, Word/PDF parity]**

## 12. Storage, privacy and deletion

All recordings, transcripts, profile embeddings and models reside in your chosen local library. Meeting folders are the source of truth; index.sqlite stores only listings, settings and small indexes, not transcript bodies. No cloud transcript upload is required. Security relies on your computer's BitLocker or FileVault disk encryption and user account protections.

A location-based privacy reminder appears when voice profiles are built and the selected jurisdiction matches the editable list; it can be dismissed **for the current meeting only**. It is an awareness reminder, not legal advice. You are responsible for consent and local laws.

**Delete meeting** removes app-managed meeting data, exports and caches after verification. **Auto-delete** can be Never (default), 30/90/180 days or 1 year, for audio-only or the whole meeting. The clock begins when a meeting entered the library, not when an imported file was recorded. Deleted data may still exist in your own backup tools, disk snapshots and independently made copies: this is **not secure physical erasure**. Never delete somebody else's archived source file during an import cleanup.

## 13. Model maintenance

The **Settings** model area shows installed local model versions and pending updates. Installing a model update is a deliberate action, not an automatic cloud process. An interrupted download must preserve the working version. **Revert** switches to a verified previous version when available. Speaker-model changes may affect saved embeddings and require confirmation. After initial setup, meeting capture, transcription and summaries should operate offline.

## 14. Troubleshooting and shortcuts

| Problem | First check |
| --- | --- |
| No mic level | OS microphone permission, selected device, Test mic |
| No meeting track | Meeting-app choice, OS system-audio permission, whole-computer fallback |
| Bluetooth becomes low quality | Hands-free mode, USB or built-in microphone |
| Transcription lagging | Worker status and local model availability; saved audio should continue |
| Audio gap | Recording health and Timeline; do not treat gaps as pauses |
| Final pass failed | Preserve saved audio; retry the pass when tools/models are ready |
| Import failed | Check supported format and free disk; choose the file again |
| Summary outdated | Review corrections and regenerate after final pass |
| Library index damaged | Preserve original, do not allow silent lossy rebuild |
| Delete did not verify | Check listed residual paths and retry after writers close |

Common shortcuts: **F1** opens Help; **Ctrl+Shift+Alt+D** opens mock-only developer controls when available. Transcript keyboard navigation, edit, playback and Undo/Redo are described in Section 4. Platform-specific shortcut differences and screenshots require final installed-app verification.

---

**Release checklist:** verify every described control against the installed app; add Windows/macOS screenshots, verify accessibility and offline behavior, remove development-only shortcuts from release guidance, confirm all license entries under Help/About, then version the manual with the app.