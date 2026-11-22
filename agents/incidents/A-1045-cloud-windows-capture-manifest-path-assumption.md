### A-1045 — 2026-11-21 — Cloud coordinator — Incorrect presumed capture manifest path
- **Observed failure:** A read-only request for `native/windows-capture/third_party/MANIFEST.md` returned 404.
- **Cause:** Treated a source-file comment about a manifest as proof that the repository path exists.
- **Effect:** One unnecessary read; no source, device, CI, or workflow mutation.
- **Correction/evidence:** Read the actual `native/windows-capture/scripts/fetch-opus.ps1` and `build.cmd` to identify the exact pinned libopus commit and built library path.
- **Remaining risk:** None from the read failure; hosted build execution remains unverified.
