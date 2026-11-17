### A-653 — 2026-11-16 — Codex / BCHEN-W10 — Incorrect sherpa build-output path in staging preflight

- **Observed effect:** The first full staging command stopped before moving or changing the existing staging directory because its preflight expected `build/win-sherpa-v2.0.1/bin`, while the executable was under `build/win-sherpa-v2.0.1/cmake-build/Release`.
- **Evidence:** PowerShell reported the missing input at the preflight check. A targeted search then located `scrb-sherpa.exe` in `cmake-build/Release`.
- **Attribution:** Agent setup/path assumption; no project defect.
- **Correction:** Use the path returned by the targeted filesystem search and rerun staging after verifying every input path.
- **Remaining risk:** None from this stopped command; it made no staging changes.
