### A-825 — 2026-11-19 — W10 — Windows preflight used wrong Node and invalid formatter target

- **Status / attribution:** Confirmed agent error; no repository or CI state changed.
- **What failed:** The focused verifier command resolved system Node 26.13.0 instead of the assigned Node 22 runtime. Its Vitest run passed 11 tests, but this is not valid Node 22 evidence. The same command also passed `build.cmd` to Prettier, which has no parser for that file type, and returned before completing the style check.
- **Impact:** Formatting and ESLint were rerun on supported JS/Markdown files, but the focused test result remains limited to Node 26. The verified Node 22 executable could not be located in the known task-specific locations checked.
- **Correction / remaining risk:** Use exact-head CI's pinned Node 22 for authoritative W1 checks; do not claim the local Vitest run as Node 22 verification. Low.
