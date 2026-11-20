### A-897 — 2026-11-20 — W10 — base64 helpers unavailable in orchestration runtime

- **What failed:** The file export had returned base64 correctly, but the JavaScript orchestration runtime exposes neither `TextDecoder` nor `atob`, so UTF-8 decoding could not proceed.
- **Impact:** No GitHub object was created and no branch was changed.
- **Correction / remaining risk:** Pass each base64 payload directly to GitHub's blob API with `encoding=base64`, then assemble the tree from returned blob SHAs. Low.
