### A-357 — 2026-11-13 — Windows setup follow-up — Node runtime PATH prerequisite unavailable

- **Status / attribution:** Confirmed execution deviation; no product or build files were changed in the follow-up.
- **What failed:** The requested `npx --yes --package=node@22.23.4 --call "node -v"` wrapper produced no output and remained active for over 35 seconds before interruption (exit code 1, with no emitted error text). A first wrapper attempt also produced no usable output. The shell PATH contained only Node v26.13.0.
- **Impact:** The follow-up stopped before the Step 3 fetch/build commands. No libopus fetch or checkout was attempted, and no capture build or app launch was performed.
- **Correction / remaining risk:** The handoff records this prerequisite blocker and the GPU query result. Steps 3 and 8 still require a successful Node 22.23.4 PATH setup. Low.