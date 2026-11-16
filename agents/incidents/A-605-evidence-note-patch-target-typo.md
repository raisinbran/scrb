### A-605 — 2026-11-15 — Codex / Mac desktop — evidence-note patch target was incorrect

- **Status / attribution:** Confirmed editing slips; both rejected patches made no file changes.
- **What failed:** The first patch used a nonexistent evidence-note filename. After correcting the path, a second patch used stale expected text from an earlier version of the note, so verification rejected that patch too.
- **Impact:** Neither patch changed the usage record, evidence note, or repository files.
- **Correction / remaining risk:** Re-read the current evidence and usage files before applying the final update. Low.
