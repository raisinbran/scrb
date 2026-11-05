# Windows Gate 3 — AMI owner-launch failure and Electron Node-mode diagnosis

**Observed:** 2026-11-03 (Pacific). **Candidate:** `e85eefed98298221cf921ba62f9b2e3e325a54bd`.  
**Disposition:** First launcher attempt failed before recording; corrected second attempt **completed** and produced a **numerical PASS** for the 15% relative WER reduction requirement (pending independent QA). Windows Gate 3 remains **NOT APPROVED**.

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

**Follow-up (later November 3):** The owner completed the physical AMI test using the corrected launcher; see measurements below. The earlier startup diagnosis alone did not establish WER.

## Follow-up: successful owner attempt and reference scoring (November 3, PT)

The owner launched the corrected `Start-Owner-Test.ps1` in a normal Windows PowerShell session. The **second attempt** created `attempt-02`, `test-profile-02`, and `test-library-02`, preserving the first failed `attempt` unmodified. `attempt-02/startup-ready.json` records a responsive **Meeting Scribe** window, an absent Node-mode environment entry, and successful Electron startup. The fixed public source and pinned candidate were unchanged.

The uploaded private archive contains `attempt-02/live-before-stop.json`, `final-transcript.json`, `completed-meeting.json`, `completion.json`, `snapshot.json`, captured audio chunks, and source WAV. The application transitioned from observed `finalPassRunning` to `ready`; the saved meeting has `transcriptionFailure: null`. Collection finished normally with **no automatic retry or second recording**.

### WER calculation — read-only, preliminary QA

The original `score.py` mistakenly hardcodes `p/'attempt'` and therefore produced `FileNotFoundError` for `attempt/live-before-stop.json`. The **actual transcripts are both in `attempt-02`**; neither was missing. The reviewer initially computed scores independently from the retained ZIP using the existing `phase0/scripts/score_ami_wer.py` lowercase/punctuation/filler normalization and unit-cost Levenshtein distance, retaining **all meeting-track words** (no time trimming) and excluding microphone words. **Afterward, the owner ran a separate corrected `score-attempt-02.py` locally; its printed numbers exactly matched the independently calculated values below.**

| Metric | Live | Final |
| --- | ---: | ---: |
| Normalized reference words | 826 | 826 |
| Hypothesis words (raw / normalized) | 596 / 594 | 704 / 701 |
| Substitutions | 133 | 50 |
| Deletions | 247 | 139 |
| Insertions | 15 | 14 |
| Total errors | 395 | 203 |
| Word error rate | **47.82%** | **24.58%** |

**Relative WER improvement:** `(395 - 203) / 395 * 100 = 48.61%`. The predefined accuracy requirement is **at least 15%** fewer errors relative to the Windows live transcript on the **same** AMI reference. The **numeric requirement passes for this one predeclared seven-minute sample**, subject to independent QA of the data and pipeline.

**Owner-executed scorer confirmation (November 3, PT):** The owner created `score-attempt-02.py` by changing the input folder from `attempt` to `attempt-02` and ran it using the pinned local Python interpreter. The owner-provided PowerShell output reported `WER: 0.4782082324455206` (live), `WER: 0.2457627118644068` (final), `relativeImprovementPercent: 48.60759493670886`, `numericThresholdMet: true`, and **`verdict: INCONCLUSIVE_PENDING_ALIGNMENT_AUDIO_AND_COMPLETENESS_REVIEW`**. The final live/final word end times were `424019.2334` / `424690` ms. This is a **successful scorer execution**, not a scorer-certified overall PASS: the script intentionally leaves the separate audio alignment and completeness review unresolved. A separate read-only review of the retained audio is described below. The owner shared the stdout in chat; this documentation does **not** claim that a `scores.json` artifact was independently verified on disk.

### Audio coverage, timing, and caveats

- The saved recorded meeting duration is **940.683 s (15m 40.683s)** because the owner left recording running long after the seven-minute playback; the extra material is essentially silence, not a repeated audio test.
- Review decoded and concatenated all **203 meeting Opus chunks**, and compared the resulting PCM signal to the pinned **420-second** source WAV. Source excerpts at the beginning, across the interior, and through the **final 10 seconds** correlate with the recorded track at a stable approximately **+4.701 s** alignment within the reconstructed file. No sampled alignment drift or repeated source playback was observed. Playback end corresponds to about **424.7 s** into the reconstructed recording.
- The manifest lists **16 small gaps totaling ~0.236 s**: 15 startup gaps ending by approximately 1.63 s, and one at approximately 871 s, long after source playback. **No manifest gap intersects the AMI stimulus interval**. The transcript files themselves have zero transcript gap entries; these are not a substitute for audio-manifest review.
- The meeting-audio RMS drops to effectively silent after approximately **425 s**; the recognized live and final words end at ~424.0 s and ~424.69 s respectively. No model output was trimmed after scoring.
- Retained `live-progress` events show real live worker/model activity and meeting words. They report **nonzero input/lost-frame counters**, while logged rejected/overflow frame counters are zero at the sampled times. Their interpretation and any separate live-capture quality acceptance requirement remain for QA; do **not** write that all frame-loss metrics are zero.
- Final processing was observed as `finalPassRunning` at **20:57:51 PT** and as `ready` at **21:03:16 PT**. The recorded **324.968 s** measures owner Stop acknowledgement to first observed ready, with ~5-second polling; it is **not** pure inference duration. This CPU-based test does not establish the separate GPU-capable speed requirement.

**Scoped finding:** Preliminary **PASS for this sample's 15% relative WER improvement**, supported by real saved meeting audio and both transcripts. **Not** a Windows Gate 3 approval or evidence that the 4-hour endurance, activation latency, both-busy-track delay, GPU speed, imports or other acceptance requirements passed. Keep all private audio, annotations, reference, logs, both attempts, and both transcripts outside Git until owner-authorized cleanup.

## Retention, privacy and scope

Private diagnostic evidence stays in the owner's `gate3-reference-e85-20261103` folder, including `attempt/electron-stderr.txt`, `attempt/electron-stdout.txt`, `attempt/launch-settings.json`, the launcher and the owner handoff. The original failed attempt is **not to be deleted** to permit reuse. Public source audio/reference assets and any later actual recordings or transcripts are retained locally under the [gate evidence-retention policy](evidence-retention-policy.md), not committed to Git.

This is **documentation only**, including the first launch diagnosis and subsequent read-only evidence review. It does not change production code, test thresholds, or Gate 3 approval.
