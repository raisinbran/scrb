# Handoff: "Show mini window while recording" setting

The owner asked for a setting, default on, to turn the mini recording window off for good. It needs a new field in `AppSettings` (`packages/contracts/`), so it is not in the Hide/Show PR.

**Field needed:** `miniWindowEnabled: boolean` (default `true`) in `AppSettings`, and in its validation and the settings defaults.

**Behaviour once it exists:** the main process reads it in the mini controller. When false, `shouldShowMini` is false (no mini window ever opens, and the title-bar "Show mini window" button is not offered). Turning it back on while recording lets the next focus change open the window. The settings screen gets one checkbox in the recording section.

Needs owner approval for the contract change before it is built.
