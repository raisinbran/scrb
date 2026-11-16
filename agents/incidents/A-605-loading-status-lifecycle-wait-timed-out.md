### A-605 — 2026-11-16 — Codex / Mac desktop — loading-status lifecycle wait timed out after loading had completed

- **Status / attribution:** Confirmed test-harness correction error prompted by independent review; no product failure.
- **What failed:** The revised Electron test waited for the loading text to attach and then detach. Mac CI timed out waiting for attachment because transcript loading had already completed before the test reached that wait.
- **Agent-controlled cause:** I applied the lifecycle wait without accounting for `useTranscript` loading in the background before the Transcript tab was reached.
- **Impact:** One Mac smoke job failed before any performance jump ran; Windows had no matching lifecycle result. No automatic retry was made.
- **Evidence:** CI run `43933870271`, Mac job log `133533164969`.
- **Correction / prevention:** Expose the existing loading state through the transcript region's `aria-busy` attribute and wait for `aria-busy="false"`, which covers both already-complete and still-loading states. Exact-head CI is required.
