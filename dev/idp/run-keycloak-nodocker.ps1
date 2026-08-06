# Run the dev IdP without docker.
#
#   .\dev\idp\run-keycloak-nodocker.ps1                # download (first run), verify, boot
#   .\dev\idp\run-keycloak-nodocker.ps1 -DownloadOnly  # just fetch + verify the runtimes
#
# docker-compose.yml remains the front door where docker exists. This box has no
# docker, and dev/idp had never actually been booted because of it — an untested
# auth path is the thing this directory exists to prevent. Keycloak is a plain
# Java application, so the container is a convenience, not a requirement: this
# script fetches the SAME pinned Keycloak release the compose file pins, plus a
# pinned Temurin JRE to run it on, and boots it with the same realm import,
# loopback-only, on the same port 7010.
#
# Both downloads come from the projects' official GitHub releases over HTTPS and
# are refused unless their SHA256 matches the pins below (recorded from the
# verified first fetch; the Temurin pin cross-checks against the .sha256.txt the
# Adoptium release publishes). Everything lands in dev/idp/.runtime/, which is
# gitignored — nothing enters a dependency tree, an artifact, or CI.

param(
    [switch]$DownloadOnly,

    [int]$Port = 7010,

    # Keycloak's management interface (health/metrics). 7011 keeps it in the
    # project's port neighbourhood instead of Keycloak's default 9000.
    [int]$ManagementPort = 7011
)

$ErrorActionPreference = 'Stop'

$KcVersion = '26.0.7'   # keep in lockstep with docker-compose.yml
$KcZipUrl  = "https://github.com/keycloak/keycloak/releases/download/$KcVersion/keycloak-$KcVersion.zip"
$KcSha256  = '25353b74613bcf72db67f8addbd88d832c705a69333091a16573d249d665fe21'

$JreTag     = 'jdk-21.0.5+11'
$JreZipName = 'OpenJDK21U-jre_x64_windows_hotspot_21.0.5_11.zip'
$JreZipUrl  = "https://github.com/adoptium/temurin21-binaries/releases/download/$([uri]::EscapeDataString($JreTag))/$JreZipName"
$JreSha256  = '1749b36cfac273cee11802bf3e90caada5062de6a3fef1a3814c0568b25fd654'

$Runtime = Join-Path $PSScriptRoot '.runtime'
New-Item -ItemType Directory -Force $Runtime | Out-Null

function Get-VerifiedZip {
    param([string]$Url, [string]$Dest, [string]$ExpectedSha256, [string]$What)

    if (-not (Test-Path $Dest)) {
        Write-Host "Downloading $What ..." -ForegroundColor Cyan
        Invoke-WebRequest -Uri $Url -OutFile "$Dest.partial"
        Move-Item "$Dest.partial" $Dest
    }

    $actual = (Get-FileHash $Dest -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($ExpectedSha256 -eq 'PIN-ME-ON-FIRST-FETCH') {
        Write-Warning "$What has no pinned SHA256 yet. Computed: $actual"
        Write-Warning "Pin it in run-keycloak-nodocker.ps1 before trusting this runtime."
    }
    elseif ($actual -ne $ExpectedSha256.ToLowerInvariant()) {
        Remove-Item $Dest -Force
        throw "$What SHA256 mismatch. Expected $ExpectedSha256, got $actual. Download deleted."
    }
    else {
        Write-Host "$What SHA256 verified." -ForegroundColor Green
    }
}

function Expand-Once {
    param([string]$Zip, [string]$MarkerDir)
    if (-not (Test-Path $MarkerDir)) {
        Write-Host "Extracting $(Split-Path $Zip -Leaf) ..." -ForegroundColor Cyan
        Expand-Archive -Path $Zip -DestinationPath $Runtime
    }
}

$kcZip  = Join-Path $Runtime "keycloak-$KcVersion.zip"
$jreZip = Join-Path $Runtime $JreZipName
$kcHome = Join-Path $Runtime "keycloak-$KcVersion"
$jreHome = Join-Path $Runtime "$JreTag-jre"

Get-VerifiedZip -Url $KcZipUrl  -Dest $kcZip  -ExpectedSha256 $KcSha256  -What "Keycloak $KcVersion"
Get-VerifiedZip -Url $JreZipUrl -Dest $jreZip -ExpectedSha256 $JreSha256 -What "Temurin 21 JRE"
Expand-Once -Zip $kcZip  -MarkerDir $kcHome
Expand-Once -Zip $jreZip -MarkerDir $jreHome

# Same realm import the container gets via its volume mount.
$importDir = Join-Path $kcHome 'data\import'
New-Item -ItemType Directory -Force $importDir | Out-Null
Copy-Item (Join-Path $PSScriptRoot 'realm-pulseplay.json') $importDir -Force

if ($DownloadOnly) {
    Write-Host "Runtimes ready under $Runtime" -ForegroundColor Green
    exit 0
}

# Dev-only bootstrap credentials, same as the compose file — and the same guard
# rail: start-dev refuses to run in production and says so on boot.
$env:JAVA_HOME = $jreHome
$env:KC_BOOTSTRAP_ADMIN_USERNAME = 'admin'
$env:KC_BOOTSTRAP_ADMIN_PASSWORD = 'admin'
$env:KC_HEALTH_ENABLED = 'true'

Write-Host "Starting Keycloak $KcVersion on 127.0.0.1:$Port (health on :$ManagementPort) ..." -ForegroundColor Cyan
& (Join-Path $kcHome 'bin\kc.bat') start-dev --import-realm `
    --http-host 127.0.0.1 --http-port $Port `
    --http-management-port $ManagementPort
