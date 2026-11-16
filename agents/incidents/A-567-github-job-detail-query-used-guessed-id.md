### A-567 — 2026-11-15 — Codex / Mac desktop — GitHub job-detail query used a guessed job ID

- **Status / attribution:** Confirmed diagnostic error; no repository state changed.
- **What failed:** I queried a job-detail URL using an unverified numeric job ID. The GitHub connector rejected the URL before returning job data.
- **Impact:** The detail lookup failed; the valid run-level jobs endpoint already provided the needed status. No workflow or repository state was changed.
- **Correction / remaining risk:** Stop guessing job IDs and use only IDs returned by the supported jobs endpoint. Low.
