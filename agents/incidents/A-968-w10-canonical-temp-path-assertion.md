### A-968 — 2026-11-20 — W10 — DLL collection test expected a lexical path

- **Status / attribution:** Confirmed W10-authored cross-platform test expectation error; the helper returned the canonical path as designed.
- **What failed:** On both Windows and macOS, the new adjacent-DLL test expected the fixture's lexical temp path. The runners canonicalize temp paths differently (short versus long temp path on Windows; /var versus /private/var on macOS), so the assertion failed.
- **Evidence:** PR #392 CI run 44863570608; Windows and macOS each failed only scripts/ami-remote-workspace.test.mjs in the DLL collection assertion; remaining suite tests passed.
- **Cause:** The expected value used join(f.bin, ...) instead of the same canonicalization the helper uses.
- **Correction:** Compare against realpathSync of the fixture DLL path; rerun CI only on the corrected source revision.
- **Impact / remaining risk:** No production behavior or external files were affected. New exact-head CI is pending.
