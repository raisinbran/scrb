### A-410 — 2026-11-15 — Mac — blanket Prettier on docs/plans committed unrelated files

- **Status / attribution:** Confirmed agent command error (same family as A-360).
- **What failed:** I ran Prettier on `docs/plans/*.md` and staged the whole folder, so about 50 unrelated plan files were reformatted and committed on PR #291.
- **Impact:** Briefly noisy diff; no content change. Caught before review of that commit.
- **Correction / remaining risk:** Restored every unrelated file to its previous content in a follow-up commit; the PR net diff touches only the three plans, the usage row and incident files. Low.
