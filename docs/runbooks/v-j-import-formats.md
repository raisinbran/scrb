# V-j — Audio import formats (V05)

## Fixture

Generate short, non-speech audio for checks; do not use recordings or transcript fixtures from real meetings. Unit coverage generates a one-second PCM tone in memory and encodes it to the target format with the repository's bundled FFmpeg when available. Existing decoder tests also exercise format-specific samples. Keep the source file unchanged and use a new temporary destination for each import.

## Case matrix

| File / case                                                                             | Expected result                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| WAV                                                                                     | Imports as one ordinary meeting, creates app-format Opus audio chunks, reports duration/progress, and leaves the generated source bytes and modification time unchanged. |
| MP3                                                                                     | Same successful import and source-preservation behavior as WAV.                                                                                                          |
| M4A (AAC)                                                                               | Same successful import and source-preservation behavior as WAV.                                                                                                          |
| FLAC                                                                                    | Same successful import and source-preservation behavior as WAV.                                                                                                          |
| Opus                                                                                    | Same successful import and source-preservation behavior as WAV.                                                                                                          |
| Damaged file with a supported extension (for example, invalid bytes named `.mp3`)       | Import fails with a plain unreadable/damaged-file reason; no meeting or staging directory remains.                                                                       |
| Unsupported text file                                                                   | Import is rejected as an unsupported format; no meeting or staging directory remains.                                                                                    |
| Unsupported audio/container extension (for example, `.txt` or WAV bytes renamed `.mkv`) | Import is rejected as unsupported; no meeting or staging directory remains.                                                                                              |
| Valid video fixture                                                                     | Import is rejected with the video-not-accepted result; no meeting or staging directory remains.                                                                          |

M4A may carry AAC or ALAC; the importer supports both. The generated one-second M4A case uses AAC. Source files remain untouched in every case. Imported meetings are single-track meetings; live capture, pause/resume and recording audio presets do not apply.

## Installed-build procedure

1. Install a build with its import tools and models ready. Use a disposable profile and library under the OS temporary directory and seed the library pointer before launching an unpackaged real-backend app. For an unpackaged run, follow `AGENTS.md`: set `SCRB_DEV_AUTO_LOCATION=1`, pass explicit `--user-data-dir`, and point `library-location.json` to a separate temporary library. Packaged builds ignore that development flag.
2. Generate one short tone file for each supported format. In the Recordings screen, import each file and check that one imported meeting appears, progress completes, duration is plausible, and the original file remains unchanged. Do not evaluate transcript accuracy from a tone.
3. Import a damaged `.mp3`, an unsupported text file and an unsupported video/container. Confirm each reports a clear failure and creates no meeting or leftover import staging directory.
4. If import transcription and cleanup for the planned cases could take more than 20 minutes in total, obtain owner approval before starting. Do not repeat failed or inconclusive long imports automatically.

Keep generated audio, imported meetings and diagnostics until the relevant gate is passed and the owner authorizes cleanup. Do not use private recordings.

## Automated coverage without an installed build

- `packages/transcription/test/import.test.ts` already covers WAV, MP3, AAC/ALAC M4A, FLAC and Opus fixtures, damaged and unsupported inputs, source preservation, and cleanup. It now also generates a one-second tone and encodes it as each of the five V1 formats before importing. This real-decoder group is skipped when the bundled FFmpeg is absent; `SCRB_REQUIRE_DECODER=1` makes that absence a test failure.
- `apps/desktop/src/main/imports.test.ts` covers the coordinator's file-token routing, import lifecycle, cancellation/failure behavior, and opt-in voice-profile default.
- `apps/desktop/src/ui/mocks/mock-backend.test.ts` and `apps/desktop/src/ui/screens/recordings/Recordings.test.tsx` cover the mock-backend import flow and UI state without an installed build.
- Run `npm run check` for unit coverage. Run a decoder-backed targeted import suite only when the bundled decoder is already available; building FFmpeg is outside this runbook and must remain within the 20-minute limit or have prior approval.
