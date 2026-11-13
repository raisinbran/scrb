# Test tone for the macOS capture tests

The capture tests play a tone with `/usr/bin/afplay` so the meeting track has sound. You can use your own file instead of the generated sine tone. Keep it outside git, for example in `~/scrb-dev-assets/tone/`; the tests only play it, nothing copies or reads it.

| Variable | Effect |
| --- | --- |
| `SCRB_TEST_TONE_FILE` | Replaces the tone file in the scripts marked "own file" below. Quote the path: it may contain spaces. |
| `SCRB_TEST_TONE_VOLUME` | `afplay -v` level, 0 to 1. With `SCRB_TEST_TONE_FILE` and no volume, 0.3 is used. Applies to every script below. |

With neither variable set, every command is unchanged.

| Script | Class | Own file? |
| --- | --- | --- |
| `tests/capture-smoke.mjs`, `tests/restart-helper.mjs`, `scripts/stream_stop_case.mjs` (tone is a path argument) | a: any sound | yes |
| `scripts/stop_paused_case.py`, `scripts/device_case.py` (generate a tone; `device_case.py` already plays at `-v 0.05`) | a: any sound | yes |
| `scripts/pause_case.py` | b: asserts 880 Hz level above 500 and a 2000 Hz marker | no, volume only |
| `scripts/long_run.py`, `scripts/long_run_app.mjs` | c: must outlast hours | no, volume only |
| `spikes/TapChecks.swift`, `spikes/HandsFreeClock.swift` | one-off spikes taking a file argument | not changed |

Why the others are not overridden: `pause_case.py` measures the generated tone, so a song would fail it. The long runs need one player process for hours: the tap follows that process id, and `afplay` cannot loop, so restarting it would drop the meeting track. For those, pass `<tone file>` (an hours-long one, as before) and lower the volume only if you accept that the level checks (`pause_case.py` needs the 880 Hz level above 500) were not re-validated at low volume.

Example, run from the repository root (Claude app terminal, no admin):

```bash
SCRB_TEST_TONE_FILE="$HOME/scrb-dev-assets/tone/<your file>.mp3" \
  bash native/macos-capture/scripts/run-muted.sh node native/macos-capture/tests/capture-smoke.mjs \
  native/macos-capture/build/scrb-capture <compiled transcription dir> ignored.wav <scratch dir>
```

The tone argument is still required but ignored while the variable is set. The tap records before the speaker volume, so `run-muted.sh` stays on.

Test of the mechanism (stub `afplay`, plays nothing): `bash native/macos-capture/tests/tone.test.sh`, with node on PATH (`~/.local/share/scrb-node/current/bin`).
