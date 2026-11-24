### A-1092 — 2026-11-22 — V1-B safe quit — initial lint and type-check findings

- **What failed:** The first local lint run found an unnecessary initialization and a `prefer-const` violation in new guard/test code. The first TypeScript pass also found that Electron message-box buttons were inferred readonly.
- **Attribution / impact:** Confirmed authoring errors caught before publication; no application was launched, no lifecycle action ran, and no user data was accessed.
- **Correction:** Removed the unnecessary initialization, used a constant test binding, and typed the dialog options as Electron's mutable `MessageBoxOptions`. The changed files now pass ESLint and emit no changed-file TypeScript errors.
- **Remaining risk:** Full local typecheck remains blocked by unrelated missing `pdfjs-dist` and `@vitejs/plugin-react` dependencies; exact-head CI is pending.
