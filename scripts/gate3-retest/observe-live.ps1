param(
  [Parameter(Mandatory=$true)][int]$AppProcessId,
  [Parameter(Mandatory=$true)][string]$OutputFile,
  [ValidateRange(1,30)][int]$Seconds = 5
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputFile) { throw 'Observer output exists; no automatic repeat.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$AppProcessId)
$window = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children,$condition)
if ($null -eq $window) { throw 'No UIA window for the explicitly supplied app PID.' }
$frequency = [Diagnostics.Stopwatch]::Frequency
$writer = New-Object IO.StreamWriter([IO.File]::Open($OutputFile,[IO.FileMode]::CreateNew),[Text.UTF8Encoding]::new($false))
$origin = [Diagnostics.Stopwatch]::GetTimestamp()
$previous = $origin
try {
  while (([Diagnostics.Stopwatch]::GetTimestamp()-$origin)/$frequency -lt $Seconds) {
    $begin = [Diagnostics.Stopwatch]::GetTimestamp()
    $elements = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
    $rows = @()
    foreach ($element in $elements) {
      $current = $element.Current
      if ($current.Name) {
        $bounds = $current.BoundingRectangle
        $rows += @{text=$current.Name;type=$current.ControlType.ProgrammaticName;offscreen=$current.IsOffscreen;
          bounds=@($bounds.X,$bounds.Y,$bounds.Width,$bounds.Height);id=$current.AutomationId}
      }
    }
    $end = [Diagnostics.Stopwatch]::GetTimestamp()
    $writer.WriteLine((@{qpc_begin=$begin;qpc_end=$end;qpc_frequency=$frequency;utc=[DateTime]::UtcNow.ToString('o');
      read_ms=1000*($end-$begin)/$frequency;u_ms=1000*($end-$previous)/$frequency;elements=$rows;
      viewport_validation='NOT_VALIDATED';track_matching='NOT_IMPLEMENTED'} | ConvertTo-Json -Depth 6 -Compress))
    $writer.Flush()
    $previous = $end
    $remaining = 100-1000*([Diagnostics.Stopwatch]::GetTimestamp()-$begin)/$frequency
    if ($remaining -gt 0) { Start-Sleep -Milliseconds ([int]$remaining) }
  }
} finally { $writer.Dispose() }
Write-Output 'Read-only reach probe complete; not a full-load Live validation.'
