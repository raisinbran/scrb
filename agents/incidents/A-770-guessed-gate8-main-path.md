### A-770 — 2026-11-17 — cloud-only V1 audit — guessed Gate 8 document path before listing the directory

- **Observed effect:** A read-only `fetch_file` for `docs/gates/gate-8-capture-verification.md` returned GitHub 404 because that guessed filename is not on `main`. A second lookup for `gate-8-input-settings-acceptance.md` on `main` also returned 404 because that proposed checklist is present only in open PR #337.
- **Agent-controlled cause:** Assumed plausible paths/merge status instead of first listing `docs/gates/` and checking the PR head.
- **Impact:** Two unnecessary failed metadata reads; no source files, tests, recordings, GitHub branches or device state were modified.
- **Correction:** Listed `docs/gates/`, verified the proposed checklist on PR #337, and distinguished current-main documents from unmerged PR evidence in the V1 audit.
- **Remaining risk:** None to application behavior; recheck document paths and incident-ID uniqueness before documentation PR merge.
