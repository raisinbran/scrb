# Meeting Scribe — V1 User Manual (draft)

**Pre-release Gate 8 draft — not a verified operating manual.** Source-audited against `main` at `088b61a` (2026-10-31). The earlier version of this draft and preliminary feature integrations are on draft PR #8, which remains under Claude Code QA. A working mock UI is not proof of a real device, model, file export or playback service.

| Feature | Current audited development state |
| --- | --- |
| Live, Recordings, Speakers, Vocabulary, Settings, Help screens | UI exists; many backend operations are preliminary or mocked |
| Native recording, final pass and device capture | Optional developer-configured helpers; packaged build explicitly disables unbundled helpers |
| Import, summaries, editing, DOCX/PDF, search and voice profiles | Partial source implementations; several additional bridges are only on unmerged draft PR #8 |
| Real playback | Not yet implemented; secure transport requires an approved plan |
| First-launch model download and updates/revert | UI and isolated prototypes only; no approved production manifest |
| Third-party notices | Metadata audit only, no reviewed redistribution notices |

The procedures below are **intended V1 behavior**. Availability notes flag anything not established in the current build. Replace screenshot markers, verify the installed Windows/macOS UI and native behavior, and link the final manual from Help before release.

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

**Availability: planned.** The audited baseline has no installed Windows/macOS distribution or integrated production model downloader. Do not confuse a mock setup screen with installed/verified models.

**Intended V1 steps:** Install the verified build for your OS. Open Meeting Scribe, review the first-launch setup screen and download the required local models. Verify model sizes and progress before proceeding. Grant the operating-system microphone and meeting-audio permissions when prompted. On Windows, choose the correct microphone/input device; on macOS, approve the requested system audio capture if the OS asks. If permission is refused, change it in OS Settings and retry rather than restarting a recording blindly. Choose your US state of residence/main work, or use your computer's country setting outside the US, for the privacy reminder.

**[Screenshot pending: initial setup and permissions, Windows/macOS]**

## 2. Start and stop recording

**Availability: developer-helper testing only.** Real capture requires a separately configured local helper; packaged mode currently disables the unbundled helper. Do not rely on a mock Start button for an important meeting.

For an approved helper test, open **Live**. Confirm the meeting app and microphone. Make sure the meters move as expected and that all participants know recording is underway where required. Choose **Start**. The recording status changes to recording; elapsed time and warnings appear. Original microphone and meeting audio are saved on separate synchronized tracks. Use **Stop** to seal the recording. The local final transcription then revisits the recording for accuracy. Verify stopped/sealed status before powering off. Window-close safety on an installed build still needs verification.

**[Screenshot pending: Live toolbar, sources and meters]**

## 3. Audio source and quality

**Availability: source/mic-test UI exists; OS permissions and device reliability still need native testing.**

Choose an input microphone or follow the current system default. For meeting audio, choose a supported meeting app/browser or explicitly opt into **Whole computer audio** if that is necessary. Whole-computer capture is never enabled without your action. The **Audio presets** balance voice clarity and processing; review advanced controls only if needed. **Test mic** checks levels while idle without saving a meeting. Changing the meeting app while recording may require stopping and starting a new recording. Bluetooth hands-free microphones can reduce quality; prefer a wired or built-in source when possible.

## 4. Live transcript and corrections

**Availability: correction UI and storage exist; a real low-latency native PCM-to-model feed is not yet integrated and verified.** In a mock build, text may be synthetic.

With a working model feed, the **Live transcript** displays provisional text as speech is recognized. Later, final transcription replaces provisional model words. User-corrected words are visually different and take precedence over new model text. Click a word or select a phrase, open its inline correction editor, type the correction and choose whether to **Remember correction** for future recognition. The original model words and audio times remain in the saved file. Use **Undo** and **Redo** to reverse eligible edits. If a correction is rejected because the source text changed, reload that passage and reselect it; never apply an edit to an uncertain timestamp.

The Live transcript UI supports arrow keys to navigate words, **Shift + arrow keys** to select, **Enter** to edit, **Space** to request playback, and **Jump to Live** to return to the newest text. Real saved-audio playback is not yet implemented. Auto-follow pauses when you scroll upward or edit.

**[Screenshot pending: selected word, inline editor, provisional/final/corrected styles]**

## 5. Pauses and recovery

**Availability: capture handlers and recovery rules exist, but installed device/load testing remains open.**

**Pause** intentionally suspends capture; **Resume** restarts it. During a confirmed pause the timeline records a pause span, but missed or uncertain audio is marked **Audio missing** or **Possibly missing**, not mislabeled as a deliberate pause. A microphone disconnect, permissions change, laptop sleep or worker crash may produce an audio gap; warning details appear in the recording health display. If a helper fails to recover, saved chunks are preserved for recovery on the next launch. If a pause is not acknowledged, the UI must show the failure rather than pretending the capture is paused.

## 6. Import an audio file

**Availability: main has mock UI; draft PR #8 contains preliminary import integration, not a verified release feature.** Do not rely on this workflow for important recordings yet.

**Intended V1 steps:** On **Recordings**, select **Import audio file** and choose WAV, MP3, M4A, FLAC or Opus. The original file stays untouched. Import converts the audio into a local meeting, runs final transcription and shows progress. You may cancel; a cancelled or failed import must leave no new meeting. Recording takes precedence: starting a recording stops an import, which you can retry afterward. Building new speaker profiles from imported voices is **off by default**; switch it on only when you have appropriate permission. The import's meeting date begins with the source file's date and can be edited.

