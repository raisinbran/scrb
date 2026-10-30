# Always-on-top countdown for cases where the owner acts by hand.  Output is
# muted during capture, so the cue is visual only.  Uses wall time, so it is
# still right after the PC wakes from sleep.
# -Actions holds "<seconds>=<what to do>"; seconds count from $StartAt.
param(
    [Parameter(Mandatory)][string]$Case,
    [Parameter(Mandatory)][datetime]$StartAt,
    [Parameter(Mandatory)][int]$Seconds,
    [string[]]$Actions = @()
)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$steps = @($Actions | ForEach-Object { $k, $v = $_ -split '=', 2; [pscustomobject]@{ At = [double]$k; Text = $v } } | Sort-Object At)
$end = $StartAt.AddSeconds($Seconds)

$form = [System.Windows.Forms.Form]::new()
$form.Text = "scrb test: $Case"
$form.TopMost = $true
$form.ShowInTaskbar = $true
$form.FormBorderStyle = 'FixedToolWindow'
$form.StartPosition = 'Manual'
$form.ClientSize = [System.Drawing.Size]::new(620, 330)
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
$clock = Label 42 100 44 'Bold'
$now = Label 146 110 18 'Bold'
$next = Label 262 60 12 'Regular'

$timer = [System.Windows.Forms.Timer]::new()
$timer.Interval = 100
$timer.add_Tick({
    $t = Get-Date
    $elapsed = ($t - $StartAt).TotalSeconds
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
        $clock.Text = "{0}:{1:00}" -f [math]::Floor($left / 60), ($left % 60)
        $now.Text = "At $($StartAt.AddSeconds($future[0].At).ToString('HH:mm:ss')): $($future[0].Text)"
        $next.Text = if ($future.Count -gt 1) { "Then, at $($StartAt.AddSeconds($future[1].At).ToString('HH:mm:ss')): $($future[1].Text)" } else { 'No more actions after that.' }
    } else {
        $left = [math]::Ceiling($Seconds - $elapsed)
        $form.BackColor = [System.Drawing.SystemColors]::Control
        $clock.Text = "{0}:{1:00}" -f [math]::Floor($left / 60), ($left % 60)
        $now.Text = 'No more actions.  Leave everything as it is until the end.'
        $next.Text = ''
    }
})
$timer.Start()
[void]$form.ShowDialog()
