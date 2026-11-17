### A-683 — 2026-11-16 — UI authoring session — synchronous copied-state update in React effect failed CI lint

- **Observed:** Draft PR #341 second exact-head run 44004229605 passed the earlier Prettier step and TypeScript checks but macOS lint rejected `CopyTranscriptAction.tsx:43` (`react-hooks/set-state-in-effect`). The offending code was `useEffect(() => setCopied(false), [segments, totalSegments])`. Windows was running the same checks.
- **Cause:** The new completion-status reset used a synchronous React effect state update, contrary to repository ESLint rules. This was a preventable authoring error, not an observed clipboard or capture defect.
- **Correction:** Store the exact `segments` array reference that was successfully copied, derive `copied` by comparing with the current transcript, and remove the effect entirely. This also prevents stale success announcements after transcript content changes.
- **Verification:** New exact-head CI and independent review required. Original recordings, backends and source audio are unaffected.
