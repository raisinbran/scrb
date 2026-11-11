param($dir)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$codec = [Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | ? { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object Drawing.Imaging.EncoderParameters(1); $ep.Param[0] = New-Object Drawing.Imaging.EncoderParameter([Drawing.Imaging.Encoder]::Quality, [long]60)
$bd = [Windows.Forms.Screen]::PrimaryScreen.Bounds
while ($true) { $t = [Diagnostics.Stopwatch]::GetTimestamp(); $bm = New-Object Drawing.Bitmap $bd.Width, $bd.Height; $g = [Drawing.Graphics]::FromImage($bm)
  $g.CopyFromScreen($bd.Location, [Drawing.Point]::Empty, $bd.Size); $bm.Save("$dir\$t.jpg", $codec, $ep); $g.Dispose(); $bm.Dispose(); Start-Sleep -Milliseconds 400 }
