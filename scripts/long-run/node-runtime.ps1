function Get-ScrbNodeRuntime {
  if (Test-Path Env:\SCRB_NODE_EXE) {
    $nodeOverride = [Environment]::GetEnvironmentVariable('SCRB_NODE_EXE', 'Process')
    $isAbsolute = ($nodeOverride -match '^[A-Za-z]:\\') -or $nodeOverride.StartsWith('\\\\')
    if (-not $isAbsolute) { throw 'SCRB_NODE_EXE must be an absolute path to node.exe' }
    if ([System.IO.Path]::GetExtension($nodeOverride) -ine '.exe') { throw 'SCRB_NODE_EXE must point to node.exe' }
    if (-not (Test-Path -LiteralPath $nodeOverride -PathType Leaf)) { throw "SCRB_NODE_EXE does not exist: $nodeOverride" }
    $nodePath = (Resolve-Path -LiteralPath $nodeOverride).Path
    $node = Get-Command -Name $nodePath -CommandType Application -ErrorAction Stop
  } else {
    $node = Get-Command node -ErrorAction SilentlyContinue
  }
  if (-not $node) { throw 'node is not on PATH' }
  $nodeExe = $node.Source
  if (-not $nodeExe) { throw 'selected node command has no executable path' }
  $nodeVersion = & $nodeExe --version
  $nodeVersionExit = $LASTEXITCODE
  if ($nodeVersionExit -ne 0) { throw "selected node failed --version (exit $nodeVersionExit): $nodeExe" }
  $nodeVersion = ($nodeVersion -join ' ').Trim()
  if (-not $nodeVersion) { throw "selected node returned no version: $nodeExe" }
  return [pscustomobject]@{ Executable = $nodeExe; Version = $nodeVersion }
}

function Format-ScrbNodeRuntime {
  param([Parameter(Mandatory = $true)]$Runtime)
  return "node: $($Runtime.Executable) ($($Runtime.Version))"
}
