# Windows M1 first run (dev build, Windows PC)

**Status:** procedure, 2026-11-13. Written on a Mac from reading the repo; **nothing here was run on a Windows PC, and `scripts/m1.ps1` and `scripts/m1.test.ps1` were not executed (no PowerShell on the author's machine).** Anything marked (unverified) was not checked. Independent review pending. No recordings were read; the test uses invented speech.

**M1 on Windows** = the dev build (`npm start`) with real recording, live text and final pass, as `scripts/m1.sh` does on the Mac (`docs/plans/m1-readiness.md`). Not the packaged app (`docs/plans/packaged-windows-app.md` needs Windows 11 and tools that are not staged yet).

## 0. Blockers, smallest fix first

Everything the Mac gets from `scripts/dev-assets.sh build` or a Swift build has no scripted Windows equivalent today. None needs a code or contract change; each is a one-time build on the PC (section 3 has the commands).

| # | Missing on Windows | Why | Smallest fix |
| --- | --- | --- | --- |
| B1 | `whisper-cli.exe`, `whisper-server.exe`, `whisper-vad-speech-segments.exe` | The `build` group of `dev-assets.sh` runs on macOS only. `third_party/MANIFEST.md` lists only a **CUDA** zip (whisper.cpp b5454, needs an NVIDIA GPU; older than the pinned `284029c`; whether it contains `whisper-vad-speech-segments` is unverified) | Build the pinned `upstream/whisper.cpp` with CMake on the PC, CPU only, static (section 3, step 4). Needs the MSVC Build Tools (`C:\BuildTools`), see B5 |
| B2 | `scrb-sherpa.exe` | `build-sherpa-sidecar.sh` is `clang++` only. The sherpa-onnx v2.0.1 Windows release (C API, DLLs) is fetched by `dev-assets.sh diarization` under Git Bash, but nobody has compiled `native/scrb-sherpa.cpp` with MSVC (unverified it compiles) | One `cl` command against the release's `include` and `lib` (step 5); copy the release DLLs next to the exe. If MSVC rejects the source, a handoff note is needed: this is the likeliest real blocker |
| B3 | `ffmpeg.exe`, `ffprobe.exe` | Only CI builds them (MSYS2 UCRT64, `build-ffmpeg.sh`); the output is not published | Run the same script in an MSYS2 UCRT64 shell on the PC (step 6). Needs MSYS2 and about 30 minutes of compile, which is a build, not a test. If the PC cannot do this, any existing `ffmpeg.exe`/`ffprobe.exe` placed in `packages\transcription\.bin` works for a dev run (the app only decodes and probes audio; licence terms matter only for shipping, not for this run) |
| B4 | `live.json` and `final-pass.json` | No script writes them even on the Mac; they are hand-written JSON | Step 7 writes both from a snippet that uses the paths from steps 4-6 |
| B5 | MSVC Build Tools, CMake, Ninja, Git, Git Bash, Node, MSYS2 on the PC | `native/windows-capture/build.cmd` hard-codes `C:\BuildTools`; the manifest says the toolchain was on "the Windows machine" without naming which PC. **Installing the Build Tools needs administrator once** | Step 0 checks. If `C:\BuildTools` is missing, the owner installs "Visual Studio Build Tools 2022, C++ workload" (admin, one time) or uses the other PC |
| B6 | `scrb-capture.exe` is not built or verified on this checkout's `main` | Built only by hand from `native/windows-capture` (`fetch-opus.ps1`, `build.cmd`). CI does not build it | Step 3 |

Not blockers but expect them:

- **Windows version.** Regiurn is Windows 11 Home (build 26300, owner report); BCHEN-W10 is Windows 10. Record `winver` rather than assuming. Dev M1 does not require Windows 11. Per-app (process-tree) loopback needs a recent Windows 10 build (the exact minimum is unverified); `winver` is step 0. The first test uses **Whole computer audio**, which does not need it.
- **Live speed on a CPU-only PC.** Live text uses `small.en` with `audioContext` 768 (`packages/transcription/src/config.ts` comment). Gate 3 Windows is still open, so late or missing live text is a finding, not a setup error.
- **Final pass is slow without a GPU.** large-v3-turbo on CPU may take several times the clip length. The test clip is 2 minutes; the whole test, final pass included, must stay within 20 minutes (section 2), so stop and ask if it is not done by then. Do not quit the app meanwhile.
- **Start-up gap warning.** Windows keeps the original 100 ms late-start limit (`lateStartNsFor('win32')`); the Mac got 2 s. A warning about a gap at the very start is a known finding to report, not a failure.
- **BCHEN-W10's random screen/speaker shutoff (about 2 minutes).** It would cut the played speech mid-test. Prefer **Regiurn for the recording test** if it can have the build outputs; on BCHEN-W10 a shutoff during the test means "note it, rerun on the other PC", not a fail.

## 1. Where everything comes from

| Needed | Mac (m1.sh) | Windows |
| --- | --- | --- |
| Capture helper | `native\macos-capture\build\scrb-capture` (Swift, `build.sh`) | `native\windows-capture\build\bin\scrb-capture.exe` (`fetch-opus.ps1`, then `build.cmd`). `m1.ps1` also looks in the main checkout when run from a worktree |
| whisper tools | `~/scrb-dev-assets/upstream/whisper.cpp/build/bin/` | same relative path under `%USERPROFILE%\scrb-dev-assets` (built in step 4; exe names carry `.exe`) |
| scrb-sherpa | `packages/transcription/.bin/scrb-sherpa` | `packages\transcription\.bin\scrb-sherpa.exe` plus the sherpa DLLs beside it |
| ffmpeg, ffprobe | `packages/transcription/.bin/` | `packages\transcription\.bin\ffmpeg.exe`, `ffprobe.exe` |
| Models | `~/scrb-dev-assets/models/whisper` and `models/sherpa-onnx` | the same, from `dev-assets.sh asr` and `diarization` run in Git Bash (hash-checked, ~2 GB; the Windows sherpa release is fetched in the `diarization` group) |
| Configs | `~/scrb-dev-assets/config/live.json`, `final-pass.json` | `%USERPROFILE%\scrb-dev-assets\config\live.json` and `final-pass.json` (step 7) |
| Node | `~/.local/share/scrb-node/current/bin` | Node 22.23.4 (`.nvmrc`) on `PATH`; it works on Regiurn, where `npm install` and `npm run check` pass (real-decoder tests skip until ffmpeg exists) and `scripts\package-win.ps1` runs directly in PowerShell |
| Library | `~/Documents/Meeting Scribe` | `%USERPROFILE%\Documents\Meeting Scribe` (OneDrive may redirect Documents; check in Settings) |

Existing Windows setup docs: only the Gate 3 runbook (`docs/gates/gate-3-windows-scored-run-runbook-20261110.md`, uses `C:\Users\bchen\Documents\GitHub\scrb-run-pin` and a ChatGPT folder for Python/evidence) and `native/windows-capture/README.md` (helper build). **No document describes the whisper, sherpa or ffmpeg Windows builds**; that is B1-B3.

## 2. Rules for every command below

- Windows blocks `.ps1` files by default ("running scripts is disabled", seen on Regiurn). Run every `.ps1` as `powershell -NoProfile -ExecutionPolicy Bypass -File <script>`; this changes no setting and needs no admin.
- PowerShell, **not as administrator**, except the one-time Build Tools install in B5. Every block names its folder. Use one PowerShell window and leave it open.
- Files are never deleted. Keep the test recording; do not delete it (gate-evidence policy). Do not use a real confidential meeting.
- **Time limit:** the whole test, from starting the app in step 8 through the final pass and your checks in step 10, including setup of the test and cleanup, must stay within 20 minutes. That is a 2-minute recording plus a final pass that may take up to about 15 minutes. If the final pass is still running at 20 minutes, stop and ask before waiting longer; do not quit the app or start another test. One-time builds (steps 2-7) are setup, not the test.

## 3. Procedure

Pick the PC. **PC for steps 0-9: the one that has `C:\BuildTools` (check in step 0), preferably Regiurn.** Name it in your report.

**Step 0. Check the PC.** Folder: any. Admin: no.

```powershell
winver
```

```powershell
hostname
```

```powershell
Test-Path C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat
```

```powershell
node -v
```

```powershell
git --version
```

```powershell
Test-Path "$env:USERPROFILE\scrb-dev-assets"
```

```powershell
Test-Path 'C:\msys64'
```

Record the Windows version and the answers. Pass: Windows 10 or 11 shown, Git present, and `node -v` prints **v22.23.4**, the version in `.nvmrc`. A newer default is not a pass: Regiurn had v26.13.0, and every later step must run with 22.23.4 first on `PATH`. Without admin, install 22.23.4 (the zip from nodejs.org, unpacked to a folder you own such as `%USERPROFILE%\node-v22.23.4-win-x64`) and put it first in each PowerShell window (then `node -v` again):

```powershell
$env:PATH = "$env:USERPROFILE\node-v22.23.4-win-x64;$env:PATH"
```

Then: Build steps need `vcvars64.bat` = True (else B5). `scrb-dev-assets` = True means a seed exists: step 2 skips what it has. MSYS2 is only needed for step 6.

**Step 1. Get the code and install.** Folder: where you keep repos, e.g. `C:\Users\<you>\Documents\GitHub`. Admin: no. Use the branch of this PR (or `main` once merged).

```powershell
git clone https://github.com/raisinbran/scrb.git scrb
```

```powershell
cd scrb
```

```powershell
npm install
```

Pass: `node_modules\electron\dist\electron.exe` exists (`npm install` fetches the Electron binary). If the checkout already exists: `git pull --ff-only`, then `npm install`.

**Step 2. Models and sherpa release.** Folder: the `scrb` folder. Admin: no. Needs Git Bash (installed with Git for Windows).

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/dev-assets.sh asr
```

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/dev-assets.sh diarization
```

```powershell
& 'C:\Program Files\Git\bin\bash.exe' scripts/dev-assets.sh upstream
```

Pass: each ends with `done (<group>) in ...\scrb-dev-assets` and no `SHA-256 mismatch`. This fetches the whisper models, the pyannote and eres2net models, the Windows sherpa-onnx v2.0.1 release under `tools\sherpa-onnx`, and the pinned `upstream\whisper.cpp`. Fail: any hash mismatch (stop, report).

**Step 3. Capture helper.** Folder: `native\windows-capture`. Admin: no.

```powershell
cd native\windows-capture
```

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\fetch-opus.ps1
```

```powershell
cmd /c build.cmd
```

Pass: `build\bin\scrb-capture.exe` exists. Then run its unit tests:

```powershell
cmd /c "git show phase0-archive:phase0/artifacts/capture/devices/sleep-wake-timing.csv > sleep-wake-timing.csv"
```

```powershell
.\build\bin\PipelineTests.exe sleep-wake-timing.csv
```

Pass: ends without a failure line (the README does not quote the exact success text; report the last line). If `phase0-archive` is missing, skip this command and say so; the helper build is the pass condition.

**Step 4. whisper.cpp, CPU, static (B1).** Folder: `%USERPROFILE%\scrb-dev-assets\upstream\whisper.cpp`. Admin: no. Uses the CMake and Ninja that ship with the Build Tools.

```powershell
cd "$env:USERPROFILE\scrb-dev-assets\upstream\whisper.cpp"
```

```powershell
$cm = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
```

```powershell
$nj = 'C:\BuildTools\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
```

```powershell
cmd /c "call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && `"$cm`" -S . -B build -G Ninja -DCMAKE_MAKE_PROGRAM=`"$nj`" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF && `"$cm`" --build build"
```

The build ran 78 targets without error on Regiurn. Pass: `build\bin\whisper-cli.exe`, `whisper-server.exe` and `whisper-vad-speech-segments.exe` exist. Fail: a missing tool name means the pinned commit lacks it on Windows (report; this contradicts the Mac build, so it would be a build-option issue). The CMake paths are those the helper's `fetch-opus.ps1` uses.

**Step 5. scrb-sherpa (B2).** Folder: the `scrb` folder. Admin: no.

```powershell
$s = (Get-ChildItem "$env:USERPROFILE\scrb-dev-assets\tools\sherpa-onnx" -Directory | Select-Object -First 1).FullName
```

```powershell
Get-ChildItem $s -Recurse -Include sherpa-onnx-c-api.lib, sherpa-onnx-c-api.dll, onnxruntime.dll | Select-Object FullName
```

Pass: the `.lib` and both `.dll` files are listed (note their folders). Then compile (adjust `$s\lib` if the `.lib` is elsewhere):

```powershell
New-Item -ItemType Directory -Force packages\transcription\.bin | Out-Null
```

```powershell
cmd /c "call C:\BuildTools\VC\Auxiliary\Build\vcvars64.bat >nul && cl /nologo /EHsc /O2 /MD /std:c++17 /I`"$s\include`" packages\transcription\native\scrb-sherpa.cpp `"$s\lib\sherpa-onnx-c-api.lib`" /Fe:packages\transcription\.bin\scrb-sherpa.exe"
```

```powershell
Copy-Item "$s\lib\*.dll", "$s\bin\*.dll" packages\transcription\.bin -ErrorAction SilentlyContinue
```

```powershell
.\packages\transcription\.bin\scrb-sherpa.exe
```

Pass: the compile finishes and the last command starts and prints a usage or protocol line instead of "DLL not found" (its exact output is unverified). Fail: a compile error (report the first error; likely needs a source change = new blocker) or a missing-DLL dialog (copy the named DLL beside the exe).

**Step 6. ffmpeg and ffprobe (B3).** **Look first:** a working `ffmpeg.exe` and `ffprobe.exe` pair may already be on the PC (Regiurn had one); if so, copy both into `packages\transcription\.bin` and skip the compile. Folder: the `scrb` folder, in an MSYS2 UCRT64 shell (Start menu, "MSYS2 UCRT64"), not PowerShell. Admin: no. Skip if you already have both executables; copy them to `packages\transcription\.bin\` instead.

```bash
pacman -S --noconfirm --needed mingw-w64-ucrt-x86_64-gcc make diffutils nasm xz curl
```

```bash
cd /c/Users/<you>/Documents/GitHub/scrb && bash packages/transcription/scripts/build-ffmpeg.sh
```

Pass: `packages\transcription\.bin\ffmpeg.exe` and `ffprobe.exe` exist and `.\packages\transcription\.bin\ffmpeg.exe -version` runs from PowerShell without a missing-DLL dialog. (This is the CI recipe; expect about 30 minutes of compile. If a MinGW DLL is reported missing, copy it from `C:\msys64\ucrt64\bin` beside the exe.)

**Step 7. Write the two config files (B4).** Folder: the `scrb` folder. Admin: no. Edit nothing; the snippet derives every path.

```powershell
$a = "$env:USERPROFILE\scrb-dev-assets"; $b = (Resolve-Path packages\transcription\.bin).Path; $w = "$a\upstream\whisper.cpp\build\bin"; $m = "$a\models"
```

```powershell
New-Item -ItemType Directory -Force "$a\config" | Out-Null
```

```powershell
$live = @{ tools = @{ whisperServer = "$w\whisper-server.exe"; whisperVad = "$w\whisper-vad-speech-segments.exe" }
  models = @{ speechLive = "$m\whisper\ggml-small.en-q5_1.bin"; vad = "$m\whisper\ggml-silero-v6.2.0.bin" }
  whisper = @{ audioContext = 768; useGpu = $false } }
```

```powershell
$final = @{ tools = @{ ffmpeg = "$b\ffmpeg.exe"; ffprobe = "$b\ffprobe.exe"; whisperCli = "$w\whisper-cli.exe"; sherpaSidecar = "$b\scrb-sherpa.exe" }
  models = @{ speechFinal = "$m\whisper\ggml-large-v3-turbo-q5_0.bin"; speechLive = "$m\whisper\ggml-small.en-q5_1.bin"; vad = "$m\whisper\ggml-silero-v6.2.0.bin"
    segmentation = "$m\sherpa-onnx\sherpa-onnx-pyannote-segmentation-3-0\model.int8.onnx"; embedding = "$m\sherpa-onnx\3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx" } }
```

```powershell
[IO.File]::WriteAllText("$a\config\live.json", ($live | ConvertTo-Json -Depth 5))
```

```powershell
[IO.File]::WriteAllText("$a\config\final-pass.json", ($final | ConvertTo-Json -Depth 5))
```

Pass: step 8 reports nothing missing. (Live uses `small.en`, the CPU setting; the Mac config uses large-v3-turbo for live, which a CPU-only PC cannot keep up with.)

**Step 8. Start the app in real mode.** Folder: the `scrb` folder. Admin: no. This fails loudly, before launching, listing every missing file.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\m1.ps1
```

Pass: the Scribe window opens (first start builds, a minute or more) and the Live screen lists your real microphone. Fail: the script prints `Cannot start real mode. Missing:` with a list; fix each line (that is the check working). If it says Scribe is already running, close that window first. Do not trust the Recordings list: it always includes mock sample meetings.

**Step 9. Record a 2-minute test (whole test within 20 minutes, see section 2).** Use headphones so the microphone does not hear the played speech. In the app: Live screen, microphone = your headset or default mic, source = **Whole computer audio**, press Start. If Windows asks about the microphone, allow it (Settings, Privacy & security, Microphone, "Let desktop apps access your microphone" must be on). Then, in a **second** PowerShell window, play invented speech with two voices (about 90 seconds); say a few sentences into the mic yourself at the same time or between lines.

```powershell
Add-Type -AssemblyName System.Speech
$v = New-Object System.Speech.Synthesis.SpeechSynthesizer
$lines = @(
  @('Microsoft David Desktop', 'Good morning. This is a test meeting for the Windows build of Scribe. The project is called Bluebird.'),
  @('Microsoft Zira Desktop', 'Thanks. Quarterly numbers are on track. Maria will send the budget by Friday, and Kenji owns the migration plan.'),
  @('Microsoft David Desktop', 'Agreed. The decision is to ship the beta on the fourteenth. Any risks?'),
  @('Microsoft Zira Desktop', 'One risk: the vendor contract renewal. I will follow up with legal on Tuesday.'),
  @('Microsoft David Desktop', 'Good. Action items are the budget, the migration plan and the legal follow up. Meeting adjourned.')
)
foreach ($l in $lines) { $v.SelectVoice($l[0]); $v.Speak($l[1]); Start-Sleep -Seconds 4 }
```

If a voice name is rejected, run `$v.GetInstalledVoices() | % { $_.VoiceInfo.Name }` and use two names from that list. In the app: while the speech plays, check live text appears; press Pause, wait 10 seconds, Resume, speak 20 more seconds, press Stop.

**Step 10. Check each result.**

| Check | Pass | Fail means |
| --- | --- | --- |
| Live text during recording | Words from the played speech and from you appear, within a few seconds | Report delay and what is missing (Gate 3 Windows live speed is open; a finding, not a setup error) |
| Recording state | Pause and Resume work; Stop returns to the list; no "helper stopped" message | Report the exact message |
| Final transcript | Meeting goes processing, then ready within 20 minutes; text close to the script above (names Bluebird, Maria, Kenji may be wrong) | Report the on-screen message; check `%APPDATA%\@scrb\desktop` logs |
| Speakers | At least two speakers separated (David vs Zira); rename one | One speaker only: report (short clip and TTS voices can merge) |
| Playback | Play, click a word, seek; highlight follows | Report |
| Correction | Fix one word, then Undo | Report |
| Export | Choose Export on the meeting; a DOCX or PDF is written | Report the message |
| Restart | Close the app, run step 8 again: the meeting and your correction are still there | Report |
| Gap notice | A notice about a gap at the start is a known Windows finding, not a fail | n/a |

**Step 11. Report.** Send back: PC name and `winver` result, which steps passed, each failure with the exact on-screen or PowerShell text, and the last lines of the PowerShell window if the app crashed. Keep the test recording and the logs.

## 4. Known gaps (Mac-only or unverified today)

- `scripts/m1.sh`, `native/macos-capture/build.sh` and the Mac permission prompts have no counterpart except `m1.ps1` and the Windows microphone switch (step 9). Windows system audio needs no permission.
- `dev-assets.sh` skips CMake/Ninja, whisper, llama and sherpa builds on Windows; steps 4-5 replace them by hand.
- `scripts\m1.test.ps1` is not run by CI (neither is `m1.test.sh`); run it on the PC with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\m1.test.ps1` (expects `ok`).
- Per-app meeting capture on Windows: Teams fixed, Zoom and browser targets unrun, Communications-type streams silent in per-app mode (BUG-1, `docs/bug-tracker.md`). Use Whole computer audio until those are checked.
- The mock "Mock backend" title-bar marker and `m1.ps1` do not detect a bad live config beyond the file check; the live feed silently stays off if `readLiveSetup` rejects it (the log has `live-config-unavailable`).
- Packaged Windows app: slice 1 only (unpacked shell, no tools staged); install on Windows 11 is a separate plan.
- Long meetings: the helper's 4 h run passed in Phase 0, but the app on a 1-hour Windows meeting is unmeasured.
