# Read-only Live-screen observer v3 (Windows PowerShell 5.1, not Administrator). Same raw JSONL as v2; the only change is that each poll
# prefetches Name, ControlType, IsOffscreen and BoundingRectangle with one UIA CacheRequest instead of four cross-process calls per element.
# v2 measured 226 ms/poll on 257 elements idle and up to 1.3 s under live load; the cache request measured 71 ms idle. Validation output only; not scored.
# Polls UI Automation under the transcript viewport and writes raw JSONL (schema SRCB-G3-OBSERVER-RAW-1) for observer_publications.py.
# It sends no input, invokes no control and changes nothing in the app. The output file is created new; no automatic repeat.
param(
    [Parameter(Mandatory = $true)][int]$AppProcessId,
    [Parameter(Mandatory = $true)][string]$OutputFile,
    [Parameter(Mandatory = $true)][ValidateRange(5, 900)][int]$Seconds,
    [string]$ViewportName = 'Live transcript',
    [int]$PollMilliseconds = 0,
    [switch]$WordBounds
)
$ErrorActionPreference = 'Stop'
if (Test-Path -LiteralPath $OutputFile) { throw 'Observer output exists; no automatic repeat.' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName WindowsBase
$UIA = [System.Windows.Automation.AutomationElement]
$frequency = [Diagnostics.Stopwatch]::Frequency
$rootCondition = New-Object System.Windows.Automation.PropertyCondition($UIA::ProcessIdProperty, $AppProcessId)
$window = $UIA::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $rootCondition)
if ($null -eq $window) { throw 'No UIA window for the explicitly supplied app PID.' }
$cache = New-Object System.Windows.Automation.CacheRequest
$cache.Add($UIA::NameProperty); $cache.Add($UIA::ControlTypeProperty); $cache.Add($UIA::IsOffscreenProperty); $cache.Add($UIA::BoundingRectangleProperty)
$cache.TreeScope = [System.Windows.Automation.TreeScope]::Element
$viewportCondition = New-Object System.Windows.Automation.PropertyCondition($UIA::NameProperty, $ViewportName)

function Get-Rect($rect) { if ($rect.IsEmpty) { $null } else { , @([double]$rect.X, [double]$rect.Y, [double]$rect.Width, [double]$rect.Height) } }

function Get-WordRanges($element) {
    # Word-level bounds through TextPattern when the element offers it; empty when it does not.
    $pattern = $null
    if (-not $element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) { return @() }
    $range = $pattern.DocumentRange.Clone()
    $range.MoveEndpointByRange([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, $range, [System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start)
    $words = @()
    for ($n = 0; $n -lt 400; $n++) {
        $moved = $range.MoveEndpointByUnit([System.Windows.Automation.Text.TextPatternRangeEndpoint]::End, [System.Windows.Automation.Text.TextUnit]::Word, 1)
        if ($moved -eq 0) { break }
        $text = $range.GetText(80).Trim()
        # GetBoundingRectangles() returns an array of System.Windows.Rect, one per line the range covers.
        # One rectangle is a normal word. A word wrapped over lines has several; use their union.
        # Empty rectangles (not laid out or scrolled away) are dropped; a word with none gets bounds = null,
        # which the offline visibility rule treats as not visible.
        $boxes = @(@($range.GetBoundingRectangles()) | Where-Object { -not $_.IsEmpty -and $_.Width -gt 0 -and $_.Height -gt 0 })
        if ($text) {
            if ($boxes.Count -ge 1) {
                $left = ($boxes | ForEach-Object { $_.Left } | Measure-Object -Minimum).Minimum
                $top = ($boxes | ForEach-Object { $_.Top } | Measure-Object -Minimum).Minimum
                $right = ($boxes | ForEach-Object { $_.Right } | Measure-Object -Maximum).Maximum
                $bottom = ($boxes | ForEach-Object { $_.Bottom } | Measure-Object -Maximum).Maximum
                $words += , @{ text = $text; bounds = @([double]$left, [double]$top, [double]($right - $left), [double]($bottom - $top)) }
            } else {
                $words += , @{ text = $text; bounds = $null }
            }
        }
        $range.MoveEndpointByRange([System.Windows.Automation.Text.TextPatternRangeEndpoint]::Start, $range, [System.Windows.Automation.Text.TextPatternRangeEndpoint]::End)
    }
    return $words
}

# Header: an adjacent QPC/UTC pair, so the session origin is documented for the offline conversion.
$originQpc = [Diagnostics.Stopwatch]::GetTimestamp()
$originUtc = [DateTime]::UtcNow.ToString('o')
$afterQpc = [Diagnostics.Stopwatch]::GetTimestamp()
$stream = [IO.File]::Open($OutputFile, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
$writer = New-Object IO.StreamWriter($stream, (New-Object Text.UTF8Encoding($false)))
try {
    $header = @{ type = 'header'; schema = 'SRCB-G3-OBSERVER-RAW-1'; qpc_frequency = $frequency; origin_qpc = $originQpc
        origin_pair_gap_ticks = ($afterQpc - $originQpc); origin_utc = $originUtc; app_pid = $AppProcessId
        strategy = 'cache-request'; script = 'observe-live-v3'; viewport_name = $ViewportName; poll_ms = $PollMilliseconds; word_bounds = [bool]$WordBounds
        powershell = $PSVersionTable.PSVersion.ToString(); input_sent = $false }
    $writer.WriteLine(($header | ConvertTo-Json -Depth 4 -Compress)); $writer.Flush()
    while ((([Diagnostics.Stopwatch]::GetTimestamp() - $originQpc) / $frequency) -lt $Seconds) {
        $begin = [Diagnostics.Stopwatch]::GetTimestamp()
        $scope = $cache.Activate()
        try {
            $viewport = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $viewportCondition)
            if ($null -eq $viewport) { throw 'Transcript viewport element not found' }
            $viewportBounds = Get-Rect $viewport.Cached.BoundingRectangle
            $elements = @()
            foreach ($e in $viewport.FindAll([System.Windows.Automation.TreeScope]::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
                $c = $e.Cached
                if (-not $c.Name) { continue }
                $row = @{ role = $c.ControlType.ProgrammaticName; name = $c.Name; offscreen = $c.IsOffscreen; bounds = (Get-Rect $c.BoundingRectangle) }
                if ($WordBounds -and $c.Name.Trim().Split(' ').Count -gt 1) { $row.words = @(Get-WordRanges $e) }
                $elements += , $row
            }
            $end = [Diagnostics.Stopwatch]::GetTimestamp()
            $line = @{ type = 'sample'; qpc_begin = $begin; qpc_end = $end; viewport = $viewportBounds; elements = $elements }
        } catch {
            $end = [Diagnostics.Stopwatch]::GetTimestamp()
            $line = @{ type = 'error'; qpc_begin = $begin; qpc_end = $end; message = $_.Exception.Message }
        } finally { $scope.Dispose() }
        $writer.WriteLine(($line | ConvertTo-Json -Depth 8 -Compress)); $writer.Flush()
        $sleep = $PollMilliseconds - 1000 * ([Diagnostics.Stopwatch]::GetTimestamp() - $begin) / $frequency
        if ($sleep -gt 0) { Start-Sleep -Milliseconds ([int]$sleep) }
    }
} finally { $writer.Dispose() }
Write-Output 'Observer finished. Validation output only; not scored.'
