# Gate 3 Windows: D2 capture-equivalence checklist (DRAFT)

Status: **DRAFT, NOT_FROZEN.** Nothing here was measured on a device. Every field marked PENDING is still to be read or measured by the owner or by a later, separately authorized harness step. No recording, test, rendering, installation or Windows audio setting change was done to write this document.

Owner decision: Option 1, a virtual audio cable (VB-Audio VBCABLE_Driver_Pack46) for the microphone track. The cable's Windows endpoints are present on this PC (read-only listing shows `CABLE Input`, `CABLE Output` and `CABLE In 16ch`, all status OK). **Do not use `CABLE In 16ch`.**

## 1. How the candidate captures (code at 553dd90, `native/windows-capture/src/`)

| Item | Microphone track | System-audio track ("whole computer") |
| --- | --- | --- |
| Selection | Capture endpoint by ID from the app's mic setting, or the default for role `eConsole` when the setting is "default". The list offered to the app is every *active* capture endpoint (`Track.cpp` `ListMicsJson`). | The default render endpoint for role `eConsole` (or an ID if given). Used when `source` is empty ("whole computer") or a followed app is set. |
| API | WASAPI shared-mode capture client | WASAPI shared-mode capture client on the render endpoint with `AUDCLNT_STREAMFLAGS_LOOPBACK` (endpoint loopback). Per-application process loopback exists but is used only when a process is picked. |
| Requested format | PCM 16-bit, 1 channel, 48000 Hz (`Common.h` `kRate`, `Track.cpp` `MakeFormat`) | Same |
| Conversion | `AUTOCONVERTPCM` + `SRC_DEFAULT_QUALITY`: Windows converts from the endpoint's own mix format. The endpoint's rate, bit depth and channel count are never read by the helper. | Same |
| Buffer | 2 s | 2 s |
| Windows enhancements | Not disabled by the helper. A grep of the five source files found no `SetClientProperties`, `IAudioClient2/3`, raw mode or exclusive mode, so the stream is an ordinary shared-mode stream and whatever enhancements Windows or the driver applies to the endpoint stay on. | Same, for the render endpoint's loopback tap |
| Extra behavior | Registers an audio-session watcher | Opens a **render client on the same endpoint and plays silence into it** so loopback keeps delivering (`Track.cpp` around the `Kind::System` branch) |
| Live feed | Native 48 kHz is also converted to 16 kHz by a 31-tap low-pass in `LivePcmFeed` for the live transcriber; the saved files are the chunked recording | Same |
| Transport label | Derived from the device's enumerator: `HDAUDIO` or `INTELAUDIO` gives `builtIn`, `USB` gives `usb`, Bluetooth hands-free gives `bluetoothHandsFree`, anything else (a virtual cable) gives `other`. In the UI the label only drives the Bluetooth hands-free warning (`MicTest.tsx`, `SourcePickers.tsx`, `AudioSection.tsx`). | not applicable |

### 1.1 How November 7 was run (local harness files, not in Git)