**[Screenshot pending: import picker and progress]**

## 7. Speakers and voice profiles

**Availability: speaker UI/storage and preliminary handlers exist; real diarization and automatic voice matching are not verified.**

Each meeting displays anonymous speaker labels until the voice is named. **Speakers** stores local voice embeddings, not recordings of people's voices. A model may associate an unfamiliar voice with an existing profile; low-confidence matches are suggestions for confirmation. Use **Rename**, **Merge** or **Split** to correct speaker assignments. Review suggestions before accepting them; changes must be undoable. You may delete a saved profile to remove its app-managed voice data. A voice profile does not automatically share information with other computers or cloud services.

## 8. Vocabulary

**Availability: vocabulary UI and storage rules exist; the real speech worker/hint behavior remains to be verified.**

Corrections marked **Remember correction** are intended to help later recognition of uncommon terms. The **Vocabulary** screen lists learned terms, alternate mishearings and context. You can edit, disable or delete a term. Disabled terms are excluded from model hints. Remembered terms guide recognition; the app must **not** globally replace transcript text without clear evidence. Undo a correction when its original words should be restored. Vocabulary edits do not erase corrections already saved in past transcripts.

## 9. Summaries

**Availability: Summary UI/mock is present; draft PR #8 has a preliminary configurable local coordinator, not a verified real-model release.**

**Intended V1 steps:** Open a finished meeting's **Summary** tab. Choose **Brief** (email length) or **Full** (1–2 pages), then generate. The summary identifies topics, action items, decisions, open questions and developments that may alter scope, cost, risk, schedule or deliverables. Every action/decision retains an evidence timestamp where available. Unconfirmed owners, dates and uncertain evidence must be labeled. Edit items manually when needed; your edits should survive regeneration. When the transcript changes, a warning indicates that the summary may be outdated.

**[Screenshot pending: action-item table, critical decisions, source links]**

## 10. Review and playback

**Availability: meeting/transcript UI exists; real saved-audio playback is not implemented.** Mock timestamp controls should not be mistaken for a working player.

The **Recordings** list can be filtered by date or origin and searched by title, date or corrected transcript text. Select a meeting to review **Transcript**, **Summary** and **Audio**. When secure playback becomes available, clicking a timestamp will seek to that moment. Gaps and pauses remain visible, and playback must not invent missing audio. A meeting still being written may only play already sealed chunks. If audio-only retention removed a meeting's sound, the transcript and summary can remain available while playback is disabled.

## 11. Export

**Availability: export layouts exist; draft PR #8's DOCX/PDF app bridge and real Chromium printing are preliminary and not installed-app verified.**

**Intended V1 steps:** Choose **Export** from a selected meeting. Select **Transcript**, **Summary** or **Both**, and choose DOCX or PDF. Transcript options include title, date, duration, timestamps, speaker names and whether to show corrections. Summary options include Brief/Full, open questions and source timestamps; action and decision tables remain part of the summary. DOCX and PDF share the same content layout. Exports are written to that meeting's **exports** folder, which can be opened from the app.

**[Screenshot pending: export dialog, Word/PDF parity]**

## 12. Storage, privacy and deletion

**Availability: local library and index are implemented; deletion/retention and model paths need verification on the configured runtime.**

The intended library stores app-managed recordings, transcripts and profile embeddings locally; model installation paths remain subject to the approved model manifest. Meeting folders are the source of truth; index.sqlite stores only listings, settings and small indexes, not transcript bodies. The product design requires no cloud transcript upload for core use; cross-process offline behavior has not been independently verified. Security relies on your computer's BitLocker or FileVault disk encryption and user account protections.

A location-based privacy reminder appears when voice profiles are built and the selected jurisdiction matches the editable list; it can be dismissed **for the current meeting only**. It is an awareness reminder, not legal advice. You are responsible for consent and local laws.

**Delete meeting** is designed to remove app-managed meeting data, exports and caches after verification. **Auto-delete** can be Never (default), 30/90/180 days or 1 year, for audio-only or the whole meeting. The clock begins when a meeting entered the library, not when an imported file was recorded. Deleted data may still exist in your own backup tools, disk snapshots and independently made copies: this is **not secure physical erasure**. Never delete somebody else's archived source file during an import cleanup.

## 13. Model maintenance

**Availability: UI and isolated model-verification/download prototypes only.** Production install, updates, rollback, licensing manifest and model-path registry are not integrated or verified.

In a completed V1 release, the **Settings** model area would show installed local model versions and pending updates. Installing a model update is a deliberate action, not an automatic cloud process. An interrupted download must preserve the working version. **Revert** switches to a verified previous version when available. Speaker-model changes may affect saved embeddings and require confirmation. Offline capture, transcription and summarization remain acceptance requirements, not verified properties of the current build.

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

Common shortcuts: **F1** opens Help. With **Ctrl** on Windows or **Cmd** on macOS: **Shift+S** Start/Stop, **Shift+P** Pause/Resume, **Shift+L** Jump to Live, **Z** Undo, and **Shift+Z** or **Y** Redo. These UI shortcuts require functional backend support for their action. Transcript keys are in Section 4. Mock-only developer controls are not end-user features. Platform-specific shortcut differences and screenshots require final installed-app verification.

---

**Release checklist:** reconcile with the reviewed PR #8 manual before merging; verify every described control against installed Windows/macOS builds; add screenshots and real device/model/export/playback, accessibility and offline evidence; confirm license texts under Help/About; remove availability warnings only when proven; version the manual with the released app.