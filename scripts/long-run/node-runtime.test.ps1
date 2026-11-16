$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'node-runtime.ps1')

function Assert-Equal($Expected, $Actual, $Message) {
  if ($Expected -cne $Actual) { throw "$Message (expected '$Expected', got '$Actual')" }
}

$pathBefore = [Environment]::GetEnvironmentVariable('SCRB_NODE_EXE', 'Process')
$nodeCommand = Get-Command node -ErrorAction Stop
$expectedNode = $nodeCommand.Source
try {
  $env:SCRB_NODE_EXE = $expectedNode
  $selected = Get-ScrbNodeRuntime
  Assert-Equal $expectedNode $selected.Executable 'override executable selection'
  $actualVersion = (& $expectedNode --version | Out-String).Trim()
  Assert-Equal $actualVersion $selected.Version 'override version detection'
  Assert-Equal "node: $expectedNode ($actualVersion)" (Format-ScrbNodeRuntime $selected) 'runtime report'

  foreach ($invalid in @('relative\node.exe', (Join-Path $env:TEMP 'scrb-missing-node.exe'), (Join-Path $env:TEMP 'node.txt'))) {
    $env:SCRB_NODE_EXE = $invalid
    $rejected = $false
    try { $null = Get-ScrbNodeRuntime } catch { $rejected = $true }
    if (-not $rejected) { throw "invalid override was accepted: $invalid" }
  }

  Remove-Item Env:\SCRB_NODE_EXE
  $selected = Get-ScrbNodeRuntime
  Assert-Equal $expectedNode $selected.Executable 'Get-Command node fallback'
  Assert-Equal "node: $expectedNode ($actualVersion)" (Format-ScrbNodeRuntime $selected) 'fallback runtime report'
  Write-Output 'PASS: override, rejection, fallback, and executable/version reporting'
} finally {
  if ($null -eq $pathBefore) { Remove-Item Env:\SCRB_NODE_EXE -ErrorAction SilentlyContinue }
  else { $env:SCRB_NODE_EXE = $pathBefore }
}
