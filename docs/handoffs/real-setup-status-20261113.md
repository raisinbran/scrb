# Real `getSetupStatus` (2026-11-13)

Problem: the "Where are you based?" dialog showed on every launch in real mode. `getSetupStatus` was mock-only.

Change: a real handler (`apps/desktop/src/main/setup-status.ts`), routed as real in `hybrid-backend.ts`. `locationSet` comes from the persisted settings. The contract is unchanged.

## Values that are not real yet
- `models: []`: no real model inventory exists in the main process, so Settings > Models shows no rows in real mode instead of the mock's invented "installed" models. A real inventory needs a backend source (library `models` folder plus config) and an owner decision on what "installed" means.
- `permissions`: `unknown` for both. No real permission probe is wired to this call.
- `complete`: `false`. Nothing reads it today.
- If the library fails to open, the hybrid falls back to the mock as before.

## Settings persistence in real mode
Persisted by the real backend (library index, `app.settings` and `storage.autoDelete`): audio selection and all other audio fields, transcriptionQuality, summaryDefaultLength, location, theme, transcriptFontPx, autoDelete. `storageLocation` is read from the library location file.
Mock only: `pickStorageLocation` (a fake path; not in the real call set, so it does not move the library).
The mock keeps its own copy in localStorage, but the hybrid overwrites it from the real settings at startup.
