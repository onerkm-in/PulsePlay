# release-check.ps1 - PulsePlay local release gate.
#
# The laptop workspace IS the production environment for PulsePlay; there is
# no CI/CD pipeline. This script is the repeatable local gate that walks the
# four lanes:
#
#     playground/                         visual + adapter unit tests
#     proxy/                              jest suite + server syntax check
#     enablers/pulse-pbi/                 sibling Power BI custom visual
#     playground/scripts/shell-smoke-proxy.mjs   real-proxy + real-Chromium smoke
#
# It stops at the first failure and prints a single yes/no for "is this
# branch release-ready right now".
#
# Default invocation
#   pwsh -NoProfile -File .\scripts\release-check.ps1
#
# Skip flags
#   -SkipSmoke              skip the proxy-backed Node shell smoke (SS2)
#   -SkipPackage            skip pbiviz package + bundle-size cap
#   -SkipEnabler            skip the entire enablers/pulse-pbi/ lane
#   -SkipCredentials        skip the plaintext-secret scan
#   -IncludeLegacySmoke     opt-in: run scripts/smoke-full.ps1 and
#                           scripts/smoke-rls-ols.ps1 (Pulse-PBI / HSE
#                           sister-project lineage; requires a configured
#                           live Databricks profile to be meaningful)
#
# Bundle cap
#   -MaxPbivizKb 350        applies to enablers/pulse-pbi/dist/*.pbiviz
#
# Exit code 0 = release-ready. Exit code 1 = a check failed; the script
# prints the failing step and exits without running further checks.

[CmdletBinding()]
param(
    [switch]$SkipSmoke,
    [switch]$SkipPackage,
    [switch]$SkipEnabler,
    [switch]$SkipCredentials,
    [switch]$IncludeLegacySmoke,
    [int]$MaxPbivizKb = 350
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$started = Get-Date
$results = @()

function Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $stepStart = Get-Date
    try {
        & $Body
        if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
            throw "Non-zero exit code from '$Name': $LASTEXITCODE"
        }
        $script:results += [pscustomobject]@{
            Step = $Name
            Status = 'PASS'
            DurationSec = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        }
    } catch {
        $script:results += [pscustomobject]@{
            Step = $Name
            Status = 'FAIL'
            DurationSec = [math]::Round(((Get-Date) - $stepStart).TotalSeconds, 1)
        }
        Write-Host ""
        Write-Host "FAILED: $Name" -ForegroundColor Red
        Write-Host $_ -ForegroundColor Red
        Print-Summary
        exit 1
    }
}

function Print-Summary {
    Write-Host ""
    Write-Host "-- Release-check summary --------------------------------" -ForegroundColor Yellow
    $results | Format-Table -AutoSize | Out-String | Write-Host
    $total = ((Get-Date) - $started).TotalSeconds
    Write-Host ("Total: {0:N1}s" -f $total) -ForegroundColor Yellow
}

function Ensure-NodeModules {
    param([string]$Lane)
    Push-Location $Lane
    try {
        if (-not (Test-Path 'node_modules')) {
            Write-Host "  installing dependencies (npm ci)..." -ForegroundColor DarkGray
            npm ci
        } else {
            Write-Host "  node_modules already present; skipping reinstall." -ForegroundColor DarkGray
        }
    } finally { Pop-Location }
}

# -- Playground lane: install + typecheck + vitest -----------------------
Step 'Playground: npm ci (use existing if present)' {
    Ensure-NodeModules 'playground'
}

Step 'Playground: TypeScript (npm run lint = tsc --noEmit)' {
    Push-Location 'playground'
    try { npm run lint } finally { Pop-Location }
}

Step 'Playground: vitest (npm test)' {
    Push-Location 'playground'
    try { npm test --silent } finally { Pop-Location }
}

# -- Proxy lane: install + syntax check + jest ---------------------------
Step 'Proxy: npm ci (use existing if present)' {
    Ensure-NodeModules 'proxy'
}

Step 'Proxy: node --check server.js' {
    Push-Location 'proxy'
    try { node --check server.js } finally { Pop-Location }
}

