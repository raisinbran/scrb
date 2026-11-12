# Plan: make the real-decoder import tests run, and never skip silently

**Status:** owner approved Option A, Step 1 on 2026-11-12 ("approve if you recommend"), items 1-4 under "Owner must approve". **Independent review is still pending** (the author cannot review it); it must happen before implementation starts. Nothing implemented.

## The problem

`packages/transcription/test/import.test.ts` runs its 20 real-decoder tests only if `packages/transcription/.bin/ffmpeg` exists. They cover damaged files, cancel mid-decode, a late final-pass failure and the abandoned-staging sweep, which is what "a cancelled or failed import leaves nothing behind" rests on. `.bin` is git-ignored and filled only by `npm run build:ffmpeg`. CI (macOS and Windows) never runs it, so CI skips them and says "passed". `test/live.test.ts` has the same gap (and already skips on Windows). Today the owner's Mac `.bin` holds only `scrb-sherpa`, so they skip there too.

## What I found

1. **The script** (`packages/transcription/scripts/build-ffmpeg.sh`): downloads FFmpeg 9.0 (SHA-256 checked) and libopus 1.6.1 (**no hash check**), builds libopus as a static library, then configures FFmpeg with `--disable-everything` plus only the WAV/MP3/M4A/FLAC/Ogg demuxers and decoders, libopus encoder, file and pipe only, no network. Licence: LGPL, with neither `--enable-gpl` nor `--enable-nonfree`; the script greps its own config and refuses to finish if either is on. Output: `ffmpeg` and `ffprobe` in `.bin`. Build time is **not measured** (I did not run it); it is a small configure-and-make of two programs, so minutes, not hours. It is **macOS/Linux only**: bash, `shasum`, `./configure`, `make`. On Windows it is unproven; a 2026-11-02 handoff records the build blocked on an awk error in FFmpeg's dependency generation. A working Windows `ffmpeg.exe` (3.7 MB, SHA-256 `e41cab26…`) does exist in the owner's Gate 3 evidence folder, but how it was built is not recorded in the repo.
2. **CI options**

| Option | Cost | Licence risk | Supply-chain risk |
| --- | --- | --- | --- |
| A. Run the existing script in CI, cache `.bin` with `actions/cache` keyed on OS plus the script's hash | One build per script change, then seconds. macOS ready. Windows needs MSYS2 and the awk fix: unknown effort | None new: same flags, same refusal check | Low: same two upstream tarballs. Gap to close: add a SHA-256 for libopus |
| B. Download a pinned prebuilt LGPL Windows build (e.g. BtbN `win64-lgpl`) and check SHA-256 | Small script step; no build | Medium: LGPL but a much larger codec surface than our minimal build (already noted in THIRD_PARTY_NOTICES); not verified here that the pinned asset stays available | Medium: third-party binary we did not build; the hash pin helps only if the asset is never deleted |
| C. Build on one platform, skip the other | Cheapest | None | None, but Windows tests still do not run, which is the problem |

## Recommendation: A, in two steps, plus the guard

**Step 1 (this change):** the guard (3), macOS CI builds the decoder with the script and caches it, then sets `SCRB_REQUIRE_DECODER=1`. Windows CI does **not** set the variable yet and prints the skip warning; it is a known, visible gap, not a silent one. Add the libopus SHA-256 to the script.
**Step 2 (separate, later approval):** Windows. First try the same script under MSYS2 (preinstalled on `windows-latest`); only if that fails, bring option B to the owner as its own licence decision. Not part of this diff.

### 3. The guard (smallest change)

New `packages/transcription/test/decoder.ts` exporting `haveFfmpeg`. If the decoder is missing and `SCRB_REQUIRE_DECODER=1`, it adds one failing test ("decoder required but not found: run npm run build:ffmpeg"); if missing and the variable is unset, it prints one `console.warn` line ("SKIPPED: real-decoder tests, no ffmpeg in .bin"). `import.test.ts` and `live.test.ts` use it instead of their own `existsSync`. Local `npm test` still skips, loudly.

### 4. Local setup

- **Mac:** the existing `npm run build:ffmpeg` is enough (needs Xcode command-line tools and `curl`). No new command. I would update the README line to mention the warning.
- **Windows PCs:** `build:ffmpeg` does not work. Until Step 2, copy the already-pinned `ffmpeg.exe` and `ffprobe.exe` into `packages/transcription/.bin` (hash-check against the Gate 3 manifest). No new script.

### 5. Gate 3 evidence

- **Verified:** macOS Gate 3 (`docs/gates/gate-3-macos.md`, approved 2026-11-02) records "cancelled and failed imports added 0 meetings and left 0 staging entries" on commit `689c3d4`, from physical runs on the real app by Codex. It did **not** depend on these unit tests.
- **Not verified:** the unit tests running in CI on either platform (never), or on the owner's Mac today. For Windows, the 2026-11-09 handoff says import cancel/failure cleanup is "not yet audited"; only 21/21 format imports on an ancestor are recorded. No evidence in `docs/gates`, `docs/handoffs` or `agents/` shows the 20 tests passing on Windows.

## Files touched (Step 1)

`.github/workflows/ci.yml` (macOS-only cache and build steps, env var); `packages/transcription/scripts/build-ffmpeg.sh` (libopus hash); `packages/transcription/test/decoder.ts` (new); `test/import.test.ts`, `test/live.test.ts` (use it); `packages/transcription/README.md` (one line).

## Risks

- CI cache miss adds a build to that run; a wrong cache key could reuse a stale binary (key on the script hash).
- The newly running tests may fail on the runner (never run in CI): expect a first red run to triage, not a regression.
- Windows stays unprotected until Step 2.
- Test time grows by the tests' own runtime on macOS (unmeasured).

## Owner must approve

1. The CI change (macOS build and cache step, new env var).
2. CI downloading FFmpeg and libopus sources from ffmpeg.org and xiph.org on cache misses (hash-pinned).
3. No new licence: same LGPL build. A Windows prebuilt binary (option B) is **not** requested now.
4. That Windows stays warn-only until Step 2.

## Review notes folded in

- `import.test.ts` has 20 tests, but the video-rejection test also needs `SCRB_VIDEO_FIXTURE`, so CI runs 19 unless it is set. No fixture is added.
- One skip warning per test file is acceptable.
- The cache key includes `runner.arch` as well as the OS and the script hash.
- Found while building: after a build, `.work/` holds the unpacked FFmpeg source and ESLint failed on its JavaScript, so `eslint.config.mjs` now ignores `**/.work/**` (CI lints after the decoder step). Measured: build about 41 s on the owner's Mac; the 20 import tests run in about 7 s.
