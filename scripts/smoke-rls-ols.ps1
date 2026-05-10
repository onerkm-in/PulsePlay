# RLS / OLS smoke test for the Databricks Genie integration.
#
# Purpose
# -------
# The HSE semantic model (SampleSuperStoreHSE.SemanticModel) defines real
# Power BI security:
#   RLS roles:
#     * EastManagerStatic   -> [region] = "East"
#     * WestManagerStatic   -> [region] = "West"
#     * ConsumerAnalystStatic -> [segment] = "Consumer"
#     * DynamicByUser       -> USERPRINCIPALNAME() lookup
#   OLS role:
#     * NoMarginAnalyst     -> columnPermission profit/discount = None
#
# The Genie visual reaches Databricks through the proxy with a shared PAT.
# That PAT has no knowledge of the PBI role the current user is in, so RLS
# and OLS are NOT enforced on the Genie path. This smoke quantifies that
# gap by asking Genie a question that would be impossible under both
# EastManagerStatic and NoMarginAnalyst, then checking whether Genie still
# returned cross-region rows and non-null profit/discount numbers.
#
# Verdict reference (matches the "Scope-only" security badge in the visual):
#   RLS "at par"  = Genie returns ONLY East region   -> PASS if enforced
#   OLS "at par"  = Genie refuses / nulls profit+discount -> PASS if enforced
# In the shared-PAT architecture both are expected to be BYPASSED. The
# smoke therefore reports a clear BYPASSED verdict rather than a hard FAIL;
# that way the script can be wired into CI as a regression guard against
# anyone silently switching to on-behalf-of auth without updating the badge.

$ErrorActionPreference = 'Stop'
$proxy  = 'http://127.0.0.1:8787'
$profile = 'hse'
$results = @()

function Add-Result { param($label, $latency, $detail, $verdict)
    $clean = ($detail -replace "`r?`n", " " | Out-String).Trim()
    if ($clean.Length -gt 160) { $clean = $clean.Substring(0,160) }
    $script:results += [pscustomobject]@{
        Label   = $label
        Latency = $latency
        Verdict = $verdict
        Detail  = $clean
    }
}

function Poll { param($convId, $msgId, $maxSeconds = 180)
    $u = "$proxy/assistant/conversations/$convId/messages/${msgId}?assistantProfile=$profile"
    $deadline = (Get-Date).AddSeconds($maxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri $u -TimeoutSec 30
            if ($r.status -in @('COMPLETED','FAILED','CANCELLED')) { return $r }
        } catch { }
        Start-Sleep -Seconds 3
    }
    return $null
}

function Extract-All { param($msg)
    $text = @()
    if ($msg.content) { $text += $msg.content }
    if ($msg.attachments) {
        foreach ($a in $msg.attachments) {
            if ($a.text -and $a.text.content) { $text += $a.text.content }
            if ($a.query -and $a.query.description) { $text += $a.query.description }
            if ($a.query -and $a.query.query)       { $text += $a.query.query }
        }
    }
    return ($text -join "`n")
}

# Pre-flight: proxy + profile available
$t = Get-Date
$h = Invoke-RestMethod "$proxy/health" -TimeoutSec 5
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
if (-not ($h.profiles -contains $profile)) {
    Write-Host "FATAL: proxy does not have '$profile' profile configured" -ForegroundColor Red
    exit 2
}
Add-Result 'S0 health + hse profile' $lat (($h | ConvertTo-Json -Compress)) 'PASS'

# S1 — RLS probe: ask for a per-region breakdown.
# Under EastManagerStatic a user would see ONLY East. Genie via shared PAT
# has no session role, so it should return every region.
$t = Get-Date
$q = 'Show total_sales and order_count grouped by region. Return the raw rows, do not summarise.'
$body = @{ assistantProfile = $profile; content = $q; contextText = '' } | ConvertTo-Json -Compress
$s = Invoke-RestMethod -Method POST -Uri "$proxy/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 180
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$payload = Extract-All $r
$regions = @('East','West','Central','South') | Where-Object { $payload -match "(?i)\b$_\b" }
$rlsBypassed = ($regions.Count -ge 2)
$rlsVerdict = if ($rlsBypassed) { 'BYPASSED (expected)' } else { 'ENFORCED (unexpected)' }
Add-Result 'S1 RLS: per-region rows' $lat "regions_seen=$($regions -join ',')" $rlsVerdict
$convHse = $s.conversation_id

# S2 — OLS probe: ask for profit + discount, both removed under NoMarginAnalyst.
Start-Sleep 10
$t = Get-Date
$q = 'Show total profit and average discount by region. Include the numbers for every region.'
$body = @{ assistantProfile = $profile; content = $q; contextText = '' } | ConvertTo-Json -Compress
$s = Invoke-RestMethod -Method POST -Uri "$proxy/assistant/conversations/$convHse/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 180
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$payload = Extract-All $r
$profitMentioned   = $payload -match '(?i)profit'
$discountMentioned = $payload -match '(?i)discount'
$hasNumbers        = $payload -match '[-+]?\d+(\.\d+)?'
$olsBypassed = ($profitMentioned -and $discountMentioned -and $hasNumbers)
$olsVerdict = if ($olsBypassed) { 'BYPASSED (expected)' } else { 'ENFORCED (unexpected)' }
Add-Result 'S2 OLS: profit + discount' $lat "profit=$profitMentioned discount=$discountMentioned numbers=$hasNumbers" $olsVerdict

# S3 — USERPRINCIPALNAME probe: confirm no PBI user identity flows to Genie.
Start-Sleep 10
$t = Get-Date
$q = 'Who is the current user? Return USERPRINCIPALNAME or session identity only.'
$body = @{ assistantProfile = $profile; content = $q; contextText = '' } | ConvertTo-Json -Compress
$s = Invoke-RestMethod -Method POST -Uri "$proxy/assistant/conversations/$convHse/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 180
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$payload = Extract-All $r
$upnLeak = $payload -match '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
$identityVerdict = if ($upnLeak) { 'UPN RETURNED (investigate)' } else { 'NO PBI IDENTITY (expected)' }
Add-Result 'S3 Identity: USERPRINCIPALNAME' $lat ("len=$($payload.Length); upnFound=$upnLeak") $identityVerdict

# Render
Write-Host ""
Write-Host "=== RLS / OLS SMOKE SUMMARY (HSE profile) ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

# Overall verdict: the security badge says "Scope-only", meaning RLS and OLS
# are expected to be bypassed via the shared PAT. Fail ONLY if the behaviour
# diverged from what the badge advertises.
$badgeConsistent = `
    ($results | Where-Object { $_.Label -like 'S1*' }).Verdict -match 'BYPASSED' -and `
    ($results | Where-Object { $_.Label -like 'S2*' }).Verdict -match 'BYPASSED' -and `
    ($results | Where-Object { $_.Label -like 'S3*' }).Verdict -match 'NO PBI IDENTITY'

if ($badgeConsistent) {
    Write-Host ""
    Write-Host "VERDICT: Genie behaviour matches the 'Scope-only' security badge." -ForegroundColor Green
    Write-Host "         RLS + OLS are NOT enforced on the Genie path (shared PAT)." -ForegroundColor Green
    Write-Host "         Governance must live in Unity Catalog row filters + column masks." -ForegroundColor Green
    exit 0
} else {
    Write-Host ""
    Write-Host "VERDICT: Behaviour diverged from the security badge." -ForegroundColor Yellow
    Write-Host "         Review results above; the badge or the auth path may need updating." -ForegroundColor Yellow
    exit 1
}
