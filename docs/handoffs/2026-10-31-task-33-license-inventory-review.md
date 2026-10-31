# Task 33 — redistribution notice inventory review

**Status:** Partial; do not claim license compliance or a complete About notice list. This review uses only invented-free npm lockfile metadata and existing repository files.

## What was checked

- Root `package-lock.json`: 332 `node_modules` paths, including workspace links.
- `packages/export/package-lock.json`: 96 paths.
- `packages/summary/package-lock.json`: 105 paths.
- `packages/transcription/package-lock.json`: 125 paths.
- **453 unique package-name/version combinations** across these four files. The eight entries without a `license` property are workspace `@scrb/*` links, not evidence of unknown third-party license text. All counts are from the branch as of 2026-10-31.
- Other metadata license values include MIT, ISC, Apache-2.0, BSD-2-Clause/3-Clause, MPL-2.0, CC-BY-4.0, CC0-1.0, BlueOak-1.0.0 and composite expressions. This inventory is not a distribution manifest.
- `scripts/audit-notices.mjs` reports package metadata and warns that it does **not** verify source license/redistribution obligations. The real desktop `getLicenses` currently returns `[]` and Help accurately reports missing verified notices.

## Still required before release

1. Identify the exact production bundle (runtime packages only, and any Electron/runtime code). Do **not** mistake all devDependencies in lockfiles for shipped artifacts.
2. Collect actual license texts and attribution/source-offer obligations from primary source files for each bundled dependency and asset, rather than equating SPDX labels with notices.
3. Record shipped FFmpeg/ffprobe binary configure flags and `ffmpeg -L` output from the exact Windows/Mac packaged binaries. Check whisper/llama/sherpa libraries, models, their redistribution permission, and font/asset licenses.
4. Generate reviewed `THIRD_PARTY_NOTICES.md` plus a deterministic completeness check against that verified bundle manifest; then connect real `getLicenses` to the verified manifest. No placeholder notices.
5. Run the installed About/help UI and distribution checks on both target operating systems.

**Not run:** exact redistributable license-text verification, packaged binary inspection, native installer builds, `ffmpeg -L`, legal review, local npm commands or checks. Do not mark Task 33 done based solely on this metadata audit.
