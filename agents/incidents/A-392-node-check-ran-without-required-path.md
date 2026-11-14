### A-392 — 2026-11-14 — Codex — Node inspection omitted the repository runtime path

- **Status / attribution:** Confirmed agent error; no application defect.
- **What failed:** I ran a `node` package-script inspection before adding the repository's Node directory to `PATH`; zsh returned `node: command not found`.
- **Impact:** One failed inspection command; no repository or user-data effect.
- **Correction / remaining risk:** Read the script directly from `package.json` and use the required Node path for subsequent npm commands. None.
