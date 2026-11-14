# Gate 7 automated walkthrough, macOS (2026-11-14)

**Spec:** `apps/desktop/e2e/real-gate7-walkthrough.spec.ts`. **Machine:** the owner's Mac, packaged-free dev build (`npm run build`, then Playwright driving Electron). **Data:** invented speech made with macOS `say` (about 11 s, never committed) and invented seeded meetings. No real recordings.

Run it from `apps/desktop` (first test needs the real-mode assets; the second needs nothing):

```bash
SCRB_CAPTURE_HELPER=<repo>/native/macos-capture/build/scrb-capture \
SCRB_FINAL_PASS_CONFIG=$HOME/scrb-dev-assets/config/final-pass.json \
SCRB_LIVE_CONFIG=$HOME/scrb-dev-assets/config/live.json \
npx playwright test e2e/real-gate7-walkthrough.spec.ts
```

## Result

```
✓ import, search, export both formats, then fully delete (19.7s)
✓ auto-delete removes exactly the chosen data (2.7s)
2 passed
```

## What it proves

Test 1 (real import, real final pass, real export, real delete; real Electron UI):

1. Import from the Recordings screen (file dialog stubbed to the invented file) reaches `ready` with `source: imported`, and the transcript has more than 15 words.
2. Searching a spoken word finds the meeting through the UI; opening it shows the transcript containing that word.
3. DOCX and PDF are exported through the Export dialog. Text extracted from the DOCX (`word/document.xml`) and from the PDF (macOS PDFKit text layer) each contain every transcript word, in order. Honest limit: this is a word-order check on normalised words, not a layout or formatting check, and it ignores extra export text such as title, date and speaker labels.
4. Delete from the meeting screen. After the UI reports "Deleted", `meetings/` is empty, and nothing under the library (meeting folder, audio, exports, SQLite index and its journals) has a path or byte content containing the meeting id. Search and list no longer return it. The original imported file is untouched.

Test 2 (real app startup sweep on a seeded library; two meetings 200 days old, one new, each with audio in both tracks, `session.json`, transcript and an export; period 30 days):

1. Scope audio only: both old meetings lose `audio/` entirely and get `audioDeletedAt`; transcript, export and the rest of the folder are unchanged; the new meeting's folder listing is identical.
2. Scope whole meeting (second launch): both old meetings are gone from disk, the index (no id in any non-log file) and `listMeetings`; the new meeting is still listed and unchanged.

## Findings

- **Fixed (UI, small):** the real app's search went only to the mock backend, because `searchMeetings` was not routed to the real side in `hybrid-backend.ts`. A real meeting could never be found from the Recordings screen ("No matching recordings"). Search now merges real and mock results like the list does; unit test added. The spec caught this.
- **Observed, not a bug:** `logs/scrb-*.log` keeps an audit line with the deleted meeting id (no content). The residue scan skips `logs/`. If the owner wants ids gone from logs too, that is a separate decision.
- **Observed:** `meeting.json` says `ready` a moment before the search index answers, so the spec waits for the index before typing. Minor.

## What Gate 7 still needs

- **Windows run** of the same spec (needs a Windows PDF text check: the PDFKit step is macOS-only) on BCHEN-WIN10 or Regiurn.
- **Manual:** open both exports in Word and a PDF viewer and judge layout; confirm the Delete confirmation wording and the auto-delete setting in the Settings screen (this spec seeds the setting through storage, not the Settings UI).
- **"Exactly the chosen data" gaps:** a meeting that is recording, importing or summarising during a sweep or delete; delete interrupted by a crash; permission-denied or locked files; the summary and vocabulary/voice-profile links of a deleted meeting; symlinks; index-upgrade backups (D3 to D10 in `docs/plans/delete-and-auto-delete.md` are covered by storage tests, not by this walkthrough). The audio-only sweep is checked with seeded placeholder audio, not real chunks.
- Retention of a real imported file by library-entry date (not recording date) is storage-tested, not walked here.
