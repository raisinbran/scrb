# Always-on-top clock window for the screen recording (Windows PowerShell 5.1). NOT RUN yet. A separate window; it does not touch the app.
# Shows seconds on the QPC clock since -OriginQpc (the same Stopwatch ticks the harness and observer log), updated about every 10 ms.
param(
    [Parameter(Mandatory = $true)][long]$OriginQpc,
    [int]$X = 20,
    [int]$Y = 20
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$frequency = [double][Diagnostics.Stopwatch]::Frequency
$form = New-Object System.Windows.Forms.Form
$form.Text = 'SCRB harness clock'; $form.TopMost = $true; $form.StartPosition = 'Manual'
$form.Location = New-Object System.Drawing.Point($X, $Y); $form.Size = New-Object System.Drawing.Size(360, 90)
$form.FormBorderStyle = 'FixedToolWindow'; $form.ShowInTaskbar = $false
$label = New-Object System.Windows.Forms.Label
$label.Dock = 'Fill'; $label.Font = New-Object System.Drawing.Font('Consolas', 28, [System.Drawing.FontStyle]::Bold); $label.TextAlign = 'MiddleCenter'
$form.Controls.Add($label)
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10
$timer.Add_Tick({ $label.Text = ('{0,9:0.000} s' -f (([Diagnostics.Stopwatch]::GetTimestamp() - $OriginQpc) / $frequency)) })
$timer.Start()
[void]$form.ShowDialog()
