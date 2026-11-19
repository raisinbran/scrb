### A-805 — 2026-11-18 — Codex Desktop / MacBook Air M5 — FFmpeg license probe did not allow wrapped license text

- **Status / attribution:** Confirmed verification-script expectation error; no application defect.
- **What failed:** The packaging pass reached the FFmpeg license check, where the verifier required `GNU Lesser General Public License` on one line. FFmpeg 9.0 wraps `Public` and `License` across lines while reporting the correct LGPL 2.1-or-later license.
- **Impact:** Provenance generation stopped before outer-bundle signing. The candidate remained in the isolated worktree; no installed app or backup was changed.
- **Correction / remaining risk:** Accept whitespace/newline wrapping. The published provenance records the output digest and expected-pattern result without embedding raw probe output. Low.

- **Publication ID reconciliation:** Published here as A-805; the original local candidate record A-795 remains unchanged. The original identifier overlapped the open incident set for PR #368.
