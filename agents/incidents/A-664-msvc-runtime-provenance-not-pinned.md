### A-664 — 2026-11-16 — Codex / BCHEN-W10 — MSVC runtime provenance was not pinned

- **Observed effect:** Independent review found that the stager recorded an MSVC redist version while accepting any existing `--runtime-dir`, so different runtime DLL contents could be mislabeled. The staged DLL hashes were recorded, but inputs were not checked against the stated package.
- **Evidence:** Formal review of PR #339 at head `f93814d7b20935a1ef53aef57c904b0e59d5c483`, P2 finding on `scripts/stage-win-tools.mjs`.
- **Attribution:** Agent-authored provenance-validation defect; the locally used DLL hashes and packaged smoke were accurate for this machine.
- **Correction:** Pin hashes of every loaded MSVC runtime DLL, record both the redist directory version and embedded DLL file version, and add a mismatched-runtime regression.
- **Remaining risk:** Exact-head CI and independent re-review are required after the correction.
