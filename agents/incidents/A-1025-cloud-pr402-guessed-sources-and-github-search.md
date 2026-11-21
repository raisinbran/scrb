### A-1025 — 2026-11-21 — ChatGPT cloud — guessed source paths and a malformed repository code query

- Attribution: Minor read-only cloud investigation errors.
- What happened: Initial probes assumed nonexistent filenames (for example verify-win-binaries.mjs, stage-win-tools.ps1, build-opus.ps1 and some documentation names) and one unsupported multi-token GitHub code-search expression; the connector returned NOT_FOUND or INVALID_ARGUMENT.
- Effect: Extra failed read/search calls, no repository writes, CI mutation, user files, private recordings or hardware effects.
- Correction: Enumerated actual scripts/native directories at the precise PR ref, fetched the real stage-win-tools.mjs, existing capture and FFmpeg builders, and anchored all implementation to those sources.
- Prevention: Inspect repository tree before guessing file names; keep GitHub code search query expressions simple.
- Remaining: No application defect from those reads; public hosted build execution remains unverified.
