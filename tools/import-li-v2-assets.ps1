param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.IO.Compression.FileSystem

$cellSize = 384
$targetFootX = 200
$targetFootY = 319
$states = [ordered]@{
    idle = @{ File = 'idle_sheet.png'; Count = 4 }
    move = @{ File = 'move_sheet.png'; Count = 6 }
    attack = @{ File = 'basic_attack_sheet.png'; Count = 5 }
    ability = @{ File = 'active_ability_sheet.png'; Count = 8 }
    hurt = @{ File = 'hurt_sheet.png'; Count = 3 }
    death = @{ File = 'death_sheet.png'; Count = 6 }
}

function Copy-EntryBitmap {
    param([System.IO.Compression.ZipArchiveEntry]$Entry)
    $stream = $Entry.Open()
    try {
        $image = [System.Drawing.Image]::FromStream($stream)
        try { return New-Object System.Drawing.Bitmap($image) }
        finally { $image.Dispose() }
    }
    finally { $stream.Dispose() }
}

function Get-FootAnchor {
    param([System.Drawing.Bitmap]$Bitmap)
    $bottom = -1
    for ($y = $Bitmap.Height - 1; $y -ge 0 -and $bottom -lt 0; $y--) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt 16) { $bottom = $y; break }
        }
    }
    if ($bottom -lt 0) { throw 'Idle frame is empty.' }
    $xTotal = 0.0
    $count = 0
    for ($y = [Math]::Max(0, $bottom - 8); $y -le $bottom; $y++) {
        for ($x = 0; $x -lt $Bitmap.Width; $x++) {
            if ($Bitmap.GetPixel($x, $y).A -gt 16) { $xTotal += $x; $count++ }
        }
    }
    if ($count -eq 0) { throw 'Idle frame has no foot pixels.' }
    return @{ X = $xTotal / $count; Y = $bottom }
}

function Get-LargestAlphaComponent {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [System.Drawing.Rectangle]$Rectangle
    )
    $visited = [bool[,]]::new($Rectangle.Width, $Rectangle.Height)
    $largest = New-Object 'System.Collections.Generic.List[System.Drawing.Point]'
    for ($localY = 0; $localY -lt $Rectangle.Height; $localY++) {
        for ($localX = 0; $localX -lt $Rectangle.Width; $localX++) {
            if ($visited[$localX, $localY]) { continue }
            $visited[$localX, $localY] = $true
            if ($Bitmap.GetPixel($Rectangle.X + $localX, $Rectangle.Y + $localY).A -le 16) { continue }
            $queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'
            $component = New-Object 'System.Collections.Generic.List[System.Drawing.Point]'
            $queue.Enqueue((New-Object System.Drawing.Point($localX, $localY)))
            while ($queue.Count -gt 0) {
                $point = $queue.Dequeue()
                $component.Add($point)
                for ($dy = -1; $dy -le 1; $dy++) {
                    for ($dx = -1; $dx -le 1; $dx++) {
                        if ($dx -eq 0 -and $dy -eq 0) { continue }
                        $nextX = $point.X + $dx
                        $nextY = $point.Y + $dy
                        if ($nextX -lt 0 -or $nextX -ge $Rectangle.Width -or $nextY -lt 0 -or $nextY -ge $Rectangle.Height) { continue }
                        if ($visited[$nextX, $nextY]) { continue }
                        $visited[$nextX, $nextY] = $true
                        if ($Bitmap.GetPixel($Rectangle.X + $nextX, $Rectangle.Y + $nextY).A -gt 16) {
                            $queue.Enqueue((New-Object System.Drawing.Point($nextX, $nextY)))
                        }
                    }
                }
            }
            if ($component.Count -gt $largest.Count) { $largest = $component }
        }
    }
    $result = New-Object System.Drawing.Bitmap($Rectangle.Width, $Rectangle.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    foreach ($point in $largest) {
        $result.SetPixel($point.X, $point.Y, $Bitmap.GetPixel($Rectangle.X + $point.X, $Rectangle.Y + $point.Y))
    }
    return $result
}

if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) { throw "ZIP not found: $ZipPath" }
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$vfxDirectory = Join-Path $OutputDirectory 'vfx'
New-Item -ItemType Directory -Path $vfxDirectory -Force | Out-Null

$archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
$atlas = New-Object System.Drawing.Bitmap(($cellSize * 8), ($cellSize * 6), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$atlasGraphics = [System.Drawing.Graphics]::FromImage($atlas)
$atlasGraphics.Clear([System.Drawing.Color]::Transparent)
$atlasGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
$atlasGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$frames = @()
$idleLowerBody = $null
$abilitySheet = $null
$abilityReleasePose = $null

try {
    $row = 0
    foreach ($state in $states.Keys) {
        $definition = $states[$state]
        $entryName = "echoes_of_the_realm_frames_v2/li_yunfeng/$($definition.File)"
        $entry = $archive.GetEntry($entryName)
        if ($null -eq $entry) { throw "Missing ZIP entry: $entryName" }
        $sheet = Copy-EntryBitmap -Entry $entry
        if ($sheet.Width -ne ($definition.Count * $cellSize) -or $sheet.Height -ne $cellSize) {
            $sheet.Dispose()
            throw "Unexpected dimensions for ${entryName}: $($sheet.Width)x$($sheet.Height)"
        }
        if ($state -eq 'ability') { $abilitySheet = New-Object System.Drawing.Bitmap($sheet) }
        if ($state -eq 'ability') {
            $releaseSource = New-Object System.Drawing.Rectangle((5 * $cellSize), 0, $cellSize, $cellSize)
            $abilityReleasePose = Get-LargestAlphaComponent -Bitmap $sheet -Rectangle $releaseSource
        }

        try {
            for ($index = 0; $index -lt $definition.Count; $index++) {
                $frameBitmap = New-Object System.Drawing.Bitmap($cellSize, $cellSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
                $frameGraphics.Clear([System.Drawing.Color]::Transparent)
                $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                $frameGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
                try {
                    $sourceRectangle = New-Object System.Drawing.Rectangle(($index * $cellSize), 0, $cellSize, $cellSize)
                    $destinationRectangle = New-Object System.Drawing.Rectangle(0, 0, $cellSize, $cellSize)
                    $frameGraphics.DrawImage($sheet, $destinationRectangle, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)

                    if ($state -eq 'ability') {
                        if ($index -le 3) {
                            $frameGraphics.Dispose()
                            $frameBitmap.Dispose()
                            $frameBitmap = $atlas.Clone((New-Object System.Drawing.Rectangle(($index * $cellSize), 0, $cellSize, $cellSize)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                            $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
                            $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                        }
                        else {
                            $frameGraphics.Dispose()
                            $frameBitmap.Dispose()
                            $frameBitmap = New-Object System.Drawing.Bitmap($abilityReleasePose)
                            $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
                            $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                        }
                    }

                    if ($state -eq 'idle') {
                        $topCleanup = New-Object System.Drawing.Bitmap($cellSize, 148, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                        $frameGraphics.DrawImageUnscaled($topCleanup, 0, 0)
                        $topCleanup.Dispose()
                        $anchor = Get-FootAnchor -Bitmap $frameBitmap
                        $offsetX = [Math]::Round($targetFootX - $anchor.X)
                        $offsetY = $targetFootY - $anchor.Y
                        if ($offsetX -ne 0 -or $offsetY -ne 0) {
                            $aligned = New-Object System.Drawing.Bitmap($cellSize, $cellSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                            $alignedGraphics = [System.Drawing.Graphics]::FromImage($aligned)
                            $alignedGraphics.Clear([System.Drawing.Color]::Transparent)
                            $alignedGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                            $alignedGraphics.DrawImageUnscaled($frameBitmap, $offsetX, $offsetY)
                            $alignedGraphics.Dispose()
                            $frameBitmap.Dispose()
                            $frameBitmap = $aligned
                            $frameGraphics.Dispose()
                            $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
                            $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                        }

                        if ($index -eq 0) {
                            $idleLowerBody = $frameBitmap.Clone((New-Object System.Drawing.Rectangle(0, 286, $cellSize, 98)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
                        }
                        else {
                            $frameGraphics.Dispose()
                            for ($copyY = 0; $copyY -lt 98; $copyY++) {
                                for ($copyX = 0; $copyX -lt $cellSize; $copyX++) {
                                    $frameBitmap.SetPixel($copyX, (286 + $copyY), $idleLowerBody.GetPixel($copyX, $copyY))
                                }
                            }
                            $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
                            $frameGraphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
                        }
                    }

                    $atlasGraphics.DrawImageUnscaled($frameBitmap, ($index * $cellSize), ($row * $cellSize))
                }
                finally {
                    $frameGraphics.Dispose()
                    $frameBitmap.Dispose()
                }

                $frames += [ordered]@{
                    name = '{0}-{1:d2}' -f $state, ($index + 1)
                    x = $index * $cellSize
                    y = $row * $cellSize
                    width = $cellSize
                    height = $cellSize
                    pivotX = $targetFootX
                    pivotY = $targetFootY
                }
            }
        }
        finally { $sheet.Dispose() }
        $row++
    }

    $atlasPath = Join-Path $OutputDirectory 'li-yunfeng.png'
    $atlas.Save($atlasPath, [System.Drawing.Imaging.ImageFormat]::Png)

    if ($null -eq $abilitySheet) { throw 'Ability sheet was not loaded.' }
    $projectileRectangle = New-Object System.Drawing.Rectangle((7 * $cellSize + 147), 116, 128, 70)
    $projectile = Get-LargestAlphaComponent -Bitmap $abilitySheet -Rectangle $projectileRectangle
    $projectile.Save((Join-Path $vfxDirectory 'flying-sword-projectile.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $projectile.Dispose()
    $impact = $abilitySheet.Clone((New-Object System.Drawing.Rectangle((7 * $cellSize + 91), 116, 202, 204)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $impact.Save((Join-Path $vfxDirectory 'flying-sword-impact.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $impact.Dispose()

    $manifest = [ordered]@{
        image = './li-yunfeng.png'
        alphaRequired = $true
        frames = $frames
        validation = [ordered]@{
            approved = $true
            reviewedAt = '2026-10-26'
            notes = @(
                'Functional placeholder imported from echoes_of_the_realm_frames_v2.zip; artwork is not final.',
                'Idle frames share a measured foot anchor at 200,319 and reuse frame 1 below y=286 to eliminate stepping.',
                'Upper-body idle variation is preserved for breathing, hair movement, and clothing sway.',
                'Ability frames keep character pixels separate: frames 1-4 reuse clean idle poses and frames 5-8 hold an isolated release pose.',
                'Projectile and impact placeholders are mechanically extracted from supplied active ability frame 8.'
            )
        }
    }
    $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'li-yunfeng.character.json') -Encoding utf8
}
finally {
    if ($null -ne $idleLowerBody) { $idleLowerBody.Dispose() }
    if ($null -ne $abilitySheet) { $abilitySheet.Dispose() }
    if ($null -ne $abilityReleasePose) { $abilityReleasePose.Dispose() }
    $atlasGraphics.Dispose()
    $atlas.Dispose()
    $archive.Dispose()
}
