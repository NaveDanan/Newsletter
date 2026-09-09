[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot '../../outputs/longhorn-airgap-1.11.2'),
    [switch]$SkipImages,
    [switch]$Repackage
)

$ErrorActionPreference = 'Stop'
$version = '1.11.2'
$helmVersion = '3.21.4'
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
$utf8 = New-Object System.Text.UTF8Encoding($false)
New-Item -ItemType Directory -Force -Path $outputPath, (Join-Path $outputPath 'images'), (Join-Path $outputPath 'tools') | Out-Null

function Save-Download([string]$Url, [string]$RelativePath) {
    $target = Join-Path $outputPath $RelativePath
    if (-not (Test-Path -LiteralPath $target)) {
        Write-Host "Downloading $RelativePath"
        $temporary = "$target.part"
        Invoke-WebRequest -Uri $Url -OutFile $temporary
        Move-Item -LiteralPath $temporary -Destination $target
    }
}

if (-not $Repackage) {
Save-Download "https://raw.githubusercontent.com/longhorn/longhorn/v$version/deploy/longhorn-images.txt" 'longhorn-images.txt'
Save-Download "https://github.com/longhorn/charts/releases/download/longhorn-$version/longhorn-$version.tgz" "longhorn-$version.tgz"
Save-Download "https://get.helm.sh/helm-v$helmVersion-linux-amd64.tar.gz" 'tools/helm-linux-amd64.tar.gz'
Save-Download "https://get.helm.sh/helm-v$helmVersion-linux-amd64.tar.gz.sha256sum" 'tools/helm-linux-amd64.sha256'
Save-Download "https://github.com/longhorn/cli/releases/download/v$version/longhornctl-linux-amd64" 'tools/longhornctl'
Save-Download "https://github.com/longhorn/cli/releases/download/v$version/longhornctl-linux-amd64.sha256" 'tools/longhornctl.sha256'
foreach ($pair in @(@('tools/helm-linux-amd64.tar.gz', 'tools/helm-linux-amd64.sha256'), @('tools/longhornctl', 'tools/longhornctl.sha256'))) {
    $expected = ((Get-Content -LiteralPath (Join-Path $outputPath $pair[1]) -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash -LiteralPath (Join-Path $outputPath $pair[0]) -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { throw "Upstream checksum mismatch for $($pair[0])" }
}

# Include a small pinned test image in addition to the complete upstream list.
$images = @((Get-Content -LiteralPath (Join-Path $outputPath 'longhorn-images.txt')) | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
$images += 'library/busybox:1.37.0'
[IO.File]::WriteAllText((Join-Path $outputPath 'all-images.txt'), (($images -join "`n") + "`n"), $utf8)
$imageLocks = @()
if (-not $SkipImages) {
    $platform = & docker version --format '{{.Server.Os}}/{{.Server.Arch}}'
    if ($LASTEXITCODE -ne 0 -or $platform.Trim() -ne 'linux/amd64') { throw 'Use a Docker daemon in Linux/amd64 mode.' }
    foreach ($source in $images) {
        if ($source -notmatch '^[a-z0-9./_-]+:[A-Za-z0-9._-]+$') { throw "Unexpected image reference: $source" }
        $archiveName = ($source -replace '[/ :]', '_') + '.tar'
        $archive = Join-Path $outputPath "images/$archiveName"
        Write-Host "Preparing $source"
        & docker pull --platform linux/amd64 "docker.io/$source"
        if ($LASTEXITCODE -ne 0) { throw "Pull failed: $source" }
        $details = @((& docker image inspect "docker.io/$source" | ConvertFrom-Json))[0]
        if ($LASTEXITCODE -ne 0 -or $details.Architecture -ne 'amd64') { throw "Wrong image platform: $source" }
        # Always replace the archive after a successful save, so its lock matches it.
        & docker save -o "$archive.part" "docker.io/$source"
        if ($LASTEXITCODE -ne 0) { throw "Save failed: $source" }
        Move-Item -LiteralPath "$archive.part" -Destination $archive -Force
        $imageLocks += [ordered]@{ source = $source; archive = "images/$archiveName"; imageId = $details.Id; repoDigests = @($details.RepoDigests); architecture = $details.Architecture }
    }
}

$lock = [ordered]@{ longhornVersion = $version; helmVersion = $helmVersion; platform = 'linux/amd64'; preparedUtc = [DateTime]::UtcNow.ToString('o'); complete = (-not $SkipImages); images = $imageLocks }
[IO.File]::WriteAllText((Join-Path $outputPath 'bundle.json'), ($lock | ConvertTo-Json -Depth 6), $utf8)
} else {
    $lock = Get-Content -Raw -LiteralPath (Join-Path $outputPath 'bundle.json') | ConvertFrom-Json
    if ($lock.longhornVersion -ne $version -or -not $lock.complete) { throw 'Repackage requires an existing complete image download.' }
    foreach ($entry in $lock.images) {
        if (-not (Test-Path -LiteralPath (Join-Path $outputPath $entry.archive))) { throw "Missing archive: $($entry.archive)" }
    }
}

# Ship exactly the reviewed scripts and runbook; no env files or credentials.
foreach ($name in @('wizard.sh', 'offline.py', 'import-images.sh', 'verify-storage.sh', 'node-check.sh')) {
    $sourcePath = Join-Path $PSScriptRoot $name
    if (-not (Test-Path -LiteralPath $sourcePath)) { throw "Missing companion script: $name" }
    [IO.File]::WriteAllText((Join-Path $outputPath $name), ([IO.File]::ReadAllText($sourcePath).Replace("`r`n", "`n")), $utf8)
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../docs/longhorn-airgap.md') -Destination (Join-Path $outputPath 'README.md') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '../../docs/argocd-longhorn-airgap.example.yaml') -Destination (Join-Path $outputPath 'argocd-longhorn-airgap.example.yaml') -Force

$hashes = Get-ChildItem -LiteralPath $outputPath -Recurse -File | Where-Object { $_.Name -ne 'SHA256SUMS' -and -not $_.Name.EndsWith('.part') } | Sort-Object FullName | ForEach-Object {
    $relative = $_.FullName.Substring($outputPath.Length + 1).Replace('\', '/')
    '{0}  {1}' -f (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant(), $relative
}
[IO.File]::WriteAllText((Join-Path $outputPath 'SHA256SUMS'), (($hashes -join "`n") + "`n"), $utf8)
$archivePath = "$outputPath.tar.gz"
& tar -czf "$archivePath.part" -C (Split-Path $outputPath -Parent) (Split-Path $outputPath -Leaf)
if ($LASTEXITCODE -ne 0) { throw 'Bundle archive creation failed.' }
Move-Item -LiteralPath "$archivePath.part" -Destination $archivePath -Force
$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText("$archivePath.sha256", "$archiveHash  $([IO.Path]::GetFileName($archivePath))`n", $utf8)
Write-Host "Bundle: $archivePath"
Write-Host "SHA256: $archiveHash"
if ($SkipImages) { Write-Warning 'Planning bundle only. Re-run without -SkipImages before transfer or deployment.' }
