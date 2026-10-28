# Meeting Scribe — UI Specification

Oct 28, 2026

Author: BJC

## Purpose and ownership

This is the single source for building the app's interface. Claude Code builds everything described here; ChatGPT Codex builds none of it.

> **User-specified decision.** Splitting UI work to Claude Code and backend work to Codex was chosen by the project owner for this project. It is not a general recommendation. If these documents are reused for another app, revisit whether to split work by agent at all, and which agent owns which part.

| Area | Owner | Folder (final names set in Phase 1) |
| --- | --- | --- |
| Screens, components, styles, design tokens, UI tests | Claude Code | `apps/desktop/src/ui/` |
| Capture, storage, AI workers, app core, exports | Codex | everything else |
| Contract between UI and backend | You (approval required) | `packages/contracts/` |
| Mock backend | Claude Code, from the contract | `apps/desktop/src/ui/mocks/` |

Inputs for the UI agent: this document, V1 Requirements v1.2 ("Audio capture and audio settings" and "Interface and workflow"), the contract file and the mock backend.

## Look and feel

A calm, professional tool: Discord's navigation and settings style, AutoCAD's resizable workspace, no decorative clutter.

- **Layout:** left sidebar (Live, Recordings, Speakers, Vocabulary, Settings, with Help pinned at the bottom), a central workspace, and a collapsible inspector panel on the right. Panels resize by dragging, and sizes are remembered.
- **Window sizes:** usable at 1280×720 and up; the inspector collapses automatically on narrow windows.
- **Themes:** Light, Dark and System, all from one set of design tokens (colors, spacing, type sizes, corner radius). No color values hard-coded in components.
- **Recording indicator:** always visible in the title bar while recording or paused, with elapsed time. Red dot for recording, amber for paused.
- **Status separation:** recording health and transcription lag are shown as two separate indicators, so a transcription problem never looks like a recording problem.
- **Accessibility:** every action reachable by keyboard; visible focus; adjustable transcript font size; labels for screen readers; text contrast meeting WCAG AA.
- **Shortcuts (defaults, changeable later):** start/stop recording, pause/resume, jump to live, undo, redo, open search, F1 for the User Manual.

## Screens and states

Every screen must handle each state listed; a state not designed is a bug.

| Screen | Contents | States to design |
| --- | --- | --- |
| **First launch** | Model download with progress and size; US state of residence or main work state, with a warning under listed states; mic and meeting-app permission prompts | Downloading, failed download with retry, permission denied, complete |
| **Live** | Start, pause, resume, stop; meeting-app picker with "Whole computer audio" fallback; mic picker; level meters; elapsed time; live transcript; privacy banner where applicable | Idle, recording, paused, transcription lagging, transcription failed (recording still running), mic silent, device changed, low disk |
| **Recordings** | Searchable, filterable meeting list; meeting detail with Transcript, Summary and Audio tabs; open-folder buttons; export; delete | Empty library, final pass running, summary generating, summary "May be outdated," recovered after crash, deleting |
| **Summary tab** | Brief/Full toggle; narrative; action-item and decision tables with clickable timestamps; edit; regenerate | Not generated, generating, ready, edited, outdated |
| **Speakers** | Voice profiles with name, meeting count; rename, merge, delete | Empty, suggested match awaiting confirmation, deleting |
| **Vocabulary** | Terms, misheard variants, history; edit, disable, delete | Empty, disabled entry |
| **Settings** | Audio devices, presets and toggles; input sensitivity slider (0 to −100 dB, plus Automatic); transcription quality; model updates with revert; summary default length; storage location; auto-delete period and scope; location for the banner; theme | Unsaved change, model update available, model download in progress |
| **Export dialog** | Transcript, Summary or Both; DOCX or PDF; transcript and summary options | Exporting, done with "Open folder," failed |
| **User Manual** | Contents list, search, sections as listed in V1 Requirements; opened from Help, F1 or "?" links on other screens | Contents, search results, no results, opened at a specific section |
| **About** | Name, version, build date, "© 2026 BJC, all rights reserved; personal use only" above the third-party notices, models in use, local-storage statement, licenses viewer, "Open logs folder" | Default, licenses open, model info unavailable (models not yet downloaded) |

## Live transcript editor

