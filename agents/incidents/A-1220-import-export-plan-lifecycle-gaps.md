### A-1220 — 2026-11-26 — Import and voice-profile lifecycle gaps in the plan

- **Agent:** Codex Desktop (author model unavailable, Apple Silicon Mac).
- **What happened:** The first plan omitted queue privacy reconstruction and a shared lifecycle fence, and deferred the durable voice commit and recovery invariants. The first correction also missed the import opt-in flag on policy drift, index snapshot redaction and zero-contribution aggregate erasure. During revision, one document-generation command emitted a Python escape warning and one source lookup hit an unmatched shell glob.
- **Impact and evidence:** The formal review rejected PR #526's original plan. Independent re-review identified the remaining gaps before the correction was published. The command issues did not change or expose application data.
- **Correction and remaining risk:** Specified the scheduler fence, privacy snapshot and durable consent behavior, transactional late opt-in, redacted index recovery and fail-closed purge. Independent re-review passed for the revised document. Owner approval and implementation remain pending.
