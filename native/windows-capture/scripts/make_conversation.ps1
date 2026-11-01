# T18: writes an invented two-voice conversation with the Windows voices, for the second device
# to play into a call.  Everything said is made up here.  The same seed gives the same file.
# Run with Windows PowerShell, which has System.Speech.
param(
    [Parameter(Mandatory)][string]$Out,
    [int]$Minutes = 65
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$rate = 16000
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new($rate, 'Sixteen', 'Mono')
$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
$voices = @($synth.GetInstalledVoices() | Where-Object Enabled | ForEach-Object { $_.VoiceInfo.Name })
if ($voices.Count -lt 2) { throw "Two voices are needed; found: $($voices -join ', ')" }
$random = [Random]::new(4242)
function Pick([string[]]$from) { $from[$random.Next($from.Count)] }

$places = 'the Marrowdale ferry dock', 'the Quillfen orchard', 'the old Tamsin rail yard', 'the Brindlewick library', 'the Osprey Lane market', 'the Harrowmere boat shed'
$things = 'the lantern parade', 'the seed swap', 'the kite weekend', 'the harvest supper', 'the bicycle repair day', 'the tide pool walk', 'the choir picnic'
$items = 'folding tables', 'rain tents', 'paper lanterns', 'extension cords', 'name badges', 'soup kettles', 'wooden benches', 'first aid kits', 'tide charts'
$names = 'Pellam', 'Odessa Wren', 'Corvin', 'Mirelle', 'Tobiah', 'Junia', 'Hask', 'Linnet'
$days = 'Tuesday', 'Wednesday', 'Thursday', 'Saturday morning', 'Sunday afternoon', 'the first of the month', 'the weekend after next'
$counts = 'four', 'seven', 'a dozen', 'twenty', 'thirty five', 'about sixty', 'nearly a hundred'
$lines = @(
    { "So where did we land on $(Pick $things)?" },
    { "I spoke with $(Pick $names) about $(Pick $things), and they want it near $(Pick $places)." },
    { "We still need $(Pick $counts) $(Pick $items) before $(Pick $days)." },
    { "That works for me, but $(Pick $names) can only help on $(Pick $days)." },
    { "Honestly, $(Pick $places) floods whenever the wind turns, so I would not put the $(Pick $items) there." },
    { "Right, and last year we ran out of $(Pick $items) halfway through $(Pick $things)." },
    { "Could $(Pick $names) borrow $(Pick $counts) $(Pick $items) from $(Pick $places)?" },
    { "Hmm. Let me check with $(Pick $names) and come back to you by $(Pick $days)." },
    { "Okay." },
    { "Yes, exactly." },
    { "No, I think that was $(Pick $names)." },
    { "I would rather move $(Pick $things) to $(Pick $days) and keep it small, maybe $(Pick $counts) people." },
    { "The trouble is that the van only fits $(Pick $counts) $(Pick $items), so we would need two trips from $(Pick $places)." },
    { "Good point. What did $(Pick $names) say about the budget for $(Pick $items)?" },
    { "They said it was fine as long as $(Pick $things) ends before dark." },
    { "Wait, is that the same $(Pick $names) who ran $(Pick $things) at $(Pick $places)?" }
)

$synth.SetOutputToWaveFile($Out, $format)
$wanted = [int64]$Minutes * 60 * $rate * 2
$turn = 0
$lineCount = 0
while ((Get-Item $Out).Length -lt $wanted) {
    $synth.SelectVoice($voices[$turn % 2])
    $synth.Rate = $random.Next(-1, 3)
    $prompt = [System.Speech.Synthesis.PromptBuilder]::new()
    foreach ($i in 1..$random.Next(1, 4)) {
        $prompt.AppendText((& $lines[$random.Next($lines.Count)]))
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds($random.Next(150, 700)))
        $lineCount++
    }
    $prompt.AppendBreak([TimeSpan]::FromMilliseconds($random.Next(200, 2500)))
    $synth.Speak($prompt)
    $turn++
}
$synth.SetOutputToNull()
$synth.Dispose()
"voices=$($voices[0..1] -join ', ') lines=$lineCount bytes=$((Get-Item $Out).Length)"
