# Launches the ALREADY BUILT candidate app (Windows PowerShell 5.1, not Administrator). It never builds, never calls npm.
# Default is a check-only dry run: verifies commit, clean tree and SHA-256 of every built artifact, launches nothing.
# -Launch starts the app with a fresh profile and library. The owner presses Record; this script does not.
param(
    [string]$Candidate = 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\candidate-553dd90',
    [string]$RunFolder = 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-v3-preflight-20261108\practice-d2\app-run',
    [string]$ConfigFolder = 'C:\Users\bchen\Documents\ChatGPT\srcb\gate3-reference-e85-20261103',
    [switch]$Launch
)
$ErrorActionPreference = 'Stop'
$commit = '553dd9080f452f8a54ccff5cd5fea8d6937438ae'
$expected = [ordered]@{
    'apps\desktop\dist-electron\main.cjs'              = 'b9ae7eaea0eaab9fba17b347ea5f7802a94c95cffcc8dcfe06b65378692214e3'
    'apps\desktop\dist-electron\preload.cjs'           = 'b6d1f56197c977f79b9ac9fbcc09996285ed66f7c4808073d316dc295b600df8'
    'apps\desktop\dist-electron\liveWorkerEntry.mjs'   = '87b56e33de7160d710edb355317bdc07ecc32cb2dd68de7990d59d95727d778c'
    'apps\desktop\dist\index.html'                     = '2b74977df596389966dbb97f90bdeb8f728ab24bf84027607f7c9eac8bc9c3d8'
    'native\windows-capture\build\bin\scrb-capture.exe' = '4c49811a3d2a3a3cb08b457113daa0fe2c72d23a18b5dff2157279f32823e292'
    'node_modules\electron\dist\electron.exe'          = 'c579acaab64b1c456bda1693cdf1a2ec7e4de7738b0e2d1b6349d60e8087143c'
}
$configHash = 'ac4c719def84647f3b857c346507041f7995a144713da96ea17464c6020531e0'   # live-config.json and final-config.json carry the same bytes

if ((git -C $Candidate rev-parse HEAD) -ne $commit) { throw "Candidate is not at $commit" }
if (@(git -C $Candidate status --porcelain).Count -ne 0) { throw 'Candidate tree is not clean' }
Write-Host "commit OK: $commit, tree clean"
foreach ($k in $expected.Keys) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Candidate $k)).Hash.ToLowerInvariant()
    if ($actual -ne $expected[$k]) { throw "SHA-256 mismatch: $k" }
    Write-Host ("hash OK: {0}  {1}" -f $actual, $k)
}
foreach ($j in 'live-config.json', 'final-config.json') {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $ConfigFolder $j)).Hash.ToLowerInvariant()
    if ($actual -ne $configHash) { throw "SHA-256 mismatch: $j" }
    Write-Host ("hash OK: {0}  {1}" -f $actual, $j)
}
$helper = Join-Path $Candidate 'native\windows-capture\build\bin\scrb-capture.exe'
$electron = Join-Path $Candidate 'node_modules\electron\dist\electron.exe'
$appDir = Join-Path $Candidate 'apps\desktop'
if (-not $Launch) { Write-Host 'Check-only run complete. Nothing was launched. Add -Launch to start the app.'; return }

if (Test-Path -LiteralPath $RunFolder) { throw 'RunFolder already exists; choose a new one (fresh profile and library only)' }
$profile = Join-Path $RunFolder 'profile'; $library = Join-Path $RunFolder 'library'
New-Item -ItemType Directory -Path $profile | Out-Null
[IO.File]::WriteAllText((Join-Path $profile 'library-location.json'), (@{ root = $library } | ConvertTo-Json -Compress), (New-Object Text.UTF8Encoding($false)))
foreach ($n in 'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH') { Remove-Item -LiteralPath ('Env:' + $n) -ErrorAction SilentlyContinue }
$env:SCRB_CAPTURE_HELPER = $helper
$env:SCRB_LIVE_CONFIG = Join-Path $ConfigFolder 'live-config.json'
$env:SCRB_FINAL_PASS_CONFIG = Join-Path $ConfigFolder 'final-config.json'
$p = Start-Process -FilePath $electron -ArgumentList @('.', ('--user-data-dir=' + $profile)) -WorkingDirectory $appDir -PassThru
Write-Host ("Launched Electron PID {0} from {1}; helper {2}; profile {3}" -f $p.Id, $appDir, $helper, $profile)
