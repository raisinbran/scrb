# Mock marker cannot see live text

The title bar shows "Mock backend" when real recording or the final pass is not set up. The renderer reads this from existing calls: `getRecordingSnapshot` (answered only when `SCRB_CAPTURE_HELPER` is set) and `cancelImport` with an import id that cannot exist (answered, with `notFound`, only when `SCRB_FINAL_PASS_CONFIG` is set). No contract change.

It cannot see whether `SCRB_LIVE_CONFIG` is set. While idle no existing call, event or preload bridge field carries it: `getRecordingSnapshot.transcription` is null until a recording runs. A build with the helper and final-pass config but no live config shows no marker and simply lacks live text. `scripts/m1.sh` covers this: it refuses to start unless the live config and every tool and model path inside both configs exist.

If the marker should cover live text too, the contract needs a field (for example a `realModes` flag on `getAppInfo`). That needs owner approval; nothing was added. The owner can approve the narrower indicator instead.
