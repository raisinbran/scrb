# Focused cloud QA continuation — 2026-10-31

Branch: `rosmont/cloud-tasks-18-21-25-28-29-33-35-36-20261031`. Draft PR: https://github.com/raisinbran/scrb/pull/8. No pushes or merges to `main`; `packages/contracts/` unchanged.

## Scope delivered

1. **C1–C6 red-before-green proof:** `scripts/prove-cloud-regressions.mjs` temporarily changes one implementation at a time, invokes a targeted Vitest case, requires a failing assertion, and restores the source in `finally`. C2 has separate gate and summary-preemption variants. The PR's macOS workflow is configured to run it after the ordinary unit suite. The existing green test suite on the restored version is the green half. This is stronger than merely assuming the tests detect regressions, but results are not verified until that workflow finishes.
2. **Real Chromium large-PDF check:** `apps/desktop/e2e/large-pdf.spec.ts`, `large-pdf-harness.mjs` and `scripts/build-pdf-test.mjs` run the actual production `printPdf` in a separate Electron process with 2.6 MB of synthetic HTML. Check PDF signature, nonempty bytes, destroyed window and empty private temporary directory; no production IPC is added. This is a test harness and still requires CI execution.
3. **Security/privacy checks:** `packages/storage/test/logs.test.ts` creates a synthetic child process whose stdout and stderr contain invented private text; verifies the persisted application log redacts them. `apps/desktop/e2e/smoke.spec.ts` checks the renderer CSP denies a fabricated external fetch. **This does not prove main-process, native-helper or model-worker post-setup network isolation.**

## Validation state

- The parent commit `d6febd394fd5b23d1130492f3750c3c27b9ca276` passed the previous PR #8 Windows/macOS CI; that success **does not validate these new commits**.
- Source changes above were written through the GitHub connector; direct clone/npm was unavailable due to blocked GitHub DNS.
- At handoff authoring, the newly committed tests had **not yet produced a passing CI run**. Neither red-before-green mutation runs nor actual Chromium printing is claimed passed.
- Claude Code should check the new tests/CI for deterministic red assertions, print cleanup and platform skips/failures; run `npm run check` and `npm run test:smoke`. No unrelated features or new contracts are authorized.
- Keep PR #8 draft, QA-only. Do not merge before Claude Code review and the owner's gate decision.
