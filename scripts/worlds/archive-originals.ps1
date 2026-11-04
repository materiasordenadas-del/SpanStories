param([switch]$Archive)
$ErrorActionPreference = 'Stop'
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$originalRoot = [System.IO.Path]::GetFullPath('D:\Español\imagen para animación')
$allowedFolders = @('Aeropuerto_v2','Banco','Cafeteria','Comercio','Farmacia','Parada','Restaurante')
$archiveRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'worlds\source-archive\2026-09-28'))
$migration = Get-Content -LiteralPath (Join-Path $repositoryRoot 'worlds\migration.json') -Raw | ConvertFrom-Json
$repairs = Get-Content -LiteralPath (Join-Path $repositoryRoot 'worlds\repairs.json') -Raw | ConvertFrom-Json
$verification = Get-Content -LiteralPath (Join-Path $repositoryRoot 'worlds\verification.json') -Raw | ConvertFrom-Json
if ($verification.status -ne 'verified' -or $migration.places.Count -ne 7) { throw 'Verificación incompleta' }
if ($archiveRoot -ne (Join-Path $repositoryRoot 'worlds\source-archive\2026-09-28')) { throw 'Destino de archivo fuera del alcance' }
$moves = @()
$activeProcesses = Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(python|node|blender)' }
foreach ($place in $migration.places) {
    $resolvedSource = (Resolve-Path -LiteralPath $place.source).ProviderPath
    $leafName = Split-Path -Leaf $resolvedSource
    $expectedSource = [System.IO.Path]::GetFullPath((Join-Path $originalRoot $leafName))
    if ($leafName -notin $allowedFolders -or $resolvedSource -ne $expectedSource -or (Split-Path -Parent $resolvedSource) -ne $originalRoot) { throw "Origen fuera del alcance: $resolvedSource" }
    foreach ($process in $activeProcesses) {
        if ($process.CommandLine -and ($process.CommandLine.Contains($resolvedSource) -or $process.CommandLine.Contains($resolvedSource.Replace('\','/')))) { throw "Proceso activo $($process.ProcessId): $resolvedSource" }
    }
    $targetRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot $place.destination))
    if (-not $targetRoot.StartsWith((Join-Path $repositoryRoot 'worlds\prototypes\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Destino activo fuera del alcance' }
    $sourceItems = @(Get-ChildItem -LiteralPath $resolvedSource -Recurse -Force)
    if ($sourceItems | Where-Object { $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }) { throw 'Enlace no autorizado en el origen' }
    $sourceFiles = @($sourceItems | Where-Object { -not $_.PSIsContainer })
    if ($sourceFiles.Count -ne $place.files.Count) { throw "Cambió el inventario: $resolvedSource" }
    foreach ($file in $place.files) {
        $sourceFile = [System.IO.Path]::GetFullPath((Join-Path $resolvedSource $file.path))
        $targetFile = [System.IO.Path]::GetFullPath((Join-Path $targetRoot $file.path))
        if (-not $sourceFile.StartsWith($resolvedSource + '\', [StringComparison]::OrdinalIgnoreCase) -or -not $targetFile.StartsWith($targetRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta de archivo inválida' }
        if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $file.sha256) { throw "Cambió el original: $sourceFile" }
        $repairPath = $place.destination + '/' + $file.path
        $repair = $repairs.files | Where-Object { $_.path -eq $repairPath }
        $expectedHash = if ($repair) { if ($repair.originalSha256 -ne $file.sha256) { throw 'Reparación no verificable' }; $repair.sha256 } else { $file.sha256 }
        if ((Get-FileHash -LiteralPath $targetFile -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash) { throw "Destino alterado: $targetFile" }
    }
    $archiveDestination = [System.IO.Path]::GetFullPath((Join-Path $archiveRoot $leafName))
    if ((Split-Path -Parent $archiveDestination) -ne $archiveRoot -or (Test-Path -LiteralPath $archiveDestination)) { throw 'Destino de archivo inválido o ya ocupado' }
    $moves += @{ Source = $resolvedSource; Destination = $archiveDestination }
}
if ($Archive) {
    New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
    $archiveAncestors = @($archiveRoot, (Split-Path -Parent $archiveRoot), (Join-Path $repositoryRoot 'worlds'))
    foreach ($directory in $archiveAncestors) {
        if ((Get-Item -LiteralPath $directory).Attributes -band [System.IO.FileAttributes]::ReparsePoint) { throw 'El archivo contiene un enlace no autorizado' }
    }
    foreach ($move in $moves) { Move-Item -LiteralPath $move.Source -Destination $move.Destination }
    foreach ($move in $moves) {
        if ((Test-Path -LiteralPath $move.Source) -or -not (Test-Path -LiteralPath $move.Destination)) { throw 'Traslado al archivo incompleto' }
    }
    Write-Output 'Siete originales trasladados a worlds/source-archive/2026-09-28; ningún dato eliminado.'
} else { Write-Output 'Siete originales verificados: rutas, procesos, inventario y hashes.' }
