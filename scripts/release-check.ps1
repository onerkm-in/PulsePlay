# release-check.ps1 — IDEA-039 Codex Review #2 Agent E.
#
# The user's clarification of 2026-05-01 — "the laptop workspace IS the
# production environment, there is no CI/CD" — reframes Codex's "missing
# CI" gap as "missing repeatable local release gate". This script is that
# gate. Runs every check that would be wired into CI and stops at the first
# failure, so the operator gets a single yes/no for "is this branch
# release-ready right now".
#
# Default invocation: pwsh -NoProfile -File .\scripts\release-check.ps1
# Skip flags: -SkipSmoke (no live Databricks env), -SkipPackage (build-only).
# Verbose:    -Verbose passes through to underlying invocations.
#
# Exit code 0 = release-ready. Exit code 1 = a check failed; the script
# prints the failing step and exits without running further checks.

[CmdletBinding()]
param(
    [switch]$SkipSmoke,
    [switch]$SkipPackage,
    [switch]$SkipCredentials,
    # Hard ceiling for the .pbiviz output. Codex Review #2 noted the package
    # crept 215 KB → 259 KB across Sessions 47–49. Default cap leaves headroom
    # for a session of additions before forcing a conscious decision.
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
        if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {
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
    Write-Host "── Release-check summary ─────────────────────────────" -ForegroundColor Yellow
    $results | Format-Table -AutoSize | Out-String | Write-Host
    $total = ((Get-Date) - $started).TotalSeconds
    Write-Host ("Total: {0:N1}s" -f $total) -ForegroundColor Yellow
}

# ── Visual: lint, typecheck, vitest ─────────────────────────────────────
Step 'Visual: npm ci (use existing if present)' {
    Push-Location 'genieChatVisual'
    try {
        if (-not (Test-Path 'node_modules')) { npm ci }
        else { Write-Host "node_modules already present; skipping reinstall." -ForegroundColor DarkGray }
    } finally { Pop-Location }
}

Step 'Visual: ESLint' {
    Push-Location 'genieChatVisual'
    try { npx eslint --max-warnings=0 'src/**/*.ts' 'src/**/*.tsx' } finally { Pop-Location }
}

Step 'Visual: TypeScript' {
    Push-Location 'genieChatVisual'
    try { npx tsc --noEmit } finally { Pop-Location }
}

Step 'Visual: vitest' {
    Push-Location 'genieChatVisual'
    try { npx vitest run } finally { Pop-Location }
}

# ── Proxy: install + jest ───────────────────────────────────────────────
Step 'Proxy: npm ci (use existing if present)' {
    Push-Location 'proxy'
    try {
        if (-not (Test-Path 'node_modules')) { npm ci }
        else { Write-Host "node_modules already present; skipping reinstall." -ForegroundColor DarkGray }
    } finally { Pop-Location }
}

Step 'Proxy: TypeScript (// @ts-check)' {
    Push-Location 'genieChatVisual'
    try { npx tsc --allowJs --checkJs --noEmit --target ES2020 --module commonjs --moduleResolution node --skipLibCheck --resolveJsonModule ../proxy/server.js } finally { Pop-Location }
}

Step 'Proxy: jest' {
    Push-Location 'proxy'
    try { npm test --silent } finally { Pop-Location }
}

# ── Credential / hygiene checks (skippable) ─────────────────────────────
if (-not $SkipCredentials) {
    Step 'Credentials: scan for plaintext secrets' {
        & "$PSScriptRoot\Check-Credentials.ps1"
    }
} else {
    Write-Host "Skipped: credential scan (-SkipCredentials)" -ForegroundColor DarkGray
}

# ── Build / package (skippable in dev passes) ───────────────────────────
if (-not $SkipPackage) {
    Step 'Package: build.ps1 (lint + tsc + pbiviz)' {
        & "$repoRoot\build.ps1"
    }
    Step "Package: bundle-size guard ($MaxPbivizKb KB cap)" {
        $distDir = Join-Path $repoRoot 'genieChatVisual\dist'
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
    Write-Host "Skipped: package step (-SkipPackage)" -ForegroundColor DarkGray
}

# ── Smoke (skippable when no live Databricks env) ───────────────────────
if (-not $SkipSmoke) {
    Step 'Smoke: smoke-full.ps1' {
        & "$PSScriptRoot\smoke-full.ps1"
    }
    Step 'Smoke: smoke-rls-ols.ps1' {
        & "$PSScriptRoot\smoke-rls-ols.ps1"
    }
} else {
    Write-Host "Skipped: smoke (-SkipSmoke)" -ForegroundColor DarkGray
}

Print-Summary
Write-Host "Release-check PASSED — branch is locally release-ready." -ForegroundColor Green
exit 0
