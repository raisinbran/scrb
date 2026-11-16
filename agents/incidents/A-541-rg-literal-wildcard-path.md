### A-541 — 2026-11-16 — Codex / BCHEN-W10 — wildcard path passed literally to ripgrep

- **Status / attribution:** Confirmed command-construction error; no application defect.
- **What failed:** A verification call passed PowerShell wildcard characters inside an absolute path argument to `rg`; ripgrep received the literal wildcard path and returned Windows path error 123 instead of scanning the requested files.
- **Impact:** One intended read-only reference check did not run. No files were changed by the failed search.
- **Correction / remaining risk:** Use explicit file paths or ripgrep's `-g` glob option. The register check and code/test unchanged comparison had already passed; the reference check is being rerun with explicit files. Low.
