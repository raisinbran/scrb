# Always-on-top countdown for cases where the owner acts by hand.  Output is
# muted during capture, so the cue is visual only.  Uses wall time, so it is
# still right after the PC wakes from sleep.
# -Actions holds "<seconds>=<what to do>"; seconds count from $StartAt.
# With -StartFile instead of -StartAt the window waits for its Start button, which
# sets the start time and writes it to that file for the script running the case.
param(
    [Parameter(Mandatory)][string]$Case,
    [datetime]$StartAt,
    [string]$StartFile,
    [Parameter(Mandatory)][int]$Seconds,
    [string[]]$Actions = @()
)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$steps = @($Actions | ForEach-Object { $k, $v = $_ -split '=', 2; [pscustomobject]@{ At = [double]$k; Text = $v } } | Sort-Object At)
$started = -not $StartFile
if ($started) { $end = $StartAt.AddSeconds($Seconds) }

$form = [System.Windows.Forms.Form]::new()
$form.Text = "scrb test: $Case"
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.FormBorderStyle = 'FixedToolWindow'
$form.StartPosition = 'Manual'
$form.ClientSize = [System.Drawing.Size]::new(620, 500 + 24 * $steps.Count)
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.Location = [System.Drawing.Point]::new($area.Left + [int]($area.Width / 2), $area.Top + 20)

function Label([int]$y, [int]$h, [float]$size, [string]$style) {
    $l = [System.Windows.Forms.Label]::new()
    $l.SetBounds(16, $y, 588, $h)
    $l.Font = [System.Drawing.Font]::new('Segoe UI', $size, [System.Drawing.FontStyle]::$style)
    $form.Controls.Add($l)
    $l
}
$head = Label 10 30 12 'Regular'
$clock = Label 42 130 72 'Bold'
$now = Label 176 110 18 'Bold'
$next = Label 292 60 12 'Regular'
$list = Label 356 (40 + 24 * $steps.Count) 12 'Regular'

function StepList {
    @('All steps:') + @($steps | ForEach-Object {
        $when = if ($started) { $StartAt.AddSeconds($_.At).ToString('HH:mm:ss') } else { "+$([int]$_.At) s" }
        $mark = if ($started -and ((Get-Date) - $StartAt).TotalSeconds -ge $_.At + 3) { 'done' } else { '    ' }
        "$mark  $when  $($_.Text)"
    }) -join "`n"
}

if (-not $started) {
    $form.BackColor = [System.Drawing.Color]::LightSkyBlue
    $head.Text = "$Case   now waiting for Start"
    $clock.Text = 'READY'
    $now.Text = 'Press Start when you are ready.  Recording begins at once.'
    $next.Text = "The case runs $Seconds s in this window."
    $list.Text = StepList
    $button = [System.Windows.Forms.Button]::new()
    $button.Text = 'Start'
    $button.Font = [System.Drawing.Font]::new('Segoe UI', 18, [System.Drawing.FontStyle]::Bold)
    $button.SetBounds(16, 440 + 24 * $steps.Count, 588, 50)
    $form.Controls.Add($button)
    $button.add_Click({
        $script:StartAt = Get-Date
        $script:end = $script:StartAt.AddSeconds($Seconds)
        [IO.File]::WriteAllText($StartFile, $script:StartAt.ToString('o'))
        $script:started = $true
        $button.Visible = $false
    })
}

$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = 100
$timer.add_Tick({
    if (-not $started) { return }
    $t = Get-Date
    $elapsed = ($t - $StartAt).TotalSeconds
    $list.Text = StepList
    $future = @($steps | Where-Object { $_.At -gt $elapsed })
    $due = @($steps | Where-Object { $_.At -le $elapsed -and $elapsed -lt $_.At + 3 })
    $head.Text = "$Case   now $($t.ToString('HH:mm:ss'))   ends $($end.ToString('HH:mm:ss'))"
    if ($elapsed -ge $Seconds) {
        $form.BackColor = [System.Drawing.Color]::Honeydew
        $clock.Text = 'DONE'
        $now.Text = 'Case finished.  Nothing more to do.'
        $next.Text = ''
        if ($elapsed -ge $Seconds + 5) { $form.Close() }
    } elseif ($due.Count -gt 0) {
        $form.BackColor = [System.Drawing.Color]::Gold
        $clock.Text = 'DO IT NOW'
        $now.Text = $due[-1].Text
        $next.Text = if ($future.Count) { "Next, at $($StartAt.AddSeconds($future[0].At).ToString('HH:mm:ss')): $($future[0].Text)" } else { 'That was the last action.' }
    } elseif ($future.Count -gt 0) {
        $left = [math]::Ceiling($future[0].At - $elapsed)
        $form.BackColor = if ($left -le 5) { [System.Drawing.Color]::Orange } else { [System.Drawing.SystemColors]::Control }
        $clock.Text = "$left s"
        $now.Text = "Next, at $($StartAt.AddSeconds($future[0].At).ToString('HH:mm:ss')): $($future[0].Text)"
        $next.Text = if ($future.Count -gt 1) { "Then, at $($StartAt.AddSeconds($future[1].At).ToString('HH:mm:ss')): $($future[1].Text)" } else { 'No more actions after that.' }
    } else {
        $left = [math]::Ceiling($Seconds - $elapsed)
        $form.BackColor = [System.Drawing.SystemColors]::Control
        $clock.Text = "$left s"
        $now.Text = 'No more actions.  Leave everything as it is until the end.'
        $next.Text = ''
    }
})
$timer.Start()
[void]$form.ShowDialog()
