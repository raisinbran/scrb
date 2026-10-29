param(
    [Parameter(Mandatory = $true)]
    [string]$Path
)

$resolved = (Resolve-Path -LiteralPath $Path).Path
$reader = [System.IO.BinaryReader]::new([System.IO.File]::OpenRead($resolved))
try {
    $riff = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    $null = $reader.ReadInt32()
    $wave = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
    if ($riff -ne 'RIFF' -or $wave -ne 'WAVE') {
        throw 'Not a RIFF/WAVE file.'
    }

    $format = $null
    $channels = 0
    $sampleRate = 0
    $bitsPerSample = 0
    $data = $null
    while ($reader.BaseStream.Position -lt $reader.BaseStream.Length) {
        $chunkId = [System.Text.Encoding]::ASCII.GetString($reader.ReadBytes(4))
        $chunkLength = $reader.ReadInt32()
        if ($chunkId -eq 'fmt ') {
            $format = $reader.ReadInt16()
            $channels = $reader.ReadInt16()
            $sampleRate = $reader.ReadInt32()
            $null = $reader.ReadInt32()
            $null = $reader.ReadInt16()
            $bitsPerSample = $reader.ReadInt16()
            $remaining = $chunkLength - 16
            if ($remaining -gt 0) { $null = $reader.ReadBytes($remaining) }
        } elseif ($chunkId -eq 'data') {
            $data = $reader.ReadBytes($chunkLength)
            break
        } else {
            $null = $reader.ReadBytes($chunkLength)
        }
    }

    if ($null -eq $data) { throw 'No data chunk found.' }
    $bytesPerSample = $bitsPerSample / 8
    $duration = $data.Length / ($sampleRate * $channels * $bytesPerSample)
    $nonZero = 0
    foreach ($byte in $data) {
        if ($byte -ne 0) { $nonZero++ }
    }

    [pscustomobject]@{
        Path = $resolved
        Format = $format
        Channels = $channels
        SampleRate = $sampleRate
        BitsPerSample = $bitsPerSample
        DataBytes = $data.Length
        DurationSeconds = [Math]::Round($duration, 3)
        NonZeroByteRatio = [Math]::Round($nonZero / [double]$data.Length, 6)
    } | ConvertTo-Json
} finally {
    $reader.Dispose()
}

