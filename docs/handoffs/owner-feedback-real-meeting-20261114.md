# Owner feedback after the first real-meeting use of the packaged Mac app, 2026-11-14

Source: the owner, from a packaged Mac build (`scripts/package-mac.sh --install`, main at `f258188f`) and one real meeting. Paraphrased lightly. Real-meeting audio and transcripts are confidential: never commit them. Status column: "sent" means handed to a session on 2026-11-14; no item here is done until its PR is independently reviewed and merged.

## Checks the owner ran

| Check | Result |
| --- | --- |
| Mute then unmute the Mac mic (#170) | Works: the banner cleared after unmuting |
| Live tab idle indicators | Removal merged (#273) |
| Real meeting, speaker separation | Fails: at least two clearly different speakers (one with a strong accent) are both labelled "Speaker 1". Owner permits reading that meeting's transcript and audio for diagnosis (scratch only, never committed) |

## Global look and behaviour

| # | Finding | Area |
| --- | --- | --- |
| 1 | Settings and Help buttons show a white underline; hover already shows the button shape, so remove it (keep keyboard focus ring) | UI |
| 2 | Checkboxes and toggles are blue; use the same purple as Start and Import Audio File | UI |
| 3 | Tooltips take too long, and are bright white boxes that ignore the dark theme. Fade in almost instantly (still slightly noticeable) and out at the same speed | UI |
| 4 | Warnings must never take a permanent row in a content panel. Default to popup banners, centred left-right over the tab's content panel | UI |
| 5 | Final-processing message and progress bar must not shift buttons and the transcript panel. Buttons, dropdowns, titles, control bars and panels must not change shape or shift (includes the input-sensitivity bar) | UI |
| 6 | The Settings "unsaved changes" banner moves when scrolling to the bottom | UI |
| 7 | Hover highlight on suggested speakers' labels differs from all other buttons | UI |
| 8 | Sidebar border need not be resizable; fix it at the narrowest width that does not cut labels | UI |
| 9 | Settings tab takes about 0.5 s to flash into view; Live a little too. Distracting | UI |
| 10 | Name file formats ".docx", ".vtt" and ".pdf" in the app | UI |
| 11 | "Meetings older than 30 days will be permanently deleted: the audio, the transcript, and the summary and exports." contradicts the "What to delete: Audio & Transcript" choice | UI |
| 12 | "Presets change only the copy sent to the transcriber." is unclear to the owner | UI text |
| 13 | The library-folder permissions warning shows at every launch; owner asks whether it is worth keeping | Main process |

## Live tab, mini preview, sidebar

| # | Finding | Area |
| --- | --- | --- |
| 14 | Mini preview shows "You" even when nobody speaks. Show a speaker only when someone is actually speaking or their mic carries sound above typical low background noise. Owner has Noise Suppression on Strong and asks whether it should already cover this | UI/backend |
| 15 | About 3 to 5 s lag between speaking (also the owner) and the label showing in the mini preview | UI/backend |
| 16 | A white dot above the recording dot appeared; it is the Hide control. Make it an ordinary button with the others | UI |
| 17 | When a speaker is speaking, show an animated waveform beside the label (like Teams' mini view) | UI |
| 18 | Replace the fading recording dot on the Live tab with an animation of the microphone icon (for example fade with a red fill) so an ongoing recording is obvious | UI |
| 19 | Recordings tab uses a CD icon, not the hamburger; the CD spins while a recording is processing or in its final pass | UI |
| 20 | With a large window, Test mic and the level meters stay below the Meeting app bar. Move Test mic into Settings above the Preset setting | UI |
| 21 | If "Automatic" input sensitivity adjusts dynamically, show the dB number rather than the word, and do not let the bar change size | UI |

## Settings

| # | Finding | Area |
| --- | --- | --- |
| 22 | Replace "Revert to previous model" with a model dropdown for Live speech, Final speech and the others; the optimal model for this PC is marked "(Recommended)"; picking a model beyond the PC shows a persistent red warning ("This model may cause computer instability due to insufficient hardware requirements") | UI, likely contract |
| 23 | With a non-Custom Preset, the settings it controls are unselectable and greyed (including the Noise Suppression dropdown); tooltip "Set by Voice Isolation" or "Set by Studio" | UI |
| 24 | Does the app benchmark the PC before choosing models? Nothing in the manual, Help or Models section says so. If it only runs on first launch, add "Re-run computer benchmark" (tooltip: "Picks optimal models based on your computer") | UI, contract, handler |
| 25 | An "i" button over the live transcript only works on hover; tooltips should show faster (see 3) | UI |

## Recordings, summaries, export

| # | Finding | Area |
| --- | --- | --- |
| 26 | The Re-process explanation occupies a permanent row in the meeting control bar. Replace with a hover tooltip: "Re-run speech recognition and speaker detection. Uses the model currently selected in Settings." | UI |
| 27 | Summary sub-tab: if the transcript was re-processed after the latest summary, show a warning that persists across restarts: "This transcript was recently re-processed. This summary may be outdated. Recommend generating the summary again." | UI and storage |
| 28 | Owner's intent for summaries: auto-generate both the brief and full summaries, and export them in the same file formats as the transcript. Is anything blocking that? (as of the 2026-11-13 plan: no real `generateSummary` handler and no model wiring in the app) | Audit, then plan |
| 29 | Final Export click must open the native macOS or Windows save dialog, defaulting to the Scribe export folder but remembering the user's last Scribe export location. No custom "where to save" menu | Main process and IPC, needs plan and owner approval |
| 30 | New meeting names should default to `YYYYMMDD <AI summary of the topics in 1 to 10 words>` (#213 is the open PR for auto titles, conflicting with main) | Backend |
| 31 | Speaker profiles need a short voice preview so the user can sanity-check who the app thinks a speaker is; "Split a speaker" is hard to use without audio preview of the tracks or dialogue in question | UI, contract, plan |

## Handling

Sent to sessions 2026-11-14: items 1 to 13 (global polish), 14 to 21 (Live, mini window, sidebar), 22 to 25 (Settings). Not yet sent: 26 to 31 (Recordings, summaries, native save dialog, titles, speaker preview) and the speaker-separation investigation of the real meeting. Contract and IPC changes (items 22, 24, 29, 31) need the owner's approval before any code.
