Add-Type -AssemblyName System.Drawing
$dir = $env:LOGO_DIR
$srcPath = $env:LOGO_SRC
if (-not $dir -or -not $srcPath) { throw 'LOGO_DIR/LOGO_SRC env required' }
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$src = [System.Drawing.Image]::FromFile($srcPath)
$bmp = New-Object System.Drawing.Bitmap 72,72
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = 'HighQuality'
$g.PixelOffsetMode = 'HighQuality'
$g.DrawImage($src, 0, 0, 72, 72)
$out = Join-Path $dir 'logo.png'
$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose(); $src.Dispose()
$f = Get-Item $out
Write-Host ('logo.png bytes=' + $f.Length)
