### A-916 — 2026-11-20 — UI tooltip PR #383 first exact-head CI formatting failure

- **Classification:** Confirmed author-side formatter omission, not a functional tooltip failure.
- **Observed evidence:** CI run 44809711720 macOS `Check Prettier on changed TypeScript` failed at initial source head 633f4b4684b5799c08b136b863a3f030d8318900. Its exact diff required compact `<span>` props in apps/desktop/src/ui/components/PlayingIndicator.tsx and a single-line status badge in apps/desktop/src/ui/screens/recordings/LibraryView.tsx.
- **Impact:** First-head macOS CI was red, not eligible for review; no physical app, native model, recording or installed package was changed.
- **Correction:** Applied only the two formatter diffs on the draft PR #383 branch. New exact-head Windows/macOS CI must succeed before an independent formal review. Preserve earlier failed run evidence.
- **Prevention:** Compare Prettier outputs before publication and scope fixes to the actual formatter diff.
- **Publication:** Unreviewed cloud coordination branch only, not main/PR #383. This is distinct from A-915 (first test insertion anchor rejection).
