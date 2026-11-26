### A-717 — 2026-11-17 — Codex / Mac — Spotlight metadata lookup missed installed app
- **Status / attribution:** Confirmed agent error; no product defect.
- **What failed:** The first bundle check used `mdls`, which reported it could not find `/Applications/Scribe.app` even though the bundle existed.
- **Impact:** That chained metadata command stopped before collecting any bundle details.
- **Correction / remaining risk:** Switched to direct `plutil` and `codesign` reads and confirmed the bundle identity. Low.
