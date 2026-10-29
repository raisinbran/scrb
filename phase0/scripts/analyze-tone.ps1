param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [int[]]$FrequenciesHz = @(440, 880)
)

$reader = [System.IO.BinaryReader]::new(
    [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $Path).Path))
try {
    if ([System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4)) -ne 'RIFF') {
        throw 'Not a RIFF file.'
    }
    $null = $reader.ReadInt32()
    if ([System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4)) -ne 'WAVE') {
        throw 'Not a WAVE file.'
    }

    $channels = 0
    $sampleRate = 0
    $bitsPerSample = 0
    $data = $null
    while ($reader.BaseStream.Position -lt $reader.BaseStream.Length) {
        $chunkId = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
        $chunkLength = $reader.ReadInt32()
        if ($chunkId -eq 'fmt ') {
            $null = $reader.ReadInt16()
            $channels = $reader.ReadInt16()
            $sampleRate = $reader.ReadInt32()
            $null = $reader.ReadInt32()
            $null = $reader.ReadInt16()
            $bitsPerSample = $reader.ReadInt16()
            if ($chunkLength -gt 16) { $null = $reader.ReadBytes($chunkLength - 16) }
        } elseif ($chunkId -eq 'data') {
            $data = $reader.ReadBytes($chunkLength)
            break
        } else {
            $null = $reader.ReadBytes($chunkLength)
        }
    }
} finally {
    $reader.Dispose()
}

if ($bitsPerSample -ne 16) { throw 'Only 16-bit PCM is supported.' }
$frameSize = $channels * 2
$sampleLimit = [Math]::Min([int]($data.Length / $frameSize), $sampleRate * 8)
$results = [ordered]@{}

foreach ($frequency in $FrequenciesHz) {
    $omega = 2.0 * [Math]::PI * $frequency / $sampleRate
    $coefficient = 2.0 * [Math]::Cos($omega)
    $s1 = 0.0
    $s2 = 0.0
    for ($i = 0; $i -lt $sampleLimit; $i++) {
        $offset = $i * $frameSize
        $sample = [BitConverter]::ToInt16($data, $offset) / 32768.0
        $s0 = $sample + $coefficient * $s1 - $s2
        $s2 = $s1
        $s1 = $s0
    }
    $power = $s1 * $s1 + $s2 * $s2 - $coefficient * $s1 * $s2
    $results["${frequency}HzPower"] = [Math]::Round($power, 6)
}

$low = [double]$results['440HzPower']
$high = [double]$results['880HzPower']
$results['TargetToLeakageDb'] = if ($low -gt 0) {
    [Math]::Round(10 * [Math]::Log10($high / $low), 3)
} else {
    'Infinity'
}
$results | ConvertTo-Json

