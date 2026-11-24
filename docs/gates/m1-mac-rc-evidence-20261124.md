# Mac release candidate evidence (M1.4), 2026-11-24

Scope: freeze the Mac release candidate, build it once, record hashes and manifests, verify pre-M1 UI items in source, launch once with an isolated profile. No install over `/Applications/Scribe.app`, no B0 run, no UI driven.

## Candidate

- **MAC_RC_SHA:** `e6c0056a0e910bb86dbeccaeb8f56fee2f5cf257` (origin/main, #465 merge). Working tree clean at build (PROVENANCE.json: no changed or untracked source files).
- Built 2026-11-24 ~00:30 PT with `scripts/package-mac.sh` (build only) from a worktree; output `apps/desktop/release/mac-arm64/Scribe.app` (332 MB). Build log ended `Verified 25 packaged ARM64 binaries`, `codesign --verify --deep --strict` passed.
- #465 present: `apps/desktop/src/ui/components/SharedLibraryNotice.tsx`; quit guard `closeBeforeQuit` imported at `apps/desktop/src/main/main.ts:36`, used at line 415.
- Build setup note: the fresh worktree lacked the git-ignored `packages/transcription/.bin` (ffmpeg, ffprobe, scrb-sherpa) and `.work` (ffmpeg source archive needed by provenance). Both were copied unchanged from the primary checkout; `scrb-capture` was rebuilt by the script. The first run failed at the provenance step for the missing archive; the second succeeded.

## Hashes

| Item                                           | SHA-256                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| Main binary `Scribe.app/Contents/MacOS/Scribe` | `d1d3d85ff5ae2f4ebb1474f60412bd24b0d3c717de4fe0a2f4725f0d54d1c20c` |
| Whole app (see method)                         | `e5f6740a2c0ce961ed686a03e88152539e40f06817bf342757b50dc61869079c` |

Whole-app method: from inside `Scribe.app`, `find . -type f ! -type l`, sort bytewise (`LC_ALL=C`), run `shasum -a 256` on each (314 regular files, symlinks excluded), then SHA-256 of that listing text. Ad-hoc signing makes hashes build-specific, so a rebuild will differ.

## Bundle

- Bundle id `com.raisinbran.scribe`, version 0.1.0, arm64 only.
- Signature: ad-hoc (`Signature=adhoc`, no team identifier). Not notarized.

## Tool list (25 ARM64 binaries verified by the script, under `Contents/Resources/bin`)

`scrb-capture`, `whisper-cli`, `whisper-server`, `whisper-vad-speech-segments`, `scrb-sherpa`, `ffmpeg`, `ffprobe`, `llama-server`; in `lib/`: `libwhisper.1`, `libggml.0`, `libggml-cpu.0`, `libggml-blas.0`, `libggml-metal.0`, `libggml-base.0`, `libsherpa-onnx-c-api`, `libllama-server-impl`, `libllama-common.0`, `libmtmd.0`, `libllama.0`, `libonnxruntime` (`.dylib`), plus five hash-suffixed ggml copies (`libggml.0-d34f76462db9`, `libggml-cpu.0-964df556080f`, `libggml-blas.0-e9c12e0200e8`, `libggml-metal.0-ed3821e17421`, `libggml-base.0-5930e31d01e4`). Per-file hashes, upstream commits and licenses are in the bundled `Resources/bin/PROVENANCE.json`.

## Model manifest

Models are not bundled; they are installed separately and hash-checked against `scripts/model-digests.json` at this SHA:

| Model                                                      | SHA-256                                                            | Bytes      |
| ---------------------------------------------------------- | ------------------------------------------------------------------ | ---------- |
| ggml-large-v3-turbo-q5_0.bin                               | `394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2` | 574041195  |
| ggml-small.en-q5_1.bin                                     | `bfdff4894dcb76bbf647d56263ea2a96645423f1669176f4844a1bf8e478ad30` | 190098681  |
| ggml-silero-v6.2.0.bin                                     | `2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987` | 885098     |
| 3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx | `1a331345f04805badbb495c775a6ddffcdd1a732567d5ec8b3d5749e3c7a5e4b` | 39593761   |
| segmentation-model.int8.onnx                               | `d582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d` | 1540506    |
| Qwen3.5-9B-Q4_K_M.gguf                                     | `03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8` | 5680522464 |

## Pre-M1 UI items (source only; UI not driven)

- Copy transcript control: **present**. `screens/recordings/CopyTranscriptAction.tsx` (label "Copy transcript"), rendered in `MeetingDetailView.tsx:716`.
- Current word follows playback: **present**. `currentWordId` in `transcript-model.ts`, applied via `currentWord` and `aria-current` in `TranscriptTab.tsx`.
- Minimum window 800x560: **present**. `minWidth: 800`, `minHeight: 560` at `apps/desktop/src/main/main.ts:295-296`.

Source presence is not proof the installed UI behaves correctly; that is for the B0 run.

## Launch (one run, isolated)

- Temp profile (`--user-data-dir`) and library under `$TMPDIR`, pointer `library-location.json` with `root`, `SCRB_DEV_AUTO_LOCATION=1`. `/Applications/Scribe.app` and the owner's library untouched. No dialog operated.
- Result: **started and stayed running for about 35 s** until I stopped my own process with SIGTERM (exited cleanly). Backend log: `library-reconciled` (0 added/removed) and `library-opened` (`corruptIndexReplaced: false`); `index.sqlite`, `meetings`, `models`, `logs` created in the temp library. The profile config recorded tool paths inside the built app.
- stdout and stderr: both empty. No new crash report: newest `Scribe-*.ips` in `~/Library/Logs/DiagnosticReports` is 2026-11-22, before this build.
- Temp profile and library were deleted afterward. No private or owner data involved.

## Checks

`npm run check` on the branch: passed (exit 0).

## Not done

No install, no B0 30-turn protocol (needs owner approval O6), no recording or transcription run, no verification of microphone/screen-capture permissions in the packaged app.
