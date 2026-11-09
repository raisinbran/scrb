param(
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [ValidateSet('DiagnosticProbes','ConstructedUnits')][string]$Method='DiagnosticProbes',
  [switch]$Probe,
  [string]$PythonExecutable = 'C:\Users\bchen\Documents\ChatGPT\srcb\tools\python\python.exe'
)
$ErrorActionPreference = 'Stop'
if ($Method -eq 'ConstructedUnits') {
  & (Join-Path $PSScriptRoot 'render-constructed-units.ps1') -OutputDirectory $OutputDirectory
  return
}
if (-not $Probe) { throw 'Legacy encodings are diagnostic probes only. Full sources require -Method ConstructedUnits.' }
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output already exists; no automatic repeat.' }
if (-not (Test-Path -LiteralPath $PythonExecutable)) { throw 'Python executable unavailable; no synthesis started.' }
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech,System.Core -TypeDefinition (Get-Content -LiteralPath (Join-Path $PSScriptRoot 'SpeechRenderer.cs') -Raw)
. (Join-Path $PSScriptRoot 'speech-specs.ps1')
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$helper = Join-Path $PSScriptRoot 'bookmark-timing.py'

function Invoke-SourceRender {
  param([string]$Voice,[string]$Text,[string]$File,[string]$Encoding)
  $wordCount = $Text.Split(' ',[StringSplitOptions]::RemoveEmptyEntries).Count
  $expected = if ($Encoding -eq 'B') { $wordCount+1 } else { 2*$wordCount }
  $descriptor = @{voice=$Voice;text=$Text;file=$File;encoding=$Encoding;expected=$expected}
  try {
    if ($Encoding -eq 'C') {
      $parts = @(); $index=0
      foreach ($word in $Text.Split(' ',[StringSplitOptions]::RemoveEmptyEntries)) {
        $partFile = $File + ('.word-{0:D2}.wav' -f $index)
        $render = [SpeechRenderer]::Render($Voice,$word,$partFile,'A')
        $parts += @{file=$partFile;marks=@($render.marks);complete=$render.complete;timeline=$render.timeline}
        if (-not $render.complete) { break }
        $index++
      }
      $descriptor.parts=$parts
    } else {
      $render = [SpeechRenderer]::Render($Voice,$Text,$File,$Encoding)
      $descriptor.marks=@($render.marks); $descriptor.complete=$render.complete; $descriptor.timeline=$render.timeline
    }
  } catch {
    $failure = @{passed=$false;voice=$Voice;encoding=$Encoding;expected=$descriptor.expected;received=$null;position_non_decreasing=$false;error=$_.Exception.Message}
    $failure | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath ($File+'.timing.json') -Encoding UTF8
    return [pscustomobject]$failure
  }
  $descriptor | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath ($File+'.descriptor.json') -Encoding UTF8
  & $PythonExecutable $helper finalize ($File+'.descriptor.json') ($File+'.timing.json')
  if ($LASTEXITCODE -ne 0) { throw "Timing helper failed; retained output: $File" }
  return Get-Content -LiteralPath ($File+'.timing.json') -Raw | ConvertFrom-Json
}

$probeDirectory = Join-Path $OutputDirectory 'probe'
New-Item -ItemType Directory -Path $probeDirectory | Out-Null
$sample = 'Amber lanterns illuminate quiet gardens beside ancient orchards where patient artists sketch delicate blossoms every morning.'
$probes=@()
foreach ($spec in $specs) {
  foreach ($encoding in @('A','B','C')) {
    $file = Join-Path $probeDirectory ($spec.track+'-'+$encoding+'.wav')
    $result = Invoke-SourceRender -Voice $spec.voice -Text $sample -File $file -Encoding $encoding
    $probes += $result
    Write-Output ("{0} encoding {1}: expected {2}, received {3}; AudioPosition non-decreasing {4}; PASS {5}" -f $spec.voice,$encoding,$result.expected,$result.received,$result.position_non_decreasing,$result.passed)
  }
}
$probeReport = Join-Path $OutputDirectory 'probe-results.json'
@{voices=@($specs | ForEach-Object {$_.voice});probes=$probes} | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $probeReport -Encoding UTF8
$selectionFile = Join-Path $OutputDirectory 'encoding-selection.json'
& $PythonExecutable $helper select $probeReport $selectionFile
if ($LASTEXITCODE -ne 0) { throw "No bookmark encoding passed completely; retain $probeDirectory and $probeReport. No full render started." }
$selected = (Get-Content -LiteralPath $selectionFile -Raw | ConvertFrom-Json).selected_encoding
Write-Output "Selected encoding $selected (preference A, C, B; both voices must pass)."
if ($Probe) { Write-Output 'Probe only complete; no full source renders.'; return }
