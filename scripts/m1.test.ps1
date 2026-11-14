# Proves scripts/m1.ps1 refuses to start when files are missing. Windows only.
# Run in PowerShell: powershell -File scripts\m1.test.ps1
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$fake = Join-Path ([IO.Path]::GetTempPath()) ("m1test-" + [guid]::NewGuid().ToString('N'))
$ps = (Get-Process -Id $PID).Path
$savedPath = $env:PATH

function Fail([string]$Message) { Write-Host "FAIL: $Message"; if ($script:out) { Write-Host $script:out }; Cleanup; exit 1 }
function Cleanup {
  $env:PATH = $savedPath
  Remove-Item Env:SCRB_M1_HOME, Env:SCRB_M1_PROCESS_LIST -ErrorAction SilentlyContinue
  Remove-Item -Recurse -Force $fake -ErrorAction SilentlyContinue
}

$repo = Join-Path $fake 'repo'
$home1 = Join-Path $fake 'home'
$cfg = Join-Path $home1 'scrb-dev-assets\config'
$helperDir = Join-Path $repo 'native\windows-capture\build\bin'
$electronDir = Join-Path $repo 'node_modules\electron\dist'
$bin = Join-Path $fake 'bin'
foreach ($d in $repo, "$repo\scripts", $helperDir, $electronDir, $cfg, $bin) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
Copy-Item (Join-Path $here 'm1.ps1') "$repo\scripts\m1.ps1"
New-Item -ItemType File -Path "$electronDir\electron.exe" | Out-Null

# Stub node and npm: npm records how it was launched instead of starting Electron.
Set-Content -Path "$bin\node.cmd" -Value '@echo off'
$log = Join-Path $fake 'npm.log'
Set-Content -Path "$bin\npm.cmd" -Value @(
  '@echo off',
  "(echo args=%*& echo helper=%SCRB_CAPTURE_HELPER%& echo live=%SCRB_LIVE_CONFIG%& echo final=%SCRB_FINAL_PASS_CONFIG%& echo cwd=%CD%) > `"$log`""
)
$env:PATH = "$bin;$env:PATH"
$env:SCRB_M1_HOME = $home1
$procFile = Join-Path $fake 'procs.txt'
Set-Content -Path $procFile -Value ''
$env:SCRB_M1_PROCESS_LIST = $procFile

function Run {  # sets $script:out and $script:code
  $script:out = (& $ps -NoProfile -ExecutionPolicy Bypass -File "$repo\scripts\m1.ps1" *>&1 | Out-String)
  $script:code = $LASTEXITCODE
}
function ExpectFail([string[]]$Wants) {
  if ($script:code -eq 0) { Fail 'exited 0' }
  foreach ($w in $Wants) { if (-not $script:out.Contains($w)) { Fail "message lacks '$w'" } }
}
function WriteJson([string]$Name, [string]$Text) { Set-Content -Path "$cfg\$Name" -Value $Text -Encoding UTF8 }

# 1. Nothing exists.
Remove-Item "$helperDir\scrb-capture.exe" -ErrorAction SilentlyContinue
Run
ExpectFail 'capture helper', 'live.json', 'final-pass.json'

# 2. Helper exists; configs are complete except as each case below says.
New-Item -ItemType File -Path "$helperDir\scrb-capture.exe" | Out-Null
$p = Join-Path $fake 'present.bin'
New-Item -ItemType File -Path $p | Out-Null
function Json($o) { $o | ConvertTo-Json -Depth 5 -Compress }
$goodLive = @{ tools = @{ whisperServer = $p; whisperVad = $p }; models = @{ speechLive = $p; vad = $p } }
$goodFinal = @{
  tools = @{ ffmpeg = $p; ffprobe = $p; whisperCli = $p; sherpaSidecar = $p }
  models = @{ speechFinal = $p; vad = $p; segmentation = $p; embedding = $p }
}
WriteJson 'live.json' (Json $goodLive)
WriteJson 'final-pass.json' (Json $goodFinal)

# Complete configs: the script must launch npm with the right arguments and variables.
Run
if ($script:code -ne 0) { Fail "complete setup exited $($script:code)" }
$logText = Get-Content -LiteralPath $log
$wants = @(
  'args=start -w @scrb/desktop',
  "helper=$helperDir\scrb-capture.exe",
  "live=$cfg\live.json",
  "final=$cfg\final-pass.json"
)
foreach ($w in $wants) { if ($logText -cnotcontains $w) { Fail "npm launch lacks '$w'`n$logText" } }
if (-not ($logText | Where-Object { $_ -ieq "cwd=$repo" })) { Fail "npm launch lacks 'cwd=$repo'`n$logText" }

# A running copy: refuse, say how to quit, and do not launch.
Remove-Item $log
Set-Content -Path $procFile -Value "123|$electronDir\electron.exe|electron.exe ."
Run
ExpectFail 'already running', 'Stop-Process -Id 123'
if (Test-Path $log) { Fail 'launched despite a running copy' }
# Helpers, other apps and another repo's Electron dev app do not count.
Set-Content -Path $procFile -Value @(
  "124|$electronDir\electron.exe|electron.exe --type=gpu-process",
  '125|C:\Program Files\Claude\Claude.exe|Claude.exe',
  '126|C:\other\repo\node_modules\electron\dist\electron.exe|electron.exe .'
)
Run
if ($script:code -ne 0) { Fail 'unrelated processes blocked the start' }
Set-Content -Path $procFile -Value ''

# Each case below breaks one thing.
WriteJson 'live.json' '{"tools":{},"models":{}}'
Run
ExpectFail 'live config lacks a non-empty "tools.whisperServer"', '"models.vad"'

$bad = @{ tools = $goodFinal.tools; models = @{ speechFinal = $p; vad = $p; segmentation = $p; embedding = '' } }
WriteJson 'final-pass.json' (Json $bad)
WriteJson 'live.json' (Json $goodLive)
Run
ExpectFail 'final-pass config lacks a non-empty "models.embedding"'

$gone = Join-Path $fake 'no-such-ffmpeg'
$bad = @{ tools = @{ ffmpeg = $gone; ffprobe = $p; whisperCli = $p; sherpaSidecar = $p }; models = $goodFinal.models }
WriteJson 'final-pass.json' (Json $bad)
Run
ExpectFail '"tools.ffmpeg" points to a missing file', 'no-such-ffmpeg'

WriteJson 'live.json' 'not json'
Run
ExpectFail 'live config is not valid JSON'

Cleanup
Write-Host 'ok'
