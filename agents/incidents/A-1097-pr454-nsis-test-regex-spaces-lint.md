### A-1097 — 2026-11-22 PT — cloud PR author — NSIS diagnostic test violated ESLint no-regex-spaces

**Observed failure:** Exact-head PR #454 application CI run [#45087266912](https://github.com/raisinbran/scrb/actions/runs/45087266912) failed the ESLint `no-regex-spaces` rule on Windows and macOS at `scripts/hosted-win-installer-single-runner.test.mjs:18:26`. The PR's Windows capture-source build and separately triggered source-only installer guard check succeeded; actual NSIS installer producer/consumer were not run.

**Cause and attribution:** During authoring of the new synthetic run-title/authorization assertion, the cloud PR author used a JavaScript regex with literal consecutive spaces: `/^  verified-installer-producer:\n    if: >-\n/m`. This was a self-induced test-source lint mistake, not a Windows installer failure or a regression in the protected workflow guard.

**Correction:** In the same PR branch, replaced the literal whitespace runs with equivalent explicit regex quantifiers: `/^ {2}verified-installer-producer:\n {4}if: >-\n/m`. The original strict anchors, expected 2/4-space indentation and target YAML markers remain. A focused isolated assertion check accepted the valid input and rejected a malformed indentation case. No job-level `if`, opt-in, source SHA, identity gate, upload policy, duration limit or production app code changed.

**Verification and residual risk:** The cloud connector does not provide this source checkout's installed npm dependencies for a local targeted ESLint/Vitest command; fresh exact-head GitHub CI must pass before the independent formal PR review and any owner-authorized merge. The old failed CI run is retained as evidence; no repeat of the 130-minute NSIS job was requested.

**Prevention:** Prefer explicit whitespace quantifiers and run focused source lint before publishing regex-based CI-test assertions; when local command execution is unavailable, report it and rely on the next exact-head CI without claiming local PASS.

**Impact:** One rejected PR CI head and required source correction; exact quota/time cost unavailable and shared account usage cannot be attributed. Accounted in `agents/usage-log/2026-11-22-pr454-nsis-regex-lint-fix.md`.
