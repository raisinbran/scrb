# QA Review: `packages/contracts`

**Date:** 2026-10-30  
**Repository:** https://github.com/raisinbran/scrb/tree/main/packages/contracts  
**Review baseline:** `main` at [`4d2e2c56b6293d51668aea5227da08034504685a`](https://github.com/raisinbran/scrb/commit/4d2e2c56b6293d51668aea5227da08034504685a)  
**Review scope:** TypeScript contracts, bridge/API behavior, relevant mocks and consumers, and reported CI status.  
**Changes made:** None (read-only review).

## Overall result

**Conditional fail — not ready for integration approval.** The typed call/event contracts, explicit allowlists, and UI/backend separation provide a useful foundation. However, runtime validation, IPC error fidelity, import cancellation, and cross-package summary-model compatibility require attention before freezing the contract.

The actual desktop backend is intentionally not yet wired (`registerCallHandlers({})`) and the UI presently defaults to a mock. Findings below distinguish confirmed defects in the current IPC/mock behavior from integration and design risks; they are **not** claims that a completed production backend is malfunctioning.

## Initial verification

| Check | Status | Notes |
| --- | --- | --- |
| TypeScript compilation in CI | Passed | Compilation completed in the observed run. |
| Repository lint in CI | Failed | Six ESLint errors outside `packages/contracts` caused the latest run to fail. |
| Automated tests in CI | Skipped | CI did not reach this stage after the lint failure. |
| Build and smoke tests in CI | Skipped | CI did not reach these stages. |

**CI evidence:** [GitHub Actions run #41055429933](https://github.com/raisinbran/scrb/actions/runs/41055429933), for baseline commit `4d2e2c5`. Consequently, the commit does not have a fully passing CI verification.

## Findings by severity

### QA-01 — P1: IPC loses meaningful error codes

**Status:** Confirmed defect in the IPC adapter.  
**Location:** [`apps/desktop/src/main/ipc.ts`, lines 27–34](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/main/ipc.ts#L27-L34)

The main-process handler catches errors indiscriminately and replaces them with `internal`. Legitimate domain errors such as `notFound`, `conflict`, and `permissionDenied` cannot reach the UI with their intended codes, even though the contract permits them.

**Impact:** UI error presentation and recovery decisions may be incorrect or impossible.

**Recommendation:** Preserve known `ContractError` codes and safe messages; normalize unexpected errors to `internal` without leaking sensitive internal details. Add IPC adapter tests for each permitted error class and unexpected exceptions.

### QA-02 — P1: Runtime input validation is absent

**Status:** Confirmed validation gap; the resulting risk is an integration concern.  
**References:** [`packages/contracts/README.md`, lines 35–39](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/contracts/README.md#L35-L39); [`apps/desktop/src/ui/mocks/mock-backend.ts`, lines 362–371](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/mocks/mock-backend.ts#L362-L371)

TypeScript types do not validate IPC payloads at runtime. For example, `getTranscript` accepts unrestricted numeric offsets and limits in the mock, allowing a caller to request an excessively large transcript page.

**Impact:** Malformed requests can produce inconsistent behavior or excessive work when the real backend is wired.

**Recommendation:** Validate request shapes, identifier formats, string lengths, numeric ranges, and pagination bounds at the IPC boundary. Make rejection behavior explicit and test boundary values, malformed payloads, negative offsets, and large limits.

### QA-03 — P1: Import cancellation is incomplete

**Status:** Confirmed mock defect and contract design gap.  
**References:** [`apps/desktop/src/ui/mocks/mock-backend.ts`, lines 319–354](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/mocks/mock-backend.ts#L319-L354); [`packages/contracts/src/backend.ts`, lines 75–81](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/contracts/src/backend.ts#L75-L81)

`cancelImport` is a no-op in the mock. An import can subsequently emit `importFinished` even after cancellation. The contract does not supply an unambiguous cancellation-completed terminal event or cancellation failure reason.

**Impact:** Callers may regard an import as canceled while it continues and creates data.

**Recommendation:** Implement cancellation and cleanup semantics, add a definitive terminal result correlated with `importId`, and test cancel-before-start, cancel-in-progress, cancel-after-completion, and repeated cancellation.

### QA-04 — P1: Summary data models are inconsistent across packages

**Status:** Confirmed incompatibility requiring explicit mapping.  
**References:** [`packages/contracts/src/types.ts`, lines 303–350](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/contracts/src/types.ts#L303-L350); [`packages/storage/src/formats/summary.ts`, lines 3–50](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/storage/src/formats/summary.ts#L3-L50); [`packages/summary/src/types.ts`, lines 40–68](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/summary/src/types.ts#L40-L68)

The contract, storage, and summarization packages define materially different shapes and semantics. For example, the contract uses `open/done/unconfirmed` for action statuses, whereas the summarizer uses `Agreed/Proposed/Unconfirmed`. Storage represents open questions as strings, while the contract provides identifiers, evidence timestamps, and edit flags.

**Impact:** Implicit conversion risks loss of evidence/provenance and conflates whether an action was agreed with whether it was completed.

**Recommendation:** Choose canonical meanings for status and provenance fields; implement explicit, exhaustive, tested adapters between the summary engine, persisted representation, and UI contract. Add round-trip tests for every field and state. Avoid equating agreement with completion.

### QA-05 — P2: Mock operations do not consistently modify data

**Status:** Confirmed mock defect.  
**References:** [`apps/desktop/src/ui/mocks/mock-backend.ts`, lines 373–376](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/mocks/mock-backend.ts#L373-L376); [`apps/desktop/src/ui/mocks/mock-backend.ts`, lines 432–435](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/mocks/mock-backend.ts#L432-L435)

`applyCorrection` and `reassignSpeaker` change undo history but do not make the corresponding transcript edits. `updateSummaryItem` marks a summary as edited without applying the submitted item.

**Impact:** UI flows can appear to work or pass tests without confirming that edited content is correct.

**Recommendation:** Have mock handlers apply real representative state transitions; assert the updated transcript, speaker assignments, summary items, undo, and redo results rather than simply response envelopes.

### QA-06 — P2: Recording-state recovery is incomplete

**Status:** Contract/consumer design gap.  
**Location:** [`apps/desktop/src/ui/shell/use-recording-status.ts`, lines 13–29](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/shell/use-recording-status.ts#L13-L29)

`getRecordingState` can restore the recording status after a UI reload, but not current recording-health warnings or transcription-lag status, which are delivered only through events.

**Impact:** A freshly opened/reloaded UI can lose awareness of an active degraded recording condition until a new event arrives.

**Recommendation:** Offer a consistent session snapshot that includes recording, health, and transcription state, and test reload/reconnect during degraded conditions.

### QA-07 — P2: Transcript revisions are inconsistent across meetings

**Status:** Confirmed mock/contract mismatch.  
**References:** [`apps/desktop/src/ui/mocks/mock-backend.ts`, line 108](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/apps/desktop/src/ui/mocks/mock-backend.ts#L108); [`packages/contracts/src/types.ts`, lines 218–238](https://github.com/raisinbran/scrb/blob/4d2e2c56b6293d51668aea5227da08034504685a/packages/contracts/src/types.ts#L218-L238)

The mock uses a global revision counter for multiple meetings, while the transcript change-recovery model expects a coherent sequence for the meeting being viewed.

**Impact:** Switching recordings may trigger unnecessary reloads or make missed-update detection harder to reason about.

**Recommendation:** Scope revisions by meeting, document the expected monotonicity and reset rules, and test missed-event detection and switching between meetings.

## Test coverage assessment

The contracts package has **three direct contract tests**, covering call/event name coverage and success/error bridge envelopes. Current tests do **not** fully verify runtime request validation, all payload shapes, cancellation semantics, or real Electron IPC error handling.

**Add regression coverage for:**

1. Error-code preservation and malformed IPC payload rejection.
2. Cancellation during import without subsequently creating a meeting.
3. Summary-engine → storage → UI contract round trips, including evidence metadata.
4. Corrections, speaker reassignment, undo/redo, and summary-edit persistence.
5. Transcript page boundaries, per-meeting revisions, missed events, and UI reload recovery.

## Recommended resolution order

1. **Block contract freeze:** Resolve QA-01 through QA-04 and write the corresponding regression tests.
2. **Improve test reliability:** Resolve QA-05 through QA-07 and verify meaningful mock state transitions.
3. **Restore CI verification:** Fix unrelated repository lint errors, then run the full macOS and Windows pipelines through tests, build, and smoke tests.
4. **Re-review integration:** Confirm behavior against the real backend once it replaces `registerCallHandlers({})`.

## Scope and verification limitations

This report transcribes the findings of the read-only source and CI review conducted in this conversation on October 30, 2026. It relies on repository source inspection and GitHub Actions evidence at the stated commit. **No independent local checkout, executable regression run, patch, or PR was performed in this review.** Findings about the mock and IPC paths should not be interpreted as evidence of defects in a completed production backend.
