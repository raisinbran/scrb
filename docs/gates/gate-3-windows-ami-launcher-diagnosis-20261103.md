# Windows Gate 3 — AMI owner-launch failure and Electron Node-mode diagnosis

**Observed:** 2026-11-03 (Pacific). **Candidate:** `e85eefed98298221cf921ba62f9b2e3e325a54bd`.  
**Disposition:** Failed launcher startup; **no AMI recording, no final pass, and no reference-based WER result**. Windows Gate 3 remains **NOT APPROVED**.

This note documents a narrow Windows test-launcher problem encountered **after** the separate, successful owner-operated one-hour final-pass recovery. That recovery's result is recorded in [PR #53](https://github.com/raisinbran/scrb/pull/53) and is not invalidated or rerun by this incident.

## Intended evaluation

The owner prepared an isolated AMI reference test on a Dell Precision 7760, using public AMI **ES2002a, 02:00–09:00** (seven minutes, **826 normalized reference words**). The pinned production-path models were live **base.en-q5_1 / CPU / six threads** and final **large-v3-turbo-q5_0 / CPU build / four-thread default**. The test was to retain a snapshot of the real live meeting transcript before Stop, finish transcription on that same recorded audio, and score both outputs against the same official reference.

Codex did not launch the physical test from its sandbox; it prepared a single-use, owner-controlled `Start-Owner-Test.ps1`, a separate profile/library, and private inputs. This was an authorized safe fallback, but the owner needed to run the physical test.

## Observed failure

The owner invoked `Start-Owner-Test.ps1` in normal **PowerShell 7.6.9**. The script created the `attempt` evidence directory and `test-profile`, then printed:

> Press Enter here ONLY after the recording indicator says Recording; this starts the one playback

**No Meeting Scribe window appeared.** A separate read-only diagnostic showed:

- No `electron.exe`, `scrb-capture.exe`, `whisper-cli.exe`, or `scrb-sherpa.exe` process.
- No `test-library` created; the AMI audio was **not** played and no recording began.
- `attempt/electron-stdout.txt` was empty; `attempt/electron-stderr.txt` captured an immediate error in the pinned `dist-electron/main.cjs` bundle:

```text
TypeError: Cannot read properties of undefined (reading 'isPackaged')
    at ... main.cjs:8816
Node.js v24.22.1
```

The failed startup therefore supplied **no evidence for or against the 15% WER improvement requirement**. Do not call it a transcription failure or a WER FAIL.

## Reproduced environment distinction

The owner then directly tested the pinned Electron executable:

| Observation | Result |
| --- | --- |
| In PowerShell 7, `& $electron --version` before removal | `v24.22.1` (Node.js) |
| In Windows PowerShell 5.1, same command before removal | `v24.22.1` (Node.js) |
| `[Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', scope)` for Process/User/Machine | Displayed blank for all scopes, which cannot distinguish absent from empty |
| `Test-Path Env:\ELECTRON_RUN_AS_NODE` before removal | `True` (entry present despite blank value) |
| `Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue` | Removed the entry |
| `Test-Path Env:\ELECTRON_RUN_AS_NODE` after removal | `False` |
| Same Electron `--version` after removal | `v45.1.0` (Electron) |

**Confirmed:** On this machine, an **empty but present** `ELECTRON_RUN_AS_NODE` environment entry changed the executable into Node.js mode; removing the entry restored normal Electron mode. The issue was **not specific to PowerShell 7 versus Windows PowerShell 5.1**.

**Not established:** How the empty entry was introduced or why the test launcher did not prevent the mode during its failed child launch. The uploaded launcher already attempted `[Environment]::SetEnvironmentVariable(name, $null, 'Process')` for `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `NODE_PATH`, but **did not assert variable absence in the effective child launch environment** or check the Electron process/window before prompting the owner. Avoid assigning an unproven root cause to application production code, PowerShell version, or Codex.

## Corrective action and acceptance

A **targeted launcher-only correction** has been assigned to Windows Codex; result **pending** at the time of this note. Require:

1. Remove `ELECTRON_RUN_AS_NODE` from the environment inherited by Electron, **not merely replace its value with an empty string**. Verify absence immediately before launch; if still present, fail closed.
2. Check that Electron stays alive and its application window opens **before** prompting the owner to click Record or press Enter.
3. On an early exit, show the startup error and stop without playing audio, recording, re-launching, or silently continuing.
4. Preserve the first `attempt` and `test-profile` as diagnostic evidence. Prepare a **new single-use isolated attempt/profile** for a corrected launch; do not delete or overwrite the first attempt.
5. Reuse the same pinned public AMI clip, tool/model assets, reference interval and scoring rules. No download, broad rebuild, long recording, model optimization or production-code change is required solely by this failure.
6. Permit only safe non-recording validation by the agent. The owner must conduct any physical recording in a normal desktop session.

**Reverification still required:** successful application startup with a new isolated profile, actual Windows live PCM transcript preserved before Stop, completed final transcript, audio coverage/alignment verification, and valid WER comparison against the unchanged AMI reference. Do not claim accuracy PASS from the environment diagnosis alone.

## Retention, privacy and scope

Private diagnostic evidence stays in the owner's `gate3-reference-e85-20261103` folder, including `attempt/electron-stderr.txt`, `attempt/electron-stdout.txt`, `attempt/launch-settings.json`, the launcher and the owner handoff. The original failed attempt is **not to be deleted** to permit reuse. Public source audio/reference assets and any later actual recordings or transcripts are retained locally under the [gate evidence-retention policy](evidence-retention-policy.md), not committed to Git.

This is a **documentation-only diagnosis**, not a code fix, retest result, gate approval, or change to accepted thresholds.