Verified from the retained files under `gate3-two-track-20261107\`:
- The saved session log's first line is `open` with `wholeComputer: true` and an empty `followApp`, so the system track was endpoint loopback of the default render device.
- Microphone source: a phone recording played acoustically so that the **physical Realtek microphone array** picked it up. Headphones were worn so that the microphone did not hear the system speech.
- System source: the public AMI file played by `System.Media.SoundPlayer` (PowerShell `PlaySync`) to the **default output device**.
- Active endpoints recorded in the archive audit: `Microphone Array (2- Realtek(R) Audio)` and `Speakers (2- Realtek(R) Audio)`.

Assumed or not recorded (marked PENDING below): which output device was the default (headphones or speakers) and its format; the microphone's mix format, gain and enhancement state; the microphone endpoint ID (it was not logged in `session.log`).

## 2. Does one cable suffice? (finding)

**Yes, in principle, provided the default playback device stays the Realtek speakers/headphones.**

- Microphone WAV is played into `CABLE Input`. `CABLE Output` is chosen as the app's microphone in the app's own microphone picker; it appears in the list because it is an active capture endpoint.
- System WAV is played to the default output and captured by endpoint loopback exactly as the candidate did on November 7. The system capture path is therefore unchanged **as long as `CABLE Input` is not the default playback device**. If it were, loopback would carry the microphone WAV as well and the two tracks would no longer be independent. Verified in code that the helper opens the default render endpoint (role `eConsole`) at start; how it reacts to a later default change was not examined.
- Because the helper plays silence into the default render endpoint, nothing in the cable setup interferes with that.
- The microphone track does not hear the system speech (virtual cable, no acoustic path), so the headphones no longer protect the microphone from the system WAV, and the cable removes the need for a quiet room for the microphone WAV.

No stop condition was met: one cable is enough and the system capture path would not differ. The stop condition would trigger if the owner's default playback device is changed to a cable device.

## 3. Differences from November 7 and their expected effect

| # | Difference | Expected effect | Status |
| --- | --- | --- | --- |
| 1 | Microphone audio now arrives digitally through a virtual cable instead of acoustically through the Realtek array | Cleaner than November 7: no room noise, no array beamforming or noise suppression, no microphone ADC. Recognition of the microphone track may be easier. Equivalence of difficulty is therefore not claimed | Known |
| 2 | Microphone endpoint is a different device (`CABLE Output`) with its own driver, format and buffering | Possible small added buffering delay, not yet measured. Must be measured, not assumed | PENDING |
| 3 | Microphone transport label becomes `other` instead of `builtIn` | UI label only; no capture behavior change found in code | Verified by code |
| 4 | Microphone WAV is 24 kHz mono, played through a shared-mode path and converted to the cable's format and then to 48 kHz by the engine | Sample-rate conversion adds negligible error; to be confirmed by the captured sync beeps | PENDING |
| 5 | System WAV is played by a harness player instead of `SoundPlayer` (same default device, same shared-mode path) | None expected; confirm the device is the same as the one captured | PENDING |
| 6 | Output device (headphones or speakers) may differ from November 7 | If different, loopback is still the same engine-level tap; format may differ | PENDING |
| 7 | Windows enhancements on the Realtek array no longer apply to the microphone track | Part of difference 1 | Known |
| 8 | CABLE Output's own enhancement state is unknown | Could alter the signal | PENDING |
| 9 | Both sources are started by one program on one clock; November 7 used a phone started by a person and a separate player | Offsets between tracks will be measured from sync beeps in the saved audio instead of assumed | Design |

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

## 5. Windows settings the owner must set (none were changed by this document)

| # | Setting | Where | Admin |
| --- | --- | --- | --- |
| 1 | Keep the **default playback device** on the Realtek output you will use on test day (headphones). It must **not** be any `CABLE` device. | Settings, System, Sound, Output | No |
| 2 | In the app, choose `CABLE Output` as the microphone | The app's microphone picker (Settings, Audio, or the Live screen) | No |
| 3 | Do not enable "Listen to this device" on `CABLE Output` | `mmsys.cpl`, Recording, Properties, Listen | No |
| 4 | Leave the volume of `CABLE Input` and `CABLE Output` at the level you note beforehand; the harness will not change it | Volume mixer or `mmsys.cpl` | No |
| 5 | Mute or disable Windows notification sounds during the run (they go to the default device and are loopback-captured) | Settings, System, Sound, Volume mixer, "System sounds" | No |
| 6 | Wear headphones as on November 7 so no system speech is audible in the room | Physical | No |
| 7 | Close apps that make sound; leave only the app and the harness | Physical | No |

## 6. Gate on this checklist

This checklist stays DRAFT until the PENDING fields are filled, an independent reviewer has read it, and the owner approves. Any run longer than 20 minutes in total, including setup and final processing, needs the owner's explicit approval before it starts. The 420 s recording plus setup, final processing and cleanup is likely to exceed that, so approval will be requested separately.

## 7. Proposed harness playback design (not written, not run)

One PowerShell 5.1 script, for example `scripts/gate3-retest/play-sources.ps1`, compiled with `Add-Type` as the existing render scripts do, and using only the Windows `winmm.dll` wave-out API through P/Invoke. No installs.

1. **Inputs:** the two joined WAVs (24 kHz mono PCM16), the expected SHA-256 of each from the manifest, and the owner confirmation flags below. It refuses to start if a hash differs.
2. **Devices:**
   - Microphone WAV goes to the wave-out device whose name starts with `CABLE Input` and does not contain `16ch`. It refuses unless exactly one device matches. Device names from wave-out are truncated to 31 characters, so it matches by prefix.
   - System WAV goes to `WAVE_MAPPER`, which follows the default playback device, the same destination `SoundPlayer` used on November 7. It refuses if the default playback device name is a `CABLE` device. It also refuses if the default is the built-in speakers unless a `-HeadphonesWorn` flag is supplied, to keep speaker sound out of the room.
3. **One clock:** `System.Diagnostics.Stopwatch.GetTimestamp()` (the QPC) is the single monotonic clock for the process.
4. **Start sequence:** open both devices, prepare both buffers, call `waveOutPause`, write both buffers, then call `waveOutRestart` for the two devices in immediate succession. Read the QPC immediately before and after each restart call and log both values.
5. **Log:** one JSON line per event to a new folder outside Git, holding the QPC and the UTC wall time at the same instant, device name, file hash, buffer length, the `waveOutGetPosition` readings at the end, and the exit status. Nothing from audio content.
6. **Offset truth:** the call times are not treated as sound start times. Device and driver latency is not known. The captured audio already contains three sync beeps (880 Hz microphone, 1320 Hz meeting) at 1.0, 1.5 and 2.0 s and again at 381.0, 381.5 and 382.0 s, so the actual per-track offset and drift are measured from the saved chunks.
7. **Safety:** no retry, no change to any audio setting or default device, no volume change, no recording control. It exits cleanly on completion and stops playback on Ctrl+C.
8. **Open points before it can be built:** whether wave-out accepts 24 kHz mono directly on both devices (fallback would be a resampled copy, which is a different source file that needs owner approval and a new hash); latency of each device (to be read from the beeps); and whether a person or the harness presses Record in the app.
