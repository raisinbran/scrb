# Handoff: app icon choice needs one contract field (owner approval needed)

**From:** UI session. **For:** owner, then the backend and UI sessions. **Blocks:** the Settings icon selector. The icon artwork is in PR #236.

## What the owner asked for

`r1ai` is the shipped app icon. Under Settings, in the theme selection section, the user can pick another icon: `r1a`, `r5c`, `r5ci`, `h3sb`, `h3sbi`, `h3sd`, `h3sdi` or `r1ai`. The choice switches the running app's Dock and window icon, is remembered, and all eight icons ship with the app.

## Why this needs the contract

The choice must be saved and the main process must act on it. Both go through `AppSettings` and `updateSettings`, which live in `packages/contracts`. Nothing else fits: the renderer's `localStorage` cannot be read by the main process, and a new call name would also change the contract. So no UI or main code was written; the contract change is the first step.

## Exact contract change (needs owner approval)

1. `packages/contracts/src/types.ts`, in "Settings and models":

   ```ts
   export type AppIconSetting =
     'r1ai' | 'r1a' | 'r5c' | 'r5ci' | 'h3sb' | 'h3sbi' | 'h3sd' | 'h3sdi';
   ```

   and in `AppSettings`, next to `theme`: `appIcon: AppIconSetting;`. `SettingsPatch` takes it automatically (top-level keys are shallow-merged).

2. `packages/contracts/src/validate.ts`, in `settingsPatch`, after `theme`: `appIcon: oneOf('r1ai', 'r1a', 'r5c', 'r5ci', 'h3sb', 'h3sbi', 'h3sd', 'h3sdi'),`. Add the field to the contract test fixtures that build a full `AppSettings`.

3. No change to `CALL_NAMES` or `EVENT_NAMES`, so the preload allowlist and the single call and event channels stay as they are.

## Work that follows once the field exists (not done)

- **Backend (`packages/app-core/src/settings.ts`):** default `appIcon: 'r1ai'`; an older settings file without the field loads as `'r1ai'`. Tests in `settings.test.ts`.
- **Main (`apps/desktop/src/main/`):** a small `app-icon.ts` that maps each allowlisted name to a bundled PNG (the renderer only ever sends the name, never a path) and, at startup and after `updateSettings` changes `appIcon`, calls `app.dock?.setIcon(...)` on macOS and `setIcon` on every `BrowserWindow` on Windows. Replace the fixed `icon.png` call at `main.ts:330` and `devWindowIcon`. Limits to state in the UI: the icon in Finder, the Applications folder and Windows Explorer stays `r1ai` (it is baked into the bundle and executable); on macOS the Dock icon reverts to `r1ai` when the app quits, and is set again at the next launch. Unit test the name-to-file mapping and that an unknown name is ignored.
- **Packaging:** `make-icons.mjs` gains a mode that writes the eight 512 px PNGs to `apps/desktop/assets/icons/choices/`; `electron-builder.yml` ships that folder through `extraResources`, and `main` resolves it from `process.resourcesPath` when packaged. A test checks all eight files exist.
- **UI (`apps/desktop/src/ui/`):** an "App icon" fieldset under the Theme fieldset in `SettingsScreen.tsx`, a radio group of eight labelled previews (keyboard operable, covered by the accessibility test), saved through `updateSettings({ appIcon })`. The preview images are the PNGs; no new colours, so `theme/tokens.css` is untouched.
- **Mock backend:** `fixtures.ts` gets `appIcon: 'r1ai'`; `mock-backend.ts` merges it like `theme`, and `mock-backend.test.ts` checks it matches the contract.
- Then `npm run check` and one smoke run.

## Prerequisite

PR #236 (icon artwork, `r1ai` as the shipped icon) should merge first; the work above builds on its `scribe-<name>.svg` files and `make-icons.mjs` outputs.
