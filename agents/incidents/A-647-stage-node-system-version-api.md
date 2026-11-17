### A-647 — 2026-11-16 — Codex / BCHEN-W10 — staging CLI called a nonexistent Node system-version API

- **Effect:** The first real staging invocation stopped before creating the staging directory; no tools or evidence were written there.
- **Evidence:** Node 22 reported `process.getSystemVersion is not a function` while assembling provenance.
- **Cause:** I assumed a Node `process` method existed for the operating-system build string; Node exposes this through `node:os` instead.
- **Correction:** Use `os.release()` and keep the staging output unchanged until the corrected run.
- **Remaining risk:** Re-run the full dependency walk and six PATH-isolated smoke probes.
