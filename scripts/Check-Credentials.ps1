# Check-Credentials.ps1
# ─────────────────────────────────────────────────────────────────────────────
# Scans tracked PBIP demo files for PAT-shaped strings (`dapi*`) and other
# obvious credential leaks before a push. Run before `git push` whenever you
# have credential prefills in the working tree (e.g. for live-testing the
# Direct + Gateway pages).
#
# Why: gitignore can't suppress files that are already tracked. The Direct +
# Gateway visual.json files MUST commit blank credentials per IDEA-018; this
# script catches accidental prefill commits.
#
# Usage:
#   pwsh -NoProfile -File ./scripts/Check-Credentials.ps1
#
# Exit codes:
#   0 — no leaks
#   1 — leak detected (with file + line context printed)
#
# Optional pre-commit hook setup (one-time per clone):
#   git config core.hooksPath .githooks
#   (Then add this script call into .githooks/pre-commit on any platform.)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot/..

# Files to scan — anything tracked under PBI/ that authors might prefill.
$targets = git ls-files PBI/ | Where-Object { $_ -like '*.json' -or $_ -like '*.tmdl' }
if (-not $targets) {
    Write-Host 'No tracked PBI files to scan.' -ForegroundColor Gray
    exit 0
}

# Patterns: Databricks PAT prefix, OpenAI key prefix, generic looking secret
# embedded in a token literal. Tune as the project adopts more backends.
$patterns = @(
    @{ Name = 'Databricks PAT';   Regex = "dapi[a-zA-Z0-9]{16,}" },
    @{ Name = 'OpenAI key';       Regex = "sk-[a-zA-Z0-9]{20,}"  },
    @{ Name = 'AWS access key';   Regex = "AKIA[A-Z0-9]{16}"     }
)

$leaks = @()
foreach ($file in $targets) {
    $text = Get-Content -LiteralPath $file -Raw -ErrorAction SilentlyContinue
    if (-not $text) { continue }
    foreach ($p in $patterns) {
        $matches = [regex]::Matches($text, $p.Regex)
        foreach ($m in $matches) {
            $line = ($text.Substring(0, $m.Index) -split "`n").Count
            $leaks += [pscustomobject]@{
                File   = $file
                Line   = $line
                Kind   = $p.Name
                Sample = $m.Value.Substring(0, [Math]::Min(12, $m.Value.Length)) + '…'
            }
        }
    }
}

if ($leaks.Count -gt 0) {
    Write-Host ''
    Write-Host '✗ Credential leak detected in tracked PBI files:' -ForegroundColor Red
    $leaks | Format-Table -AutoSize
    Write-Host ''
    Write-Host 'Revert the offending files before committing:' -ForegroundColor Yellow
    $leaks | Select-Object -ExpandProperty File -Unique | ForEach-Object {
        Write-Host ('  git checkout -- {0}' -f $_) -ForegroundColor Gray
    }
    Write-Host ''
    exit 1
} else {
    Write-Host '✓ No credentials leaked into tracked PBI files.' -ForegroundColor Green
    exit 0
}
