# MangaVerse installer / updater / uninstaller for Windows x64.
# Same commands as install.sh. Installs per-user; no admin and no paid signing account.
param(
  [ValidateSet('install','update','uninstall','status')]
  [string]$Action = 'install',
  [ValidateSet('nightly','stable')]
  [string]$Channel = 'nightly',
  [string]$Version = '',
  [string]$InstallDir = '',
  [string]$Staged = '',
  [switch]$PurgeData,
  [switch]$DryRun,
  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
if ($PSBoundParameters.ContainsKey('Staged') -and -not $Staged) { throw '-Staged needs a directory.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# A pinned version says which channel it belongs to unless -Channel overrides it.
if ($Version -and -not $PSBoundParameters.ContainsKey('Channel')) {
  $Channel = if ($Version -match '-nightly\.') { 'nightly' } else { 'stable' }
}

$Repo = 'BrainerVirus/mangaverse'
$Api = "https://api.github.com/repos/$Repo/releases"
$Headers = @{ 'User-Agent' = 'MangaVerse-Installer'; 'Accept' = 'application/vnd.github+json' }

if (-not $IsWindows -and $PSVersionTable.PSEdition -eq 'Core') { throw 'This installer is for Windows.' }
if ($Version) { $tag = 'v' + $Version.TrimStart('v') }
else {
  # Every current release is a pre-release, so /releases/latest is empty. "stable" means the
  # newest tag that is not a nightly; "nightly" the newest that is.
  $releases = Invoke-RestMethod "$Api?per_page=30" -Headers $Headers
  $release = if ($Channel -eq 'stable') {
    $releases | Where-Object { $_.tag_name -notmatch '-nightly\.' } | Select-Object -First 1
  } else {
    $releases | Where-Object { $_.prerelease -and $_.tag_name -match '-nightly\.' } | Select-Object -First 1
  }
  if ($null -eq $release) { throw "No $Channel release found." }
  $tag = $release.tag_name
}
if (-not $tag) { throw "No $Channel release found." }
$version = $tag.TrimStart('v')
if ($version -notmatch '^[0-9A-Za-z.+-]+$') { throw "Invalid version: $version" }
if ($Channel -eq 'nightly' -and $version -notmatch '-nightly\.') { throw "Tag $tag is not a nightly." }
if ($Channel -eq 'stable' -and $version -match '-nightly\.') { throw "Tag $tag is not stable." }

if (-not $InstallDir) { $InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\MangaVerse' }
$Receipt = Join-Path $InstallDir 'receipt.json'
$Shortcut = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\MangaVerse.lnk'
# The packaged app's userData is its package name (@app/desktop); MangaVerse is the name a
# future productName would use. Remove both on -PurgeData.
$DataDir = Join-Path $env:APPDATA 'MangaVerse'
$PackageDataDir = Join-Path $env:APPDATA '@app\desktop'
$AppPath = Join-Path $InstallDir 'MangaVerse.exe'

function Read-Receipt {
  if (Test-Path $Receipt) { Get-Content $Receipt -Raw | ConvertFrom-Json } else { $null }
}

# The in-app updater starts this script and then quits; a running exe cannot be replaced on
# Windows. Wait for it to go, and never kill it (that can interrupt a database write).
function Wait-ForAppExit([int]$Seconds = 60) {
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline -and (Get-Process -Name MangaVerse -ErrorAction SilentlyContinue)) {
    Start-Sleep -Milliseconds 250
  }
  if (Get-Process -Name MangaVerse -ErrorAction SilentlyContinue) {
    throw 'MangaVerse is still running. Quit it, then run this again.'
  }
}

if ($Action -eq 'status') {
  $r = Read-Receipt
  if ($null -eq $r) { 'MangaVerse is not installed by this script.' }
  else { $r | ConvertTo-Json -Depth 4 }
  return
}

if ($Action -eq 'uninstall') {
  $r = Read-Receipt
  $appDir = if ($r -and $r.app_dir) { $r.app_dir } else { $InstallDir }
  $shortcutPath = if ($r -and $r.shortcut) { $r.shortcut } else { $Shortcut }
  if ($DryRun) { Write-Host "Dry run: remove $appDir, $shortcutPath"; return }
  Wait-ForAppExit
  Remove-Item -Recurse -Force $appDir -ErrorAction SilentlyContinue
  Remove-Item -Force $shortcutPath -ErrorAction SilentlyContinue
  if ($PurgeData) {
    Remove-Item -Recurse -Force $PackageDataDir -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $DataDir -ErrorAction SilentlyContinue
    Write-Host 'MangaVerse uninstalled (user data removed).'
  } else {
    Write-Host 'MangaVerse uninstalled (user data preserved).'
  }
  return
}

$asset = "MangaVerse-$version-x64.zip"
$base = "https://github.com/$Repo/releases/download/$tag"
Write-Host "Install MangaVerse $version ($Channel) from $tag"
Write-Host "  app: $AppPath"
if ($DryRun) { Write-Host 'Dry run: nothing downloaded or written.'; return }

$tmp = Join-Path $env:TEMP ("mangaverse-install-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
# Only a directory validated below is ever removed, so a rejected or odd -Staged path never is.
$stagedClean = $null
try {
  $zip = Join-Path $tmp $asset
  $sums = Join-Path $tmp 'SHA256SUMS'
  if ($Staged) {
    # The app downloaded these itself (to show real progress). Accept only a directory it made:
    # resolved first (so .. cannot rename it), not a link, named mangaverse-staged-*. Then copy into
    # this script's own temp directory and verify that copy, so nothing can change the bytes
    # between the check and the install.
    $resolved = (Resolve-Path -LiteralPath $Staged -ErrorAction Stop).Path.TrimEnd('\')
    if ((Get-Item -LiteralPath $resolved -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Staged directory is a link.' }
    if ((Split-Path -Leaf $resolved) -notlike 'mangaverse-staged-*') { throw 'Staged directory must be one the app created (mangaverse-staged-*).' }
    foreach ($name in @($asset, 'SHA256SUMS')) {
      $from = Join-Path $resolved $name
      if (-not (Test-Path -LiteralPath $from -PathType Leaf)) { throw "Staged $name is missing." }
      if ((Get-Item -LiteralPath $from -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Staged $name is a link." }
      Copy-Item -LiteralPath $from -Destination (Join-Path $tmp $name)
    }
    $stagedClean = $resolved
  } else {
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile $zip
    Invoke-WebRequest -UseBasicParsing -Uri "$base/SHA256SUMS" -OutFile $sums
  }
  $line = Get-Content $sums | Where-Object { $_ -match "\s+$([regex]::Escape($asset))$" } | Select-Object -First 1
  if (-not $line) { throw "SHA256SUMS has no entry for $asset" }
  $expected = ($line -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLowerInvariant()
  if ($actual -ne $expected) { throw "Checksum mismatch for $asset" }

  $extract = Join-Path $tmp 'extract'
  Expand-Archive -Path $zip -DestinationPath $extract -Force
  if (-not (Test-Path (Join-Path $extract 'MangaVerse.exe'))) { throw 'Zip did not contain MangaVerse.exe' }

  Wait-ForAppExit
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Remove-Item -Recurse -Force (Join-Path $InstallDir '*') -ErrorAction SilentlyContinue
  Copy-Item -Path (Join-Path $extract '*') -Destination $InstallDir -Recurse -Force

  $ws = New-Object -ComObject WScript.Shell
  $lnk = $ws.CreateShortcut($Shortcut)
  $lnk.TargetPath = $AppPath
  $lnk.WorkingDirectory = $InstallDir
  $lnk.Save()

  @{ channel = $Channel; version = $version; tag = $tag; method = 'script'; app_path = $AppPath; app_dir = $InstallDir; shortcut = $Shortcut } |
    ConvertTo-Json | Set-Content -Encoding UTF8 $Receipt
  Write-Host "Installed MangaVerse $version."
  if (-not $NoLaunch) { Start-Process $AppPath }
} finally {
  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  if ($stagedClean) { Remove-Item -Recurse -Force -LiteralPath $stagedClean -ErrorAction SilentlyContinue }
}
