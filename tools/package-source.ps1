$ErrorActionPreference = 'Stop'

$workspace = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$staging = Join-Path $workspace 'echoes-of-the-realm-source'
$archive = Join-Path $workspace 'echoes-of-the-realm-source.zip'
$workspacePrefix = $workspace + [IO.Path]::DirectorySeparatorChar

if (-not $staging.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe staging path.' }
if (-not $archive.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }

if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

$rootFiles = @(
  '.gitignore', 'index.html', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
  'netlify.toml', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json',
  'tsconfig.node.json', 'tsconfig.netlify.json', 'README.md', 'DUNGEON_DESIGN.md',
  'DEPLOY_NETLIFY.md'
)
$sourceDirectories = @('src', 'public', 'netlify', 'docs', 'tests', 'tools')

foreach ($file in $rootFiles) {
  Copy-Item -LiteralPath (Join-Path $workspace $file) -Destination $staging
}
foreach ($directory in $sourceDirectories) {
  Copy-Item -LiteralPath (Join-Path $workspace $directory) -Destination $staging -Recurse
}

Compress-Archive -LiteralPath $staging -DestinationPath $archive -CompressionLevel Optimal
Write-Output $archive
