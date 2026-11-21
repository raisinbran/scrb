### A-970 — 2026-11-20 — W10 — Synchronous path assertion differed from async canonical path

- **Status / attribution:** Confirmed W10-authored cross-platform test expectation error; the DLL collector still returned the canonical sibling file.
- **What failed:** After A-968 changed the test to realpathSync, Windows still failed because synchronous realpath retained the runner's short temp path while the collector's asynchronous realpath returned the long path. macOS passed.
- **Evidence:** PR #392 CI run 44864475844; Windows failed only the adjacent DLL collection assertion; macOS CI passed.
- **Cause:** Windows Node path canonicalization differs between sync and async filesystem APIs for the runner temp alias.
- **Correction:** Assert the stable tools-folder and DLL filename suffix, leaving canonical containment enforced by the collector.
- **Impact / remaining risk:** No production behavior or external files were affected. Fresh exact-head CI is pending.
