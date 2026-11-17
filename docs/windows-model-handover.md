# Windows slice 3: offline speech-model handover

This is the **model-only** portion of [packaged Windows app, section 6](plans/packaged-windows-app.md).
It does not build or change native capture, `package-win.ps1`, the Windows runtime stager,
`verify-win-package.mjs`, or `Scribe.exe`. Integrating a `-StageModels` shortcut into the
packaging command is reserved for the Windows implementation workstream.

The handover holds exactly five speech-model files (~806 MB), `model-digests.json`, and a
standalone PowerShell installer. The existing summary model is **not** part of this handover.
The model manifest is copied byte-for-byte from `scripts/model-digests.json`, and the
installer stamps its SHA-256 into the script. The installer verifies both that manifest
and all five files (size and SHA-256) before touching the installation folder. Files stay
outside `Scribe.exe` and outside `%APPDATA%`.

## Build PC: stage and transfer

Run from the repository root on Windows 11 with Node 22, `tar.exe` and verified dev assets.
Use PowerShell **without administrator privileges**:

```powershell
# If missing, acquire the pinned assets first with scripts/dev-assets.sh asr and
# scripts/dev-assets.sh diarization in Git Bash. No model files belong in git.
$assets = Join-Path $env:USERPROFILE 'scrb-dev-assets'
$handover = Join-Path $env:USERPROFILE 'Desktop\scribe-model-handover'
node scripts/stage-win-models.mjs --assets $assets --output $handover
```

The output path must **not already exist**. The stager checks the pinned segmentation
`tar.bz2` SHA-256 (`24615ee8...e4996488`), extracts into a disposable directory, checks
the extracted `model.int8.onnx` against its pinned size/hash, checks the other four model
files, and checks all five again after copying. A failed stage leaves no handover folder.
Transfer the **whole** `scribe-model-handover` directory to the clean PC via USB or trusted
file copy. The destination PC needs neither this repository nor Node nor network access.

## Clean PC: verify and install

In a normal, non-administrator PowerShell window inside the copied handover folder:

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\install-models.ps1 -VerifyOnly
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File .\install-models.ps1
```

Expected installation folder: `%LOCALAPPDATA%\Scribe\models` (for that Windows account).
The script uses a sibling temporary directory, verifies the copies, then renames that
folder into place; it does not install one partially validated model at a time. If a
complete valid installation already exists, it reports `Already installed and verified`
and makes **no changes**, including to any unrelated files. An incomplete/invalid existing
installation is **not overwritten**: move it aside deliberately after making a backup,
then rerun the installer. No valid installation is deleted by the scripts. The optional
`-Destination <new-folder>` argument is intended for isolated acceptance tests only.

A clean PC does not need a `tar` command: the build PC has already extracted the verified
segmentation model. Avoid launching Scribe while installing; restart Scribe after install
so that it rechecks its models.

## Native Windows acceptance (not verified until performed)

1. On the build PC, verify `winver` reports Windows 11 and generate the handover as above.
   Record the commit SHA and confirm `models\` contains **exactly five** files; there
   should be no `.part` files or archived segmentation model in the handover.
2. Copy it to the clean PC (Windows 11); run `-VerifyOnly`, then install without administrator
   privileges; confirm `Test-Path "$env:LOCALAPPDATA\Scribe\models\segmentation-model.int8.onnx"`.
   A second install must succeed without rewriting files.
3. **Negative test preserving existing models:** Back up just the ~1.5 MB handover
   `models\segmentation-model.int8.onnx` file. Flip one byte in the handover **copy**
   (never in the installed model); rerun `-VerifyOnly` and the installer. Both must fail.
   Confirm the installed model SHA-256 remains
   `d582f4b4c6b48205de7e0643c57df0df5615a3c176189be3fc461e9d18827b5d`.
   Restore the backed-up handover file; `-VerifyOnly` must pass again.
4. Delete the segmentation file from a **second disposable copy** of the handover, then
   run its `-VerifyOnly`; it must refuse the incomplete folder. Never delete the installed
   model. Alter `model-digests.json` only in that disposable copy; it too must fail.
5. Run `npm test -- scripts/stage-win-models.test.mjs` on the build PC if the repo is
   available. This also runs PowerShell installer fixtures using tiny invented model
   files; GitHub Actions runs the same tests through the existing `npm test` command.

Report Windows version, source/target PC, exact SHA, test pass/fail for each step, any
error text, and confirmation that existing installed hashes were unchanged. These steps
test the handover only; they do **not** prove physical microphone/system-audio capture,
packaged app launch, transcription or successful `scrb-capture.exe` packaging.
