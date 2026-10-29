param(
    [int]$DurationSeconds = 10,
    [int]$FrequencyHz = 880,
    [int]$SampleRate = 48000,
    [int]$DelaySeconds = 0
)

if ($DelaySeconds -gt 0) {
    Start-Sleep -Seconds $DelaySeconds
}

$sampleCount = $DurationSeconds * $SampleRate
$stream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($stream)
$dataLength = $sampleCount * 2

$writer.Write([System.Text.Encoding]::ASCII.GetBytes('RIFF'))
$writer.Write(36 + $dataLength)
$writer.Write([System.Text.Encoding]::ASCII.GetBytes('WAVE'))
$writer.Write([System.Text.Encoding]::ASCII.GetBytes('fmt '))
$writer.Write(16)
$writer.Write([int16]1)
$writer.Write([int16]1)
$writer.Write($SampleRate)
$writer.Write($SampleRate * 2)
$writer.Write([int16]2)
$writer.Write([int16]16)
$writer.Write([System.Text.Encoding]::ASCII.GetBytes('data'))
$writer.Write($dataLength)

for ($i = 0; $i -lt $sampleCount; $i++) {
    $seconds = $i / $SampleRate
    $pulsePosition = $seconds % 1.0
    $amplitude = if ($pulsePosition -lt 0.10) { 0.65 } else { 0.18 }
    $sample = [int16]($amplitude * [int16]::MaxValue *
        [Math]::Sin(2 * [Math]::PI * $FrequencyHz * $seconds))
    $writer.Write($sample)
}

$writer.Flush()
$stream.Position = 0
$player = [System.Media.SoundPlayer]::new($stream)
$player.PlaySync()
$player.Dispose()
$writer.Dispose()
$stream.Dispose()

