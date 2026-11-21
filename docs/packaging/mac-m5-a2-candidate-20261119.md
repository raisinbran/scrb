# Mac M5 A2 build-only candidate — 2026-11-19

## Result

Built a local ARM64 `Scribe.app` candidate from the pinned source commit `73e899d0a45234617b9fbc81cf8f599747ec652b`. The candidate is for review only: it was not installed or launched, and no models were installed. No production code was changed.

The pre-existing candidate was not reused: its provenance records source `e0ff737f3b928283f53cd9abbd1b294bbe90e584` and a non-empty working-tree digest.

## Candidate identity

- Bundle: `com.raisinbran.scribe`, version `0.1.0`, ARM64; 332 MB.
- Source checkout: exact `73e899d0a45234617b9fbc81cf8f599747ec652b`, no changed tracked files, empty working-tree digest `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- Pinned upstreams: whisper.cpp `284029c07012d2000941a08d38a31ffb71f4734e`; sherpa-onnx `af2d8d81dbfa61c4cea4c568da78f3982edca005`; llama.cpp `369dcf309c8b274370e692ac2d42d9708597ae04`; opus `251d657e92fccfa3b05baec4f05756cce252fb75`.
- `PROVENANCE.json` SHA-256: `ae20707044a5ef1367dc129a6dcd5494692f854c06ba41c9732572bbde03328c`.
- Candidate ZIP SHA-256: `51cb3a1e29989d17af2c4138ab0e5836d8f6f55492bda407ae9fb09d1c41ab8d` (145,657,651 bytes).
- Candidate bundle tree digest: `5536a02a7b4960b4556c2fbcbee0a69cebcc2a7439bb16ce24a83a3adf9c7032` (653 entries; relative paths, modes, file contents and symlink targets).

## Verification

- All 25 staged native tools/libraries matched their provenance hashes and were ARM64. The main Scribe executable, Electron Framework, and Scribe Helper were ARM64 as well.
- The manifest's 90 dependency edges matched all 90 actual non-system `otool -L` links by staged target basename; all bundled targets exist.
- FFmpeg `-buildconf` confirms `--disable-network`, with neither GPL nor nonfree enabled. `-L` reports LGPL. The trimmed output hash matches the provenance probe; the manifest records `networkDisabled=true`, `gplEnabled=false`, and `nonfreeEnabled=false`.
- All 12 staged third-party notice/license files are present and match the provenance hashes.
- Deep strict ad-hoc signature verification passed. Bundle CDHash: `5d546c193868c7cd0c0437aad65637f087dfc5c8`.
- Read-only verification passed for the five speech handover models: three Whisper files, the 3-D Speaker embedding model, and the pyannote segmentation model. The segmentation archive and extracted model match their pinned hash and size. The separate Qwen summary model is not part of the five-file speech handover.

## Preservation and rollback

The installed `/Applications/Scribe.app` and known-good backup were not modified. Their post-build tree digests match: `d797cb15e3f803e8ef888aace19cdaba1d1eabe4c6f56e1084f6d712f2a7c5ea` (628 entries).

A disposable copy rehearsal moved the current-app copy aside, placed the candidate copy in its slot, verified the candidate digest, and restored the original copy. The restored digest matched; the real `/Applications` path was never renamed or written. Rehearsal copies and candidate archive remain in a local temporary evidence directory and are not stored in Git.

For any later owner-authorized swap: verify candidate and current-app hashes/signature, quit Scribe, rename the current app to a dated rollback path, copy the candidate into `/Applications/Scribe.app`, and verify it. If verification fails, remove only the failed candidate and rename the rollback app back. Keep the known-good backup untouched until the candidate is accepted.

## Diagnostics and limits

Build output included a `git describe` no-name diagnostic, an Opus CMake package-version warning, a CPU-capability diagnostic, and Swift deprecation/unused-result warnings. The candidate was produced and independently verified; the causes of these warnings were not investigated. The packaging command's process exit status and full raw output were not preserved after the terminal session ended. The observed warnings and final artifact evidence are recorded here; no rebuild was performed.
