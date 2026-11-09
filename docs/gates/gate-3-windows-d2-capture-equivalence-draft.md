# Gate 3 Windows: D2 capture-equivalence checklist (DRAFT)

Status: **DRAFT, NOT_FROZEN.** Nothing here was measured on a device. Every field marked PENDING is still to be read or measured by the owner or by a later, separately authorized harness step. No recording, test, rendering, installation or Windows audio setting change was done to write this document.

## 0. Owner approvals

- **2026-11-08 PT (time not recorded):** the owner approved, in chat, the protocol wording change for this retest: the **microphone track uses VB-CABLE (`CABLE Input` / `CABLE Output`)** and the **system track uses the existing endpoint-loopback route**, conditional on **measured isolation and capture equivalence**. No acceptance threshold is changed by this approval. The same approval is recorded in the amendment.
- Earlier, same retest: Option 1 (virtual audio cable, VB-Audio VBCABLE_Driver_Pack46) was chosen; the PT/UTC time of that message was not recorded in the files available to me.

Owner decision: Option 1, a virtual audio cable (VB-Audio VBCABLE_Driver_Pack46) for the microphone track. The cable's Windows endpoints are present on this PC (read-only listing shows `CABLE Input`, `CABLE Output` and `CABLE In 16ch`, all status OK). **Do not use `CABLE In 16ch`.**

## 1. How the candidate captures (code at 553dd90, `native/windows-capture/src/`)

| Item | Microphone track | System-audio track ("whole computer") |
| --- | --- | --- |
| Selection | Capture endpoint by ID from the app's mic setting, or the default for role `eConsole` when the setting is "default". The list offered to the app is every *active* capture endpoint (`Track.cpp` `ListMicsJson`). | The default render endpoint for role `eConsole` (or an ID if given). Used when `source` is empty ("whole computer") or a followed app is set. |
| API | WASAPI shared-mode capture client | WASAPI shared-mode capture client on the render endpoint with `AUDCLNT_STREAMFLAGS_LOOPBACK` (endpoint loopback). Per-application process loopback exists but is used only when a process is picked. |
| Requested format | PCM 16-bit, 1 channel, 48000 Hz (`Common.h` `kRate`, `Track.cpp` `MakeFormat`) | Same |
| Conversion | `AUTOCONVERTPCM` + `SRC_DEFAULT_QUALITY`: the capture client always requests the fixed 48 kHz mono PCM16 format above and Windows converts from the endpoint's own mix format. The capture client does not read the endpoint's mix format. | Same for the capture client. The separate silent-render client on the same render endpoint **does** call `GetMixFormat()` and initializes at that mix format (to play silence), so the render endpoint's mix format is read there. |
| Buffer | 2 s | 2 s |
| Windows enhancements | Not disabled by the helper. A grep of the five source files found no `SetClientProperties`, `IAudioClient2/3`, raw mode or exclusive mode, so the stream is an ordinary shared-mode stream and whatever enhancements Windows or the driver applies to the endpoint stay on. | Same, for the render endpoint's loopback tap |
| Extra behavior | Registers an audio-session watcher | Opens a **render client on the same endpoint and plays silence into it** so loopback keeps delivering (`Track.cpp` around the `Kind::System` branch) |
| Live feed | Native 48 kHz is also converted to 16 kHz by a 31-tap low-pass in `LivePcmFeed` for the live transcriber; the saved files are the chunked recording | Same |
| Transport label | Derived from the device's enumerator: `HDAUDIO` or `INTELAUDIO` gives `builtIn`, `USB` gives `usb`, Bluetooth hands-free gives `bluetoothHandsFree`, anything else (a virtual cable) gives `other`. In the UI the label only drives the Bluetooth hands-free warning (`MicTest.tsx`, `SourcePickers.tsx`, `AudioSection.tsx`). | not applicable |

Everything in the table above is **verified from the source files** at commit 553dd90 (`Track.cpp`, `Session.cpp`, `MicProbe.cpp`, `Common.h`, `LivePcmFeed.h`).

### 1.1 How November 7 was run

