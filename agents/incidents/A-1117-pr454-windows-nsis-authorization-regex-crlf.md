### A-1117 — 2026-11-22 PT — Windows NSIS authorization test's second CRLF omission

**Observed result:** [PR #454 CI #45090587329](https://github.com/raisinbran/scrb/actions/runs/45090587329), at exact head `635f9a127b1cb0c2594e49b9d7cdc2d44454471e`, completed macOS application PASS, Windows capture-source PASS, source-only installer guard PASS, but Windows application Test FAIL. The sole failure was `scripts/hosted-win-installer-single-runner.test.mjs` asserting `/^ {2}verified-installer-producer:\n {4}if: >-\n/m` against CRLF-checkout YAML. The model-download UI test that failed in the preceding CI run passed here.

**Cause:** The earlier A-1116 correction made the new `run-name` parser newline tolerant but did not update the separate assertion against the protected YAML job's `if` block. This is a preventable second cross-platform authoring omission, not evidence of NSIS/install/GUI failure, job-level gate bypass, or audio regression.

**Correction:** Updated that single diagnostic assertion to `/^ {2}verified-installer-producer:\r?\n {4}if: >-\r?\n/m`. Checked the existing workflow source with normalized LF and CRLF strings (PASS) and deliberately incorrect indentation (REJECT). Left `.github/workflows/windows-installer-single-runner-smoke.yml`, both opt-ins, owner/ref/SHA/attempt gate, precheckout refusal, all product source, zero-upload policy and actual installer behavior unchanged.

**Verification:** Focused pure JavaScript assertion PASS for LF, CRLF and invalid indentation. New exact-head GitHub Windows/macOS/native CI and separate formal review still required; no local npm-dependent lint/Vitest execution, workflow dispatch, app launch or physical owner-PC test was performed.

**Prevention:** For every source-text assertion added to a Windows/macOS CI test, audit **all** newline-dependent patterns, not just the first one, and check real CRLF and LF fixtures before publishing. Do not repeat manual 130-minute production installer runs to investigate a source-test parser error.

**Impact/accounting:** One additional failed CI head, source correction and task reporting. Exact clock and usage meter are unavailable from this cloud connector. Linked usage row: `agents/usage-log/2026-11-22-pr454-crlf-diagnostic-fix.md`. Incident number A-1117 was absent from default-branch code/issue search; unmerged local reservations may not be visible.
