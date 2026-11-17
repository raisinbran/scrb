# A-760 — Transcript scrolling PR failed the first macOS formatting check

- **Status / attribution:** Confirmed agent-authored formatting error; no user-data impact.
- **What failed:** The initial PR #352 macOS CI at head `1baa9ab3` failed the changed-TypeScript Prettier check. It would rewrite a multiline cubic easing ternary in `apps/desktop/src/ui/lib/transcript-scroll.ts` and the effect-cleanup layout in `apps/desktop/src/ui/screens/live/TranscriptView.tsx`.
- **Evidence:** GitHub Actions run [44200127406](https://github.com/raisinbran/scrb/actions/runs/44200127406), macOS check log showing the exact two diff hunks.
- **Cause:** The source was edited through the GitHub connector without running Prettier locally before publication.
- **Correction:** Commits `36fbeb17` and `3d031c23` apply the exact formatting shown by CI, without behavior changes; final exact-head CI is still required.
- **Prevention:** Verify formatting before opening a PR or initiating CI when a local formatter is available, and follow CI's precise diff when it is not.
