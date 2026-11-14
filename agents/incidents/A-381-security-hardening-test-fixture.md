### A-381 — 2026-11-14 — Codex / Mac desktop — storage permission probe expected an uncreated transcript

- **Status / attribution:** Confirmed test fixture mistake; no application defect.
- **What failed:** The new library permission probe expected `transcript.json` immediately after `createMeeting`, which creates meeting metadata but no transcript until the first transcript save.
- **Impact / evidence:** One storage test failed with `ENOENT` on the invented-data fixture.
- **Correction / remaining risk:** Removed that nonexistent-file assertion; the separate atomic-write test verifies transcript document mode, and the storage permission probes pass. None.
