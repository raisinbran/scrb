# Gate 8 — microphone / Input Profile acceptance (Mac + Windows)

**Owner-approved scope:** 2026-11-16. Applies to V1 on **installed builds on both platforms**. Gate 2 remains approved and closed. **M1 may proceed without these features**, with honest disclosure that individual controls are not implemented; Gate 8 cannot pass on that basis. This is a test contract, not a claim of test execution or permission to run a test over 20 minutes.

Requirements: [V1 v1.2 audio settings](../../dev-plan/Meeting%20Scribe%20-%20V1%20Requirements%20v1.2.md), [V1 workstream](../plans/v1-input-settings-closure.md), [development plan](../../dev-plan/Meeting%20Scribe%20-%20Development%20Plan%20(v2.0).md). Tracking: [#335](https://github.com/raisinbran/scrb/issues/335).

## Evidence and disposition matrix

Record result **PASS / FAIL / NOT RUN** for each row on **MacBook Air M5 (Apple Silicon)** and **Regiurn (Windows 11)**, plus **BCHEN-W10** for independent Windows-device coverage when available. Archive version/commit, capture-helper revision, OS build, input device, feature availability, original/processed audio digests, audio metrics, transcription metrics, test fixture, elapsed runtime and reviewer. **A simulated Settings save or UI click never counts as a functional pass.**

| ID | Mandatory V1 acceptance check | macOS | Windows |
| --- | --- | --- | --- |
| G8-IN-01 | Voice Isolation / Studio / Custom select **distinct working processing behaviors**; control states, saved/restored values and applied runtime state agree. | NOT RUN | NOT RUN |
| G8-IN-02 | Noise suppression **Off / Standard / Strong** measurably affects noisy recognition copies, with recorded metrics and preserved near-end words. Off is an effective bypass; controls are not merely stored. | NOT RUN | NOT RUN |
| G8-IN-03 | Echo cancellation **On/Off** measurably suppresses remote speaker bleed into the microphone recognition stream, including far-end-only and double-talk cases; no loss of independent near-end words beyond a preapproved bound. Final-pass text-only echo filtering alone does not satisfy live mode. | NOT RUN | NOT RUN |
| G8-IN-04 | Automatic gain control **On/Off** produces measurable, bounded gain normalization on quiet/loud input without clipping or suppressing speech. | NOT RUN | NOT RUN |
| G8-IN-05 | **Bypass system input processing** matches its declared semantics for supported devices and does not falsely promise to bypass unavoidable driver/hardware effects. Unavailable capability is reported clearly and addressed by owner-approved design, not silently ignored. | NOT RUN | NOT RUN |
| G8-IN-06 | **Input sensitivity** manual dB threshold and **Automatic** mode alter *recognition gating only*, with documented treatment of quiet speech, pauses and noise; never drop or alter saved original chunks. | NOT RUN | NOT RUN |
| G8-IN-07 | **Advanced voice activity** toggle measurably changes recognition detection as specified, without unexpected loss of saved audio. | NOT RUN | NOT RUN |
| G8-IN-08 | **No audio detected warning** respects On/Off; real silent/missing microphone behavior and critical recording-integrity warnings remain safe and truthful. | NOT RUN | NOT RUN |
| G8-IN-09 | **Audio device suggestions** respects On/Off on insert, unplug, default-device changes, and mid-meeting changes; recording continues or accurately warns of gaps. | NOT RUN | NOT RUN |
| G8-IN-10 | **Original microphone and meeting audio remain unprocessed and synchronized** as promised; processing applies to a separate transcriber copy; no capture gaps, new drift, clipping, or loss of the original needed for reprocessing. Where system/driver effects cannot be bypassed, document actual behavior and resolve against approved requirements before marking PASS. | NOT RUN | NOT RUN |
| G8-IN-11 | No change to other applications' audio volume during any input processing or mode transitions. Validate using original Mac echo-spike method and **at most 0.5 dB measurement difference**; report both output and meeting-track levels. | NOT RUN | NOT RUN |
| G8-IN-12 | Observe transcription accuracy, latency, CPU/RAM and audio quality with effects On/Off on both platforms; compare negative/positive controls and define any not-yet-specified numeric fidelity/suppression thresholds in the approved implementation plan. Existing overall V1 accuracy, drift, memory, long-run and responsiveness targets still apply. | NOT RUN | NOT RUN |
| G8-IN-13 | Detect and report supported OS-native options: Apple Mic Modes and Windows Voice Focus/OEM enhancements. Verify whether each option actually feeds SRCB's selected input path and whether the app can expose user controls; include **unsupported** device fallback with functional V1-equivalent behavior. | NOT RUN | NOT RUN |
| G8-IN-14 | Keyboard/UI settings, privacy disclosures, help/manual and labels describe **real** effects. Confirm ordinary native/audio effects do not contradict claims about preserving originals; no mock-only or inactive controls exposed as functional. | NOT RUN | NOT RUN |

## Test method and restrictions

1. Use fixed-level invented tones or public AMI speech with **both** microphone and meeting signals, noise, delay/echo, quiet speech, high volume and intentional overlap; test in live recognition and final pass separately. Verify word recall and false deletions, not only perceived audio quality. Run explicit On/Off pairs per control.
2. Repeat on built-in mic, one available external/USB mic and representative headset where practical; document unavailable hardware rather than inventing evidence. Record settings actually applied, including OS-native options. Use a second Windows device when available to check hardware dependence.
3. Validate the unprocessed saved original against the capture reference; apply audio processing to an isolated transcriber copy, preserve processing provenance for reprocessing, and confirm no user-facing output ducking. The 2026-11-13 Mac native AEC spike showed a **9 dB meeting-track reduction and is a FAIL** for that implementation, not a waiver.
4. Save independent acceptance results and hashes with the gate evidence, clearly distinguishing CI/mocks, synthetic physical test, and real hardware/test meeting. Obtain independent reviewer verdict and explicit owner Gate 8 sign-off.
5. Do not inspect, modify or delete owner meeting recordings; do not interrupt an active Scribe session. Get owner approval before any run expected to exceed 20 minutes; failed tests are not automatically rerun.

**Failure rule:** A control that only persists a setting, or an OS-native effect only available on one tested machine without an acceptable functional fallback, **does not pass V1**. Any removal/relaxation needs a separately recorded owner-approved V1 requirements amendment. A Gate 8 verdict shall enumerate all incomplete checks, not silently infer acceptance from the phrase “offers the three audio presets.”
