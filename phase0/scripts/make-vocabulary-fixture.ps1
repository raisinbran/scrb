# Synthesizes the vocabulary fixture sentences with each installed en-US SAPI
# voice into one 16 kHz mono WAV per voice, with a pause between sentences.

$ErrorActionPreference = 'Stop'
$scratch = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $scratch 'fixtures\vocabulary'
$terms = (Get-Content (Join-Path $fixture 'terms.json') -Raw | ConvertFrom-Json).terms

Add-Type -AssemblyName System.Speech
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(
    16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)

$synth = [System.Speech.Synthesis.SpeechSynthesizer]::new()
foreach ($voice in $synth.GetInstalledVoices()) {
    if ($voice.VoiceInfo.Culture.Name -ne 'en-US') { continue }
    $short = ($voice.VoiceInfo.Name -split ' ')[1].ToLowerInvariant()
    $path = Join-Path $fixture "vocab-$short.wav"
    $synth.SelectVoice($voice.VoiceInfo.Name)
    $synth.SetOutputToWaveFile($path, $format)
    $prompt = [System.Speech.Synthesis.PromptBuilder]::new()
    foreach ($t in $terms) {
        $prompt.AppendText($t.sentence)
        $prompt.AppendBreak([TimeSpan]::FromMilliseconds(900))
    }
    $synth.Speak($prompt)
    $synth.SetOutputToNull()
    Write-Output $path
}
