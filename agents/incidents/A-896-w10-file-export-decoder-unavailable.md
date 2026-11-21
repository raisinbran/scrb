### A-896 — 2026-11-20 — W10 — file export decoder unavailable in orchestration runtime

- **What failed:** The bounded file export succeeded, but its orchestration step used `TextDecoder`, which is not exposed in this JavaScript runtime.
- **Impact:** The local file contents were not decoded and no GitHub tree or commit was created.
- **Correction / remaining risk:** Decode the UTF-8 bytes with standard `decodeURIComponent` percent escapes before creating the tree. Low.
