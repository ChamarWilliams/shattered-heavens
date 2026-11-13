$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$staging = Join-Path $workspace 'netlify-ready-game'
$archive = Join-Path $workspace 'netlify-ready-game.zip'

if (-not $staging.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
if (-not $archive.StartsWith($workspace, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }

if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$files = @(
  '.gitignore', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'netlify.toml', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
  'tsconfig.netlify.json', 'README.md', 'DUNGEON_DESIGN.md', 'DEPLOY_NETLIFY.md'
)
$directories = @('src', 'public', 'netlify')

foreach ($file in $files) { Copy-Item -LiteralPath (Join-Path $workspace $file) -Destination $staging }
foreach ($directory in $directories) { Copy-Item -LiteralPath (Join-Path $workspace $directory) -Destination $staging -Recurse }
New-Item -ItemType Directory -Path (Join-Path $staging 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $workspace 'tools\prune-production-assets.mjs') -Destination (Join-Path $staging 'tools')

# Source/reference generations are intentionally retained in the workspace but excluded from release uploads.
$releasePrune = @(
  'public\assets\source',
  'public\assets\environments\grand-archive-v1.png',
  'public\assets\environments\grand-archive-v2.png',
  'public\assets\environments\grand-archive-v3.png'
)
foreach ($theme in @('sectless-temple', 'nightfold-crypt', 'foxfire-shrine')) {
  foreach ($name in @('room-v2.png', 'room-v3.png', 'source-kit-v1.png', 'tiles-v1.png', 'enemies-v1.png', 'enemy-projectile-v3.png', 'closure-N-v4.png', 'closure-E-v4.png', 'closure-S-v4.png', 'closure-W-v4.png')) {
    $releasePrune += "public\assets\dungeons\$theme\$name"
  }
}
foreach ($relative in $releasePrune) {
  $target = Join-Path $staging $relative
  if (Test-Path -LiteralPath $target) { Remove-Item -LiteralPath $target -Recurse -Force }
}

Compress-Archive -LiteralPath $staging -DestinationPath $archive -CompressionLevel Optimal
Write-Output $archive
