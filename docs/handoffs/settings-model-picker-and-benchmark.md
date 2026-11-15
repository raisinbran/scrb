# Settings: model picker, benchmark button, Help paragraph (needs owner approval)

Date: 2026-11-15. Source: the owner's feedback after trying the packaged Mac app. Nothing here edits `packages/contracts/`.

## What exists today (checked in the code)

- **One model per role ships.** `getSetupStatus` (`main/setup-status.ts`) reports one `ModelInfo` per role, read from the config file. There is no list of alternatives, no sizes or hardware needs per model, and `ModelInfo.version` is the string `local`.
- **The real backend does not implement `checkModelUpdates`, `installModelUpdate` or `revertModel`.** Only the mock does. The manual already says Settings > Models is simulated (`docs/user-manual/README.md`). So "Revert to previous model" does nothing on a real build.
- **Hardware rule (plan step 1) is built, but only picks a preset, not models.** `recommendQuality` (`packages/app-core/src/performance.ts`): under 8 GB RAM or under 4 cores → Fast, else Balanced. Best quality is never recommended. `resolvePerformance` turns the preset into live on/off and thread counts. `main/backend.ts` reads `os.availableParallelism()` and `os.totalmem()` once at startup.
- **It runs only to set the default for a new install** (`createSettingsHandlers(..., defaultQuality)`). The result is not shown anywhere: the Performance dropdown has no "(Recommended)" mark, and existing saved choices are never changed. The UI cannot see the cores or RAM.
- **No benchmark exists** (plan step 2 is unbuilt). Nothing times the PC. No first-launch benchmark, no Help or manual text about one.
- **Help screen** shows About, models installed, credits and notices. The manual points to `docs/user-manual` and is not in the app. Neither mentions how models are chosen.

## Item 1: model dropdown with "(Recommended)" and the red warning

Cannot be built honestly yet. The dropdown needs a list of choosable models per role, which nothing provides, and there is no hardware data in the UI. Proposed contract additions (owner approval needed):

1. `ModelInfo` gains `choices: ModelChoice[]` and `selectedId: string`, where `ModelChoice = { id: string; name: string; sizeBytes: number; installed: boolean; fit: 'recommended' | 'ok' | 'tooHeavy' }`.
2. New call `selectModel: { request: { role: ModelRole; modelId: string }; response: void }`. It replaces `revertModel` in the UI (the contract call can stay).
3. Both new names added to the preload and main allowlists. Backend computes `fit` (RAM and cores rule, same inputs as `recommendQuality`) so the UI holds no hardware logic.
4. UI: dropdown per role, "(Recommended)" after the `recommended` choice, persistent red warning "Warning: This model may cause computer instability due to insufficient hardware requirements." beside it when the selected choice is `tooHeavy`. Red uses an existing token in `theme/tokens.css`.

Prerequisite the owner should decide: a second model per role must actually ship or be downloadable (today the model download plan covers five fixed files). Without that, the dropdown has one entry.

## Item 3: "Re-run computer benchmark"

Needs the plan step 2 (`docs/plans/performance-settings.md` section 2.3), which is not built. Proposed button in the Models section, tooltip "Picks optimal models based on your computer". Contract and handler changes (owner approval):

- `AppSettings.performanceCheck` (read-only to the UI, omitted from `SettingsPatch`), as in the plan section 2.5.
- Calls `runPerformanceCheck` (void → `performanceCheck`) and `cancelPerformanceCheck` (void → void); refused while recording, final pass or import is running.
- Handler in main: times a 30 s clip with the live and final models (real-time factor), 90 s cap, below-normal priority, then sets `fit`/recommended choices and the preset. Thresholds are provisional until calibrated on the owner's Mac.
- Needs packaged tools and models, so after the installer resources work.
- Mock: fake slow and fast PC in the developer menu.

## Item 2 (preset lock) and item 4 (Help paragraph): no contract change

Preset lock is its own PR. The Help paragraph is a separate small PR. It states only what is true today (RAM and cores rule for the Performance preset on a new install; no timed benchmark yet) and will be updated when item 1 or 3 lands.

## Decisions needed

1. Approve the `ModelInfo`/`selectModel` contract change, and say whether a second model per role will ship.
2. Approve `performanceCheck`, `runPerformanceCheck` and `cancelPerformanceCheck`.
3. Whether the Performance dropdown shows "(Recommended for this PC)" now. That needs only a read of the recommendation, so it also needs a contract field (for example `AppSettings`-adjacent `recommendedQuality`).
