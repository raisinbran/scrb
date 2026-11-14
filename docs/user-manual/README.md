# Scribe User Manual

Scribe records your meetings on your own computer and turns them into text. Nothing is uploaded. Known problems are listed in [known-issues.md](known-issues.md); please read it before relying on Scribe for an important meeting.

Checked against the app on `main` on 2026-11-13 by reading the app's screens and code. Things not tried on a real Windows or Mac install are marked **(unverified)**.

## 1. Before you start

- **Setup.** The app needs its helper tools and speech models on the computer. If something is missing, the title bar shows **Setup incomplete** (hover it for the reason) and recording is blocked. A build that is not set up for real recording shows a simulated mode and says so in the title bar; do not use it for real meetings.
- **Models** are installed separately from the app. **Settings > Models** shows what is installed, offers updates and lets you revert to the previous version. Downloading is the only thing that needs the internet.
- **Permissions.** Allow the microphone, and on Mac the system-audio permission, when asked. If you refused, change it in the system settings and try again. **(unverified on a clean install)**
- **Where files go.** The first time, you choose a library folder. All meetings, exports and voice profiles live there.

## 2. Record a meeting (Live)

1. Open **Live**. Pick the **Meeting app** and **Microphone**. **Whole computer audio** records everything the computer plays, so use it only when needed.
2. Use **Test mic** to check your microphone without saving anything.
3. Choose **Start**. Use **Pause** and **Resume** as needed, and **Stop** to finish. Keyboard: Ctrl/Cmd+Shift+S starts or stops, Ctrl/Cmd+Shift+P pauses or resumes.
4. Your microphone and the meeting audio are saved as two separate tracks.

Switching the microphone or the meeting app during a recording is supported on Mac. **Windows: not confirmed (unverified).**

**Live text.** Text appears while people speak. It is provisional and will change. If the live text falls behind or stops, the title bar says so; the recording itself continues. **Jump to Live** (Ctrl/Cmd+Shift+L) returns to the newest text.

**Warnings.** Alerts such as **Mic silent**, **Low disk**, **Device changed**, **Permission lost**, **Audio missing** and **Meeting app closed** appear on the Live screen. **Audio missing** means sound was not saved; it is not a pause you chose.

**Mini window.** While you record, a small always-on-top window shows the status, **Pause/Resume**, **Stop**, **Make smaller/larger** and **Show Scribe**. It cannot be minimized with the usual system button. A **Hide** button is not in this build.

## 3. After you stop: the final pass

When you stop, Scribe re-reads the saved audio to produce a more accurate transcript and to work out who spoke. A banner on the meeting says it is still being processed and shows progress. The text is provisional until it finishes. If it fails, the meeting page offers a retry; your audio is kept.

## 4. Recordings

**Recordings** lists your meetings. Filter by Recorded or Imported, and search with Ctrl/Cmd+F. Open a meeting to see **Transcript**, **Summary** and **Audio**.

- **Transcript:** click a timestamp to play from there. Space plays or pauses; the arrow keys step through words.
- **Audio:** play, mute, and see the two tracks and a timeline of any gaps.
- You can change a meeting's date from the meeting page.

## 5. Corrections

Select a word or phrase and press Enter (or click it) to type the correction. Corrections are kept in the saved file and are not overwritten by later model text. Undo and redo with Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z (or Ctrl+Y). Corrections you mark to remember feed the **Vocabulary** list.

## 6. Speakers

Meetings first show anonymous speakers. **Speakers** lists saved voice profiles (stored as numbers, not recordings). You can **Rename**, **Merge** or **Delete** a profile. Suggested matches appear for you to accept or reject. Splitting one profile into two is not offered.

## 7. Vocabulary

**Vocabulary** lists terms Scribe should recognise. You can **Edit**, **Disable** (kept but not used) or **Delete** a term, and review suggested terms. Changing the list does not rewrite past transcripts.

## 8. Summaries

On a finished meeting, open **Summary**, choose **Brief** or **Full**, then **Generate**. Summaries are made on this computer. They list action items, decisions and open questions with their source times. You can edit entries (marked **Edited**) and regenerate. After the transcript changes, **May be outdated — regenerate?** appears. Check a summary against the transcript before you act on it; items marked **Needs review** or **Unconfirmed** are uncertain.

## 9. Export

On a meeting, choose **Export**: **Transcript**, **Summary** (needs a generated summary), or both, as **DOCX** or **PDF**. Options include title, duration, speaker names, timestamps and showing corrections. Files go to the meeting's exports folder, which the dialog can open. PDF layout on both systems: **(unverified)**.

## 10. Import

On **Recordings**, choose **Import** and pick a WAV, MP3, M4A, FLAC, Opus or Ogg file. Your original file is untouched. Scribe makes a new meeting, shows progress, and you can cancel. **Build voice profiles from this file** is off by default; switch it on only if you have permission from the people on the recording.

## 11. Delete and storage

- **Delete** on a meeting asks you to confirm, then removes its files. If some files cannot be removed, it lists them and offers **Try again**. This is not secure erasure: backups and copies you made remain.
- **Settings > Storage** can auto-delete after 30, 90, 180 days or 1 year (default **Never**), either **Audio** only or **Audio & Transcript**.
- Everything stays on this computer. Protect it with your system's disk encryption (BitLocker or FileVault). A privacy reminder about recording consent may appear; it is not legal advice, and you are responsible for consent.

## 12. Settings

**Audio:** microphone, preset (**Voice Isolation**, **Studio**, **Custom**) and input sensitivity. **Transcription quality:** Fast, Balanced or Accurate. **Summary default length.** **Theme:** Light, Dark or System. Changes are saved with the save bar.

## 13. Packaged app and Windows

- The packaged Mac app is signed only ad hoc, so macOS may ask you to approve it. **(unverified on another Mac)**
- The Windows package is built with `scripts/package-win.ps1`. **Windows: running the packaged app end to end is unverified.**
- **Windows differences:** Microsoft Teams cannot be recorded on its own, so Scribe records everything on that output device (see known issues). On Mac this does not apply.

## 14. Help and About

**Help** (F1) shows the version, credits, third-party notices and where this manual is. Its path is `docs/user-manual`; it is not displayed inside the app.

## Troubleshooting

| Problem | Check first |
| --- | --- |
| Cannot record, "Setup incomplete" | Hover the label for what is missing |
| No microphone level | System microphone permission, chosen device, **Test mic** |
| No meeting sound | Meeting app choice, system-audio permission, or **Whole computer audio** |
| Live text behind | The recording is still saved; the final pass fixes the text |
| **Audio missing** | A gap, not a pause; see the Audio timeline |
| Final pass failed | Retry from the meeting page; audio is kept |
| Import failed | File type, free disk space; pick the file again |
| Delete left files | Close anything using the folder, then **Try again** |
