### A-1231 — 2026-11-27 — Claude Code — Measured the dev-only tonal design as if shipped; no start usage reading

- **Agent:** Claude
- **Attribution:** Confirmed self-induced. The first transcript-inset measurements ran in the dev browser, where `main.tsx` applies the tonal design only when there is no Electron bridge, so the shipped app uses the baseline rules and the first numbers did not match what the owner sees. Usage was also not read at task start.
- **Evidence:** The browser audit showed 8 px insets; the Electron e2e run measured 5 px and 9 px, and the page had no `data-design` attribute.
- **Impact:** About ten extra tool calls and a first CSS edit aimed at the wrong rules; corrected before commit by fixing the baseline rules and keeping the tonal ones consistent.
- **Correction:** Final numbers come from the Electron e2e (real shipped styling); start usage recorded as unavailable.
- **Remaining risk:** Low. Check which design a surface really uses before measuring it.