The UI owns how editing feels; the backend owns what an edit means. The UI never decides whether text is frozen, learned or replaced.

| Claude Code (UI) | Codex (backend, via the contract) |
| --- | --- |
| Word and phrase selection, the editor popup, "Remember correction" checkbox | Storing the correction as a separate layer |
| Keeping the selection stable while new text arrives | Freezing corrected spans in the final pass |
| Styling provisional, final and corrected text differently | Deciding which state each word is in |
| Speaker label menus for rename and reassign | Applying the reassignment and updating profiles |
| Undo and redo buttons and shortcuts | The undo/redo history itself |
| Auto-scroll pause, Jump to Live, click-to-play | Audio playback and word timing |
| Virtualized rendering so an 8-hour transcript stays fast | Delivering transcript updates as small change events |

Performance rules: render only visible lines; apply incoming text without re-rendering the whole transcript; keep typing in the editor responsive while recording.

## Contract the UI may use

The UI talks to the backend only through the typed contract in `packages/contracts/`. The exact names are fixed in Phase 1; the groups below are the expected shape.

| Group | Example calls (UI → backend) | Example events (backend → UI) |
| --- | --- | --- |
| Session | `startRecording`, `pauseRecording`, `resumeRecording`, `stopRecording` | `recordingStateChanged`, `recordingHealth` |
| Devices | `listInputDevices`, `listMeetingApps`, `selectSources` | `deviceChanged`, `levelMeter` |
| Transcript | `applyCorrection`, `reassignSpeaker`, `undo`, `redo`, `seekAudio` | `transcriptChanged` (append, replace, realign), `transcriptionLag` |
| Speakers | `renameSpeaker`, `mergeSpeakers`, `deleteProfile` | `speakerSuggestion` |
| Vocabulary | `listTerms`, `updateTerm`, `deleteTerm` | none |
| Summary | `generateSummary`, `updateSummaryItem` | `summaryProgress`, `summaryOutdated` |
| Library | `listMeetings`, `searchMeetings`, `deleteMeeting`, `openMeetingFolder`, `exportMeeting` | `exportFinished` |
| Settings | `getSettings`, `updateSettings`, `checkModelUpdates`, `revertModel` | `modelDownloadProgress` |
| Help | `getAppInfo`, `getLicenses`, `openLogsFolder` | none |

If the UI needs something the contract lacks, Claude Code writes a handoff note instead of working around it.

## Mock backend and UI checks

The mock backend lets the UI be built and tested before the real backend exists, and it must match the contract exactly.

**The mock backend provides:**

- A scripted live meeting: 4 speakers, text arriving every second, a pause, a device change and a transcription lag spike.
- A stored 8-hour transcript with about 80,000 words for performance testing.
- Sample summaries (Brief and Full), an outdated summary, an empty library and a recovered-after-crash meeting.
- Every error state in the Screens table, triggerable from a hidden developer menu.

**UI acceptance checks for each gate:**

- [ ] Every screen state in the table renders correctly in Light and Dark.
- [ ] The full meeting workflow works by keyboard alone.
- [ ] Scrolling and editing the 8-hour transcript stay smooth.
- [ ] A selection survives 60 seconds of incoming live text.
- [ ] No UI code imports backend modules; only the contract.
- [ ] Screens behave the same against the real backend as against the mock.

## UI work by phase

In each phase the contract freezes first; then Claude Code builds against the mock while Codex builds the backend.

| Phase | Claude Code builds |
| --- | --- |
| 0 | Nothing; spikes are backend only |
| 1 | App shell, sidebar, empty screens (including Help), themes and tokens, settings screen skeleton, mock backend framework |
| 2 | Record/pause/resume/stop controls, recording indicator, source pickers, meters, audio settings and presets, warnings, first-launch screen |
| 3 | Live transcript view with virtualization, provisional styling, lag indicator, click-to-play |
| 4 | Speaker labels and menus, Speakers screen, privacy banner, US state question with warning |
| 5 | Selection, inline editor, undo/redo, Vocabulary screen |
| 6 | Summary tab with Brief/Full, editable tables, outdated flag |
| 7 | Recordings list and search, meeting detail, export dialog, delete and auto-delete settings, open-folder buttons |
| 8 | Accessibility pass, polish, model-update settings, About screen, User Manual pages and screenshots |
