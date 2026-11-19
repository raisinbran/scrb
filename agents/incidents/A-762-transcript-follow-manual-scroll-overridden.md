### A-762 — Animated transcript follow suppressed manual scrolling

- **Status / attribution:** Confirmed application regression introduced in PR #352; correction committed and validation pending.
- **What failed:** Exact-head Windows and macOS CI at `36032a94` both failed the existing LiveScreen regression **“stays on the text being read when a row above it goes away”** with `TypeError` at `LiveScreen.test.tsx:697`: the expected virtualized row was not rendered after a manual scroll. This must not be dismissed as a flaky or unrelated test.
- **Evidence:** [CI run 44200474949](https://github.com/raisinbran/scrb/actions/runs/44200474949), both platform Test steps.
- **Cause:** The new Live auto-follow animation's scroll handler treated every `scroll` event during an active animation as programmatic and ignored a manual scroll event. Auto-follow could therefore remain enabled and overwrite the reader's position.
- **Correction:** Commit `c2be4a8c` tracks the actual position assigned by the animation; if a scroll event differs, it cancels the animation and switches off following. Commit `d1d9588a` adds an explicit regression assertion that a manual scroll turns off following even while animation is active.
- **Remaining risk:** Pending exact-head CI and independent real-Electron review. The bounded eased motion and user manual-scroll cancellation must both work; do not revert to an instant jump simply to pass CI.
- **Prevention:** Test conflicting user input during asynchronous UI animations and preserve the existing reader-anchor regression rather than weakening it.