Step 'Proxy: jest (npm test)' {
    Push-Location 'proxy'
    try { npm test --silent } finally { Pop-Location }
}

# -- Pulse PBI enabler lane (skippable) ----------------------------------
if (-not $SkipEnabler) {
    Step 'Enabler: npm ci (enablers/pulse-pbi)' {
        Ensure-NodeModules 'enablers/pulse-pbi'
    }

    Step 'Enabler: ESLint (npm run lint)' {
        Push-Location 'enablers/pulse-pbi'
        try { npm run lint } finally { Pop-Location }
    }

    Step 'Enabler: vitest (npm test)' {
        Push-Location 'enablers/pulse-pbi'
        try { npm test --silent } finally { Pop-Location }
    }
} else {
    Write-Host "Skipped: Pulse PBI enabler lane (-SkipEnabler)" -ForegroundColor DarkGray
}

# -- Credential hygiene (skippable) --------------------------------------
if (-not $SkipCredentials) {
    Step 'Credentials: scan for plaintext secrets' {
        & "$PSScriptRoot\Check-Credentials.ps1"
    }
} else {
    Write-Host "Skipped: credential scan (-SkipCredentials)" -ForegroundColor DarkGray
}

# -- Package + bundle-size cap (Pulse PBI artifact, skippable) -----------
if (-not $SkipPackage -and -not $SkipEnabler) {
    Step 'Package: npx pbiviz package (enablers/pulse-pbi)' {
        Push-Location 'enablers/pulse-pbi'
        try { npx pbiviz package } finally { Pop-Location }
    }

    Step "Package: bundle-size guard ($MaxPbivizKb KB cap)" {
        $distDir = Join-Path $repoRoot 'enablers\pulse-pbi\dist'
        $pbivizFiles = Get-ChildItem -Path $distDir -Filter '*.pbiviz' -ErrorAction SilentlyContinue
        if (-not $pbivizFiles) { throw "No .pbiviz found in $distDir after build." }
        $latest = $pbivizFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $kb = [math]::Round($latest.Length / 1KB, 1)
        Write-Host ("  {0} = {1} KB (cap {2} KB)" -f $latest.Name, $kb, $MaxPbivizKb) -ForegroundColor DarkGray
        if ($kb -gt $MaxPbivizKb) {
            throw "Bundle size $kb KB exceeds cap $MaxPbivizKb KB. Investigate before shipping (re-run with -MaxPbivizKb <new cap> if intentional)."
        }
    }
} else {
    Write-Host "Skipped: package + size cap (-SkipPackage or -SkipEnabler)" -ForegroundColor DarkGray
}

# -- Proxy-backed shell smoke (SS2; skippable) ---------------------------
if (-not $SkipSmoke) {
    Step 'Smoke: shell-smoke-proxy.mjs (real proxy + Vite + Chromium)' {
        Push-Location 'playground'
        try { node scripts/shell-smoke-proxy.mjs } finally { Pop-Location }
    }
} else {
    Write-Host "Skipped: SS2 shell smoke (-SkipSmoke)" -ForegroundColor DarkGray
}

# -- Legacy Pulse-PBI / HSE smoke (opt-in only) --------------------------
# scripts/smoke-full.ps1 and scripts/smoke-rls-ols.ps1 originated in the
# DwD/Pulse sister project. They speak to a live Databricks Genie workspace
# and assume a tenant-specific profile is configured (`default`, `hse`,
# etc.). Default-off here; turn on with -IncludeLegacySmoke when a real
# proxy + profile are wired up.
if ($IncludeLegacySmoke) {
    Step 'Legacy smoke: smoke-full.ps1' {
        & "$PSScriptRoot\smoke-full.ps1"
    }
    Step 'Legacy smoke: smoke-rls-ols.ps1' {
        & "$PSScriptRoot\smoke-rls-ols.ps1"
    }
} else {
    Write-Host "Skipped: legacy Databricks smoke (not -IncludeLegacySmoke)" -ForegroundColor DarkGray
}

Print-Summary
Write-Host "Release-check PASSED - branch is locally release-ready." -ForegroundColor Green
exit 0