**Private-log findings** (local retained files under `gate3-two-track-20261107\`, outside Git, read by the agent for this draft; no audio or transcripts opened):
- The saved session log's first line is `open` with `wholeComputer: true` and an empty `followApp`, so the system track was endpoint loopback of the default render device.
- Microphone source: a phone recording played acoustically so that the **physical Realtek microphone array** picked it up. The system output on November 7 was `Speakers (2- Realtek(R) Audio)` per the endpoint record; how audible it was, and at what volume, is not recorded. **Owner correction 2026-11-09: no headphones existed on November 7 and none are in use. An earlier version of this draft said headphones were worn; that was unverified and is withdrawn.** Whether the physical microphone array heard the system speech on November 7 is unknown.
- System source: the public AMI file played by `System.Media.SoundPlayer` (PowerShell `PlaySync`) to the **default output device**.
- Active endpoints recorded in the archive audit: `Microphone Array (2- Realtek(R) Audio)` and `Speakers (2- Realtek(R) Audio)`.

**Unresolved November 7 settings** (not recorded in anything I could read; PENDING below): the output device's format and the speaker volume; the microphone's mix format, gain and enhancement state; the microphone endpoint ID (not in `session.log`); the Windows power plan; and the state of every other process on the PC.

### 1.2 Background workload on November 7 and the rule for the retest

What the retained evidence shows running: the pinned candidate app (Electron main, renderer and GPU processes, started with an inspector and remote-debugging port for the passive observer), its native capture helper, the live transcription worker (`base.en-q5_1`, 6 CPU threads, audio context 768, English, GPU off), the passive observer script, a PowerShell `SoundPlayer` for the system WAV, the phone playing the microphone speech, headphones, and after the recording the final pass (`turbo-q5_0`, 4 threads). Memory sampling covered only the app's process tree, so **whatever else ran on the PC is not recorded**.

Rule for the retest: run the **same set where feasible** (same app build, same worker settings, the observer and the player). The only things that may be suppressed are **extraneous audio** (notification sounds, other media). Workload must never be reduced to make the result look better, and any workload difference (for example the harness player replacing the phone) is recorded as a difference, not removed. The workload comparison with November 7 is a required part of the result.

## 2. Does one cable suffice? (finding)

**Yes, in principle, provided the default playback device is the Realtek speakers.**

- Microphone WAV is played into `CABLE Input`. `CABLE Output` is chosen as the app's microphone in the app's own microphone picker; it appears in the list because it is an active capture endpoint.
- System WAV is played to the default output and captured by endpoint loopback exactly as the candidate did on November 7. The system capture path is therefore unchanged **as long as `CABLE Input` is not the default playback device**. If it were, loopback would carry the microphone WAV as well and the two tracks would no longer be independent. Verified in code that the helper opens the default render endpoint (role `eConsole`) at start; how it reacts to a later default change was not examined.
- Because the helper plays silence into the default render endpoint, nothing in the cable setup interferes with that.
- The microphone track does not hear the system speech (virtual cable, no acoustic path). Whether the physical array heard the system speech on November 7 is unknown, and the cable removes that path. Expected effect: any speaker-to-microphone leakage present on November 7 is absent, so the microphone track is cleaner than November 7; this is a stated difference, not a measured one.

No stop condition was met: one cable is enough and the system capture path would not differ. The stop condition would trigger if the owner's default playback device is changed to a cable device.

## 3. Differences from November 7 and their expected effect

| # | Difference | Expected effect | Status |
| --- | --- | --- | --- |
| 1 | Microphone audio now arrives digitally through a virtual cable instead of acoustically through the Realtek array | Cleaner than November 7: no room noise, no array beamforming or noise suppression, no microphone ADC. Recognition of the microphone track may be easier. Equivalence of difficulty is therefore not claimed | Known |
| 2 | Microphone endpoint is a different device (`CABLE Output`) with its own driver, format and buffering | Possible small added buffering delay, not yet measured. Must be measured, not assumed | PENDING |
| 3 | Microphone transport label becomes `other` instead of `builtIn` | UI label only; no capture behavior change found in code | Verified by code |
| 4 | Microphone WAV is 24 kHz mono, played through a shared-mode path and converted by the Windows engine to the cable's format and then to the helper's 48 kHz | The size of any effect is unknown. It needs validation by the sync markers (position and frequency) and by audio checks on the captured chunks (level, clipping, silence); no claim is made before that | PENDING |
| 5 | System WAV is played by a harness player instead of `SoundPlayer` (same default device, same shared-mode path) | None expected; confirm the device is the same as the one captured | PENDING |
| 6 | Output device: Realtek speakers on both days, but the November 7 volume and format are not recorded | Loopback is the same engine-level tap; level may differ with the speaker volume | PENDING |
| 7 | Windows enhancements on the Realtek array no longer apply to the microphone track | Part of difference 1 | Known |
| 8 | CABLE Output's own enhancement state is unknown | Could alter the signal | PENDING |
| 9 | Both sources are started by one program on one clock; November 7 used a phone started by a person and a separate player | Offsets between tracks will be measured from sync beeps in the saved audio instead of assumed | Design |

### 3.1 Bidirectional workload caveat

A cleaner, digital microphone track may raise **or** lower load and detection compared with November 7: it may make the speech detector and recognizer faster or slower, produce more or fewer detected speech units, or change queue behavior. Neither direction is assumed. Consequently:
- a clean **meeting-track** result alone cannot prove the November 7 failure is fixed, because that failure involved the two tracks together;
- the result must include the **workload comparison** with November 7 (section 1.2) and the **constructed-speech caveat** (synthetic speech may change prosody, VAD segmentation and recognition behavior relative to natural speech);
- a clean constructed-speech result does not clear the November 7 natural-speech failure.

## 4. Fields to measure (all PENDING)

| Field | Where to read it | Admin needed |
| --- | --- | --- |
| Default playback device name | Settings, System, Sound, Output (the one with the selection mark) | No |
| Default recording device name | Settings, System, Sound, Input | No |
| Format of `CABLE Output` (rate, bits, channels) | Sound control panel (`mmsys.cpl`), Recording tab, `CABLE Output`, Properties, Advanced, "Default Format" | No |
| Format of `CABLE Input` | Same, Playback tab, `CABLE Input`, Properties, Advanced | No |
| Format of the default playback device | Same, Playback tab, the default device | No |
| Format of `Microphone Array (2- Realtek(R) Audio)` (reference to November 7) | Same, Recording tab | No |
| "Audio enhancements" state for the default playback device and `CABLE Output` | Settings, System, Sound, the device's page, "Audio enhancements"; or `mmsys.cpl` Properties, Enhancements tab | No |
| Exclusive-mode checkboxes (record only; the helper uses shared mode) | `mmsys.cpl`, Properties, Advanced | No |
| Microphone access for desktop apps | Settings, Privacy and security, Microphone, "Let desktop apps access your microphone" must be On (it also gates the cable's microphone endpoint) | No |

## 5. Windows settings the owner must apply, and what to capture afterward

Nothing was changed by the agent. **Finding (agent dry run of `play-sources.ps1`, 2026-11-08 PT, read-only):** on this PC the default eConsole playback device currently resolves to `CABLE Input`. The script refused, as designed. An earlier version of this section said to "keep" the default on the Realtek output, which assumed it was already there; it was not. The owner must change it before any run.

| # | What to set | Where | Admin | Then screenshot or copy |
| --- | --- | --- | --- | --- |
| 1 | **Default playback device = the Realtek output you will use** (`Speakers (2- Realtek(R) Audio)`). Not any `CABLE` device, not Bluetooth, USB or HDMI; the script refuses anything but Realtek. The owner's default on 2026-11-09 07:44 UTC was `Headphones (No Air 3)` (Bluetooth) and must be changed first. | Settings, System, Sound, Output (choose the device) | No | Screenshot of the Output list showing the selected device |
| 2 | Default **recording** device: leave as it is; write down which one it is. The app uses the microphone you pick in the app. | Settings, System, Sound, Input | No | Screenshot of the Input list |
| 3 | In **the app** (pinned candidate build 2d1f815 or the build the owner names), choose **`CABLE Output`** as the microphone, never `CABLE In 16ch` | The app's microphone picker (Settings, Audio, or the Live screen) | No | Screenshot of the app picker with `CABLE Output` selected |
| 4 | **Sample rate and bit depth**: read and record, do not change unless the owner decides so afterward: default format of `CABLE Input`, `CABLE Output`, the default Realtek output and the Realtek microphone array | Sound control panel (`mmsys.cpl`), Playback or Recording tab, device, Properties, Advanced, "Default Format" | No | Screenshot of each Advanced tab (4 screenshots) |
| 5 | **Audio enhancements**: record the on/off state for the default Realtek output and for `CABLE Output` | Settings, System, Sound, the device page, "Audio enhancements"; or `mmsys.cpl`, Properties, Enhancements | No | Screenshot of each device page |
| 6 | **Volume**: note the device volume of `CABLE Input`, `CABLE Output` and the Realtek output before the run; do not change them during it | Volume mixer or `mmsys.cpl`, Levels | No | Screenshot or the numbers |
| 7 | "Listen to this device" **off** on `CABLE Output` | `mmsys.cpl`, Recording, `CABLE Output`, Properties, Listen | No | Screenshot of the Listen tab |
| 8 | Desktop-app **microphone access on** | Settings, Privacy and security, Microphone, "Let desktop apps access your microphone" | No | Screenshot |
| 9 | Silence **notification sounds** and close other audio apps (extraneous audio only; do not close workload apps) | Settings, System, Sound, Volume mixer, "System sounds"; close media apps | No | Note what was closed |
| 10 | Set the **speaker volume low but audible** and write the setting down (the same volume must be used in the real retest) | Volume control | No | The volume setting you chose |

After steps 1 to 8, send the screenshots or the copied text so the PENDING fields in section 4 can be filled. `play-sources.ps1` (dry run, which plays nothing) then prints the resolved device names and endpoint IDs.

## 6. Gate on this checklist

This checklist stays DRAFT until the PENDING fields are filled, an independent reviewer has read it, and the owner approves. Any run longer than 20 minutes in total, including setup and final processing, needs the owner's explicit approval before it starts. The 420 s recording plus setup, final processing and cleanup is likely to exceed that, so approval will be requested separately.

## 7. Harness playback script

`scripts/gate3-retest/play-sources.ps1` (Windows PowerShell 5.1; written, **not run for playback**). Default mode is a dry run that plays nothing.

- **Microphone WAV** goes only to the wave-out device named `CABLE Input`; it refuses `CABLE In 16ch` and refuses unless exactly one device matches.
- **System WAV** goes to the wave-out device that corresponds to the **default eConsole render endpoint**, which is the endpoint the helper captures by loopback. The mapping is by endpoint ID (`DRV_QUERYFUNCTIONINSTANCEID`), not by name. It fails closed if no device maps to that endpoint or if a `CABLE` device is the default playback device. Playback is to the resolved device, not to `WAVE_MAPPER`.
- **Hashes** of both WAVs (raw file bytes) are required and checked before anything starts. The WAV header must be PCM, mono, 24000 Hz, 16-bit.
- **Recording readiness:** real playback needs `-RecordingReadyFile`, written by the step that confirms the native Start acknowledgement. The script waits for a file newer than its own start, then refuses to start if more than `-MaxStartDelaySeconds` (default 6 s) have passed, so the lead-in marker interval (0 to 10 s, the WAV's beeps end 2.2 s in) is not missed. It cannot see the app's recording state itself.
- **One clock:** `Stopwatch.GetTimestamp()` ticks and UTC are logged before and after each start, with the device identities, to a new folder outside Git. Both buffers are written paused, then released one after the other.
- **Guards:** `-Play`, `-OwnerApprovedLongTest` (over-20-minute approval), and the system device must be a Realtek output (anything else, including Bluetooth, USB, HDMI and CABLE devices, is refused). No retry, no change to defaults or volume.
- **Sample rate question resolved:** a `WAVE_FORMAT_QUERY` on 2026-11-08 PT (nothing played, no setting changed) reported that winmm wave-out **accepts 24 kHz mono PCM16** on `WAVE_MAPPER`, `CABLE Input`, `CABLE In 16ch` and the Realtek output. So no resampling or other change to the source files is needed. Acceptance of the format query does not show the converted audio is clean; that is checked by the markers and audio checks (difference 4).
- **Not verified by the script:** that `CABLE Output` is the app's selected microphone. It prints an OWNER-CONFIRM line.
- Tests: `scripts/gate3-retest/test_play_sources.py` (static text checks on any OS, and the hardware-free `-SelfTest` logic on Windows).
