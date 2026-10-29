# Transcribes each vocabulary fixture WAV with each whisper model, with and
# without a glossary prompt, plus a control file with no glossary terms to catch
# false insertions.  Transcripts land in artifacts\vocabulary.

param([int]$Threads = 8)

$ErrorActionPreference = 'Stop'
$scratch = Split-Path -Parent $PSScriptRoot
$fixture = Join-Path $scratch 'fixtures\vocabulary'
$out = Join-Path $scratch 'artifacts\vocabulary'
New-Item -ItemType Directory -Force -Path $out | Out-Null
$whisper = Join-Path $scratch 'upstream\whisper.cpp\build-cpu\bin\whisper-cli.exe'
$terms = (Get-Content (Join-Path $fixture 'terms.json') -Raw | ConvertFrom-Json).terms
$glossary = 'Glossary: ' + (($terms | ForEach-Object term) -join ', ') + '.'
$control = Join-Path $scratch 'upstream\whisper.cpp\samples\jfk.wav'

$models = @{
    'small' = Join-Path $scratch 'models\whisper\ggml-small.en-q5_1.bin'
    'turbo' = Join-Path $scratch 'models\whisper\ggml-large-v3-turbo-q5_0.bin'
}
$inputs = @(Get-ChildItem $fixture -Filter 'vocab-*.wav') + @(Get-Item $control)

foreach ($m in $models.GetEnumerator()) {
    foreach ($wav in $inputs) {
        foreach ($mode in 'plain', 'prompt') {
            $base = Join-Path $out "$($m.Key)-$($wav.BaseName)-$mode"
            $cliArgs = @('-m', $m.Value, '-f', $wav.FullName, '-t', $Threads, '-nt', '-otxt', '-of', $base)
            if ($mode -eq 'prompt') { $cliArgs += @('--prompt', $glossary, '--carry-initial-prompt') }
            $ErrorActionPreference = 'Continue'
            & $whisper @cliArgs 2> "$base.stderr.txt" | Out-Null
            $ErrorActionPreference = 'Stop'
            Write-Output "$base.txt"
        }
    }
}
