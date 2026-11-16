### A-592 — Unused import stopped the first full check

- **Status / attribution:** Confirmed agent-authored lint defect.
- **What failed:** The first `npm run check` stopped at ESLint because `mkdirSync` was unused in the new Playwright test.
- **Agent-controlled cause:** An unused import remained after changing the temporary library setup.
- **Impact:** Typecheck passed; lint stopped the chained check before tests. The import was removed and a separate full lint run passed.
- **Evidence:** `apps/desktop/e2e/transcript-jump-performance.spec.ts`; sanitized record at `/private/tmp/scrb-transcript-jump-evidence-20261116.md`.
- **Correction / prevention:** Remove unused imports and run ESLint; passed.
