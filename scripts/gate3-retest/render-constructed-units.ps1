param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output already exists; STOP; preserve it.' }
$renderer = Join-Path $PSScriptRoot 'UnitRenderer.cs'
Add-Type -AssemblyName System.Speech
Add-Type -ReferencedAssemblies System.Speech -TypeDefinition (Get-Content -LiteralPath $renderer -Raw)
. (Join-Path $PSScriptRoot 'speech-specs.ps1')
New-Item -ItemType Directory -Path $OutputDirectory | Out-Null
$version=(Get-FileHash -LiteralPath $renderer -Algorithm SHA256).Hash.ToLowerInvariant()
$scriptVersion=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
$rows=@()
foreach ($unit in $constructedUnits) {
  $file=Join-Path $OutputDirectory ($unit.unit_id+'.wav')
  $render=[UnitRenderer]::Render($unit.voice,$unit.text,$unit.prosody_rate,$file)
  $row=@{}; foreach ($key in $unit.Keys) { $row[$key]=$unit[$key] }
  $row.file=$unit.unit_id+'.wav'; $row.samples=$render.samples; $row.sha256=$render.sha256
  $row.renderer_version=$version; $row.script_version=$scriptVersion
  $row | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath ($file+'.unit.json') -Encoding UTF8
  $rows+=$row
}
@{method='ConstructedUnits';status='UNFROZEN';sample_rate=24000;units=$rows} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'units-manifest.json') -Encoding UTF8
Write-Output 'Constructed unit WAVs rendered; UNFROZEN. No measurement, assembly, playback or recording performed.'
