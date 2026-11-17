### A-659 — 2026-11-16 — Codex / BCHEN-W10 — Incident heading format check failure

- **Observed effect:** The first register check rejected six newly created incident files because I used level-one headings without the date/device fields required by `agents/incidents/README.md`.
- **Evidence:** `build/focused-checks-slice2.log` reports “expected exactly one A-number heading, found 0” for A-653 through A-658; the checker requires the `### A-<number> — date — agent — title` format.
- **Attribution:** Agent documentation-format error; the incident contents remain accurate.
- **Correction:** Change those six headings to the required format and retain one heading per file.
- **Remaining risk:** Rerun the register check after verifying the incident and usage ID ranges against current main and open PRs.
