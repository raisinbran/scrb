# Runs LiveDiarize.exe over AMI meetings for each configuration and scores DER.
# A configuration is "offline <threshold|count>" or
# "live <window> <hop> <cluster_threshold|count> <match_threshold>".

param(
    [string[]]$Meetings = @('ES2004a'),
    [string[]]$Configs = @('offline 0.7', 'offline 0.8', 'offline 0.9', 'offline 4'),
    [string]$Embedding = '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
    [string]$Exe = 'LiveDiarize.exe'
)

$scratch = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $scratch "probes\live-diarization\$Exe"
$seg = Join-Path $scratch 'models\sherpa-onnx\sherpa-onnx-pyannote-segmentation-3-0\model.int8.onnx'
$emb = Join-Path $scratch "models\sherpa-onnx\$Embedding"
$embTag = if ($Embedding -like 'wespeaker*') { 'en-' } else { '' }
$out = Join-Path $scratch 'artifacts\diarization'
$segments = Join-Path $scratch 'downloads\ami\ann\segments'
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($meeting in $Meetings) {
    foreach ($config in $Configs) {
        $parts = $config -split ' '
        $tag = $embTag + ($parts -join '-')
        $hyp = Join-Path $out "$meeting-$tag.txt"
        $wav = Join-Path $scratch "downloads\ami\$meeting.Mix-Headset.wav"
        $stats = & $exe $wav $hyp $seg $emb @parts 2> (Join-Path $out "$meeting-$tag.stderr.txt")
        $score = python -I (Join-Path $PSScriptRoot 'score_der.py') $segments $meeting $hyp
        $finalScore = $null
        if (Test-Path "$hyp.final.txt") {
            $finalScore = python -I (Join-Path $PSScriptRoot 'score_der.py') $segments $meeting "$hyp.final.txt" | ConvertFrom-Json
        }
        $line = [pscustomobject]@{
            config = $config
            embedding = $Embedding
            stats = $stats | ConvertFrom-Json
            score = $score | ConvertFrom-Json
            final_score = $finalScore
        } | ConvertTo-Json -Compress -Depth 4
        Add-Content -Path (Join-Path $out 'results.jsonl') -Value $line
        Write-Output $line
    }
}
