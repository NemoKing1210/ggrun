param([string]$Path)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Bitmap]::FromFile($Path)
$w = $bmp.Width
$h = $bmp.Height
Write-Output "IMAGE: ${w}x${h}"

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$format = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
$bmpData = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, $format)
$bytes = New-Object byte[] ($bmpData.Stride * $h)
[System.Runtime.InteropServices.Marshal]::Copy($bmpData.Scan0, $bytes, 0, $bytes.Length)
$bmp.UnlockBits($bmpData)
$stride = $bmpData.Stride

function Test-Red($r, $g, $b) {
  return ($r -gt 170 -and $g -lt 90 -and $b -lt 90)
}

# Row profile: red pixel count per row (only rows with >= 20 red px)
Write-Output "ROW_PROFILE (rows with many red pixels):"
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  $cnt = 0
  $firstX = -1; $lastX = -1
  for ($x = 0; $x -lt $w; $x++) {
    $i = $row + ($x * 4)
    $b = $bytes[$i]; $g = $bytes[$i + 1]; $r = $bytes[$i + 2]
    if (Test-Red $r $g $b) {
      $cnt++
      if ($firstX -lt 0) { $firstX = $x }
      $lastX = $x
    }
  }
  if ($cnt -ge 20) {
    Write-Output ("row y={0}: {1} red px, x {2}..{3}" -f $y, $cnt, $firstX, $lastX)
  }
}
$bmp.Dispose()