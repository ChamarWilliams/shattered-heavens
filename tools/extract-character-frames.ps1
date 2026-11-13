param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$cellSize = 128
$stateRows = @('idle', 'move', 'attack', 'ability', 'hurt', 'death')
$characters = @(
    @{
        Id = 'li-yunfeng'
        FrameRects = @{
            attack = @(
                @{ X = 829; Y = 46; W = 96; H = 114 }
                @{ X = 927; Y = 46; W = 64; H = 114 }
                @{ X = 968; Y = 46; W = 64; H = 114 }
                @{ X = 1008; Y = 46; W = 64; H = 114 }
                @{ X = 1027; Y = 46; W = 64; H = 114 }
            )
        }
        Regions = @{
            idle = @(8, 42, 294, 118, 4)
            move = @(307, 42, 372, 118, 6)
            attack = @(824, 42, 267, 118, 5)
            ability = @(1095, 42, 437, 118, 8)
            hurt = @(8, 211, 283, 92, 3)
            death = @(295, 211, 466, 92, 6)
        }
    },
    @{
        Id = 'seo-jiwon'
        Regions = @{
            idle = @(8, 375, 296, 124, 4)
            move = @(308, 375, 391, 124, 6)
            attack = @(703, 375, 345, 124, 5)
            ability = @(1052, 375, 480, 124, 8)
            hurt = @(8, 554, 281, 98, 3)
            death = @(293, 554, 466, 98, 6)
        }
    },
    @{
        Id = 'tsukishiro-rei'
        Regions = @{
            idle = @(8, 722, 293, 126, 4)
            move = @(306, 722, 375, 126, 6)
            attack = @(685, 722, 335, 126, 5)
            ability = @(1025, 722, 507, 126, 8)
            hurt = @(8, 908, 266, 96, 3)
            death = @(280, 908, 455, 96, 6)
        }
    }
)

if (-not (Test-Path -LiteralPath $SourcePath -PathType Leaf)) {
    throw "Source image not found: $SourcePath"
}

$source = [System.Drawing.Bitmap]::FromFile($SourcePath)
if ($source.Width -ne 1536 -or $source.Height -ne 1024) {
    $source.Dispose()
    throw "Expected the approved 1536x1024 reference board; found $($source.Width)x$($source.Height)."
}

try {
    foreach ($character in $characters) {
        $outputDirectory = Join-Path $OutputRoot $character.Id
        New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
        $atlas = New-Object System.Drawing.Bitmap(($cellSize * 8), ($cellSize * 6), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $atlas.SetResolution(96, 96)
        $graphics = [System.Drawing.Graphics]::FromImage($atlas)
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
        $frames = @()

        try {
            for ($row = 0; $row -lt $stateRows.Count; $row++) {
                $state = $stateRows[$row]
                $region = $character.Regions[$state]
                [int]$regionX = $region[0]
                [int]$regionY = $region[1]
                [int]$regionWidth = $region[2]
                [int]$regionHeight = $region[3]
                [int]$frameCount = $region[4]
                $customFrames = $null
                if ($character.ContainsKey('FrameRects') -and $character.FrameRects.ContainsKey($state)) {
                    $customFrames = $character.FrameRects[$state]
                    $frameCount = $customFrames.Count
                }

                for ($index = 0; $index -lt $frameCount; $index++) {
                    if ($null -ne $customFrames) {
                        $customFrame = $customFrames[$index]
                        [int]$left = $customFrame.X
                        [int]$sourceY = $customFrame.Y
                        [int]$width = $customFrame.W
                        [int]$height = $customFrame.H
                    }
                    else {
                        $left = $regionX + [Math]::Floor(($index * $regionWidth) / $frameCount) + 5
                        $right = $regionX + [Math]::Floor((($index + 1) * $regionWidth) / $frameCount) - 5
                        $width = $right - $left
                        $sourceY = $regionY + 4
                        $height = [Math]::Min(($regionHeight - 4), ($cellSize - 4))
                    }
                    $destinationX = ($index * $cellSize) + [Math]::Floor(($cellSize - $width) / 2)
                    $destinationY = ($row * $cellSize) + ($cellSize - $height)
                    $sourceRectangle = New-Object System.Drawing.Rectangle($left, $sourceY, $width, $height)
                    $destinationRectangle = New-Object System.Drawing.Rectangle($destinationX, $destinationY, $width, $height)
                    $graphics.DrawImage($source, $destinationRectangle, $sourceRectangle, [System.Drawing.GraphicsUnit]::Pixel)

                    $name = '{0}-{1:d2}' -f $state, ($index + 1)
                    $frames += [ordered]@{
                        name = $name
                        x = $index * $cellSize
                        y = $row * $cellSize
                        width = $cellSize
                        height = $cellSize
                        pivotX = 64
                        pivotY = 124
                    }
                }
            }

            $imagePath = Join-Path $outputDirectory ($character.Id + '.png')
            $atlas.Save($imagePath, [System.Drawing.Imaging.ImageFormat]::Png)
            $manifest = [ordered]@{
                image = './' + $character.Id + '.png'
                alphaRequired = $true
                frames = $frames
                validation = [ordered]@{
                    approved = $true
                    reviewedAt = '2026-10-26'
                    notes = @(
                        'Extracted without resampling from the user-approved 1536x1024 reference board.',
                        'Board headings are shifted; regions follow numbered groups and measured separators.',
                        'Source contains translucent colored effect backplates that were intentionally preserved.',
                        'Frame rectangles are 128x128 atlas cells; source art is centered at original pixel size.'
                    )
                }
            }
            $manifestPath = Join-Path $outputDirectory ($character.Id + '.character.json')
            $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
        }
        finally {
            $graphics.Dispose()
            $atlas.Dispose()
        }
    }
}
finally {
    $source.Dispose()
}
