### A-520 — 2026-11-15 — Codex / Mac local — Mac staging deduplicated incompatible dylibs by basename

- **Status / attribution:** Confirmed implementation defect; corrected in this branch.
- **What failed:** The first staged `llama-server --version` exited during dyld loading because the staged `libggml-base.0.dylib` came from another toolchain and lacked a symbol required by the pinned llama.cpp build. The staging script deduplicated libraries only by basename.
- **Agent-controlled cause:** I extended the existing basename-only dependency map without accounting for the distinct ggml libraries brought by llama.cpp.
- **Correction / remaining risk:** Staging now identifies libraries by canonical source and content, gives conflicting same-basename dylibs deterministic hashed names, and rewrites each dependent binary to its resolved staged library. Staging, clean-PATH version launch, recursive package dependency audit, and ad-hoc signature verification passed. Low.
