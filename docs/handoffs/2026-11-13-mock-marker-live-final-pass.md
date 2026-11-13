# Mock marker cannot see live text or the final pass

The title bar shows "Mock backend" when real recording is not set up. The renderer learns this from the existing `getRecordingSnapshot`: the real side answers `notImplemented` when `SCRB_CAPTURE_HELPER` is unset, and no contract change is needed.

It cannot see whether `SCRB_LIVE_CONFIG` or `SCRB_FINAL_PASS_CONFIG` is set. No existing call or the preload bridge exposes either, so a build with the helper but without those two variables shows no marker and simply lacks live text or the final pass. `scripts/m1.sh` covers this by refusing to start when any of the three is missing.

If the marker should cover all three, the contract needs a field (for example a `realModes` flag on `getAppInfo`). That needs owner approval; nothing was added.
