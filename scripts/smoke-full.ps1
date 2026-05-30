# smoke-full.ps1 - PulsePlay live-proxy Genie roundtrip smoke.
#
# Speaks the current PulsePlay proxy contract:
#   * query/body param            assistantProfile (camelCase)
#   * response start envelope     conversation_id / message_id (snake_case)
#
# Pre-requisites
#   * proxy running on 127.0.0.1:8787 with at least one Databricks-Genie
#     profile reachable (default name: "default"). To test a second profile
#     in the same run, pass -Profiles default,sales (etc.).
#
# Out of scope
#   * Visual / adapter unit smoke - run `node playground/scripts/shell-smoke-proxy.mjs`
#     instead. That is the modern shell smoke that asserts AI -> attested
#     envelope -> native canvas paint end-to-end with a real Chromium.
#
# Exit code 0 if every assertion passes; 1 if any FAIL.

[CmdletBinding()]
param(
    [string[]]$Profiles = @('default'),
    [string]$ProxyBase  = 'http://127.0.0.1:8787',
    [int]$PollSeconds   = 180
)

$ErrorActionPreference = 'Stop'
$results = @()

function Add-Result {
    param($label, $latency, $status, $detail, $verdict)
    $clean = ($detail -replace "`r?`n", " " | Out-String).Trim()
    if ($clean.Length -gt 140) { $clean = $clean.Substring(0, 140) }
    $script:results += [pscustomobject]@{
        Label   = $label
        Latency = $latency
        Status  = $status
        Detail  = $clean
        Verdict = $verdict
    }
}

function Poll {
    param($convId, $msgId, $profile, $maxSeconds = 120)
    $u = "$ProxyBase/assistant/conversations/$convId/messages/${msgId}?assistantProfile=$profile"
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

function Extract-Text {
    param($msg)
    if ($null -eq $msg) { return "(null)" }
    $txt = $msg.content
    if ([string]::IsNullOrWhiteSpace($txt) -and $msg.attachments) {
        foreach ($a in $msg.attachments) {
            if ($a.text -and $a.text.content) { $txt = $a.text.content; break }
            if ($a.query -and $a.query.description) { $txt = $a.query.description; break }
        }
    }
    return $txt
}

function Is-RelevantCompleted {
    param($msg, $txt)
    if ($null -eq $msg -or $msg.status -ne 'COMPLETED') { return $false }
    if ([string]::IsNullOrWhiteSpace($txt)) { return $false }
    return ($txt -notmatch '(?i)\birrelevant\b')
}

$primary   = $Profiles[0]
$secondary = if ($Profiles.Count -ge 2) { $Profiles[1] } else { $null }

# T1 health
$t = Get-Date
$h = Invoke-RestMethod "$ProxyBase/health" -TimeoutSec 5
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$hasPrimary = $h.profiles -contains $primary
$hasSecondary = ($null -eq $secondary) -or ($h.profiles -contains $secondary)
$pass = ($h.ok -eq $true -and $hasPrimary -and $hasSecondary)
Add-Result 'T1 health' $lat 200 (($h | ConvertTo-Json -Compress)) ($(if ($pass) {'PASS'} else {'FAIL'}))
if (-not $pass) {
    Write-Host "FATAL: proxy is missing one of the requested profiles ($($Profiles -join ', '))" -ForegroundColor Red
}

# T2 warehouse status (primary profile)
$t = Get-Date
$w = Invoke-RestMethod "$ProxyBase/warehouse/status?assistantProfile=$primary" -TimeoutSec 15
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
Add-Result "T2 warehouse/$primary" $lat 200 (($w | ConvertTo-Json -Compress)) 'PASS'

# T3 primary roundtrip
Start-Sleep 2
$t = Get-Date
$body = (@{ assistantProfile = $primary; content = 'What are total sales by category? Return a short answer.'; contextText = '' } | ConvertTo-Json -Compress)
$s = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id $primary $PollSeconds
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$convPrimary = $s.conversation_id
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result "T3 $primary new-conv sales question" $lat $r.status $txt $verdict

# T4 continue turn on primary conversation
Start-Sleep 15
$t = Get-Date
$body = (@{ assistantProfile = $primary; content = 'Which region has the highest sales? Return a short answer.'; contextText = '' } | ConvertTo-Json -Compress)
$s = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/$convPrimary/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id $primary $PollSeconds
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result "T4 $primary continue sales question" $lat $r.status $txt $verdict

# T5 secondary-profile roundtrip (only if a second profile was supplied)
if ($null -ne $secondary) {
    Start-Sleep 15
    $t = Get-Date
    $body = (@{ assistantProfile = $secondary; content = 'Show total_sales by region. Return a short answer.'; contextText = '' } | ConvertTo-Json -Compress)
    $s = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
    $r = Poll $s.conversation_id $s.message_id $secondary $PollSeconds
    $lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
    $txt = Extract-Text $r
    $verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
    Add-Result "T5 $secondary new-conv region question" $lat $r.status $txt $verdict
} else {
    Add-Result 'T5 second-profile roundtrip' 0 'SKIP' 'no second profile passed via -Profiles' 'SKIP'
}

# T6 large body near cap (primary profile)
Start-Sleep 15
$t = Get-Date
$ctx = ('Context noise: margin = revenue - cost; ' * 190)  # ~7600 chars
$body = @{ assistantProfile = $primary; content = 'What are total sales? Return a short answer.'; contextText = $ctx } | ConvertTo-Json -Compress
$bodySize = [System.Text.Encoding]::UTF8.GetByteCount($body)
$s = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id $primary $PollSeconds
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result "T6 large body ($bodySize B)" $lat $r.status $txt $verdict

# T7 oversized body - expect 413
$t = Get-Date
$huge = 'x' * 5242880
$body = @{ assistantProfile = $primary; content = 'ignore'; contextText = $huge } | ConvertTo-Json -Compress
$code = 0; $msg = ''
try {
    Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
    $msg = 'unexpected success'
} catch {
    $code = [int]$_.Exception.Response.StatusCode
    $msg = $_.Exception.Message
}
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$verdict = if ($code -eq 413) { 'PASS' } else { 'FAIL' }
Add-Result 'T7 5MB body 413' $lat $code $msg $verdict

# T8 invalid profile
$t = Get-Date
$body = '{"assistantProfile":"nonexistent","content":"hi","contextText":""}'
$code = 0; $msg = ''
try {
    Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 10 | Out-Null
} catch {
    $code = [int]$_.Exception.Response.StatusCode
    $msg = $_.Exception.Message
}
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$verdict = if ($code -eq 400) { 'PASS' } else { 'FAIL' }
Add-Result 'T8 bad profile 400' $lat $code $msg $verdict

# T9 capabilities
$t = Get-Date
$c = Invoke-RestMethod "$ProxyBase/assistant/capabilities?assistantProfile=$primary" -TimeoutSec 10
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
Add-Result 'T9 capabilities' $lat 200 (($c | ConvertTo-Json -Compress)) 'PASS'

# T10 primary 2-turn relevant continuation (conversationMap routing stickiness)
Start-Sleep 15
$t = Get-Date
$body = (@{ assistantProfile = $primary; content = 'What are total sales by segment? Return a short answer.'; contextText = '' } | ConvertTo-Json -Compress)
$s = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r1 = Poll $s.conversation_id $s.message_id $primary $PollSeconds
$convSales = $s.conversation_id
Start-Sleep 15
$body = (@{ assistantProfile = $primary; content = 'Continue from the prior answer: which segment is highest? Return a short answer.'; contextText = '' } | ConvertTo-Json -Compress)
$s2 = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/$convSales/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r2 = Poll $s2.conversation_id $s2.message_id $primary $PollSeconds
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt1 = Extract-Text $r1
$txt2 = Extract-Text $r2
$verdict = if ((Is-RelevantCompleted $r1 $txt1) -and (Is-RelevantCompleted $r2 $txt2)) { 'PASS' } else { 'FAIL' }
Add-Result "T10 $primary 2-turn relevant continuation" $lat "$($r1.status)/$($r2.status)" "t1=$txt1 | t2=$txt2" $verdict

# Summary
Write-Host ""
Write-Host "=== SMOKE TEST SUMMARY ==="
$results | Format-Table -AutoSize Label, Latency, Status, Verdict, Detail
$pass = ($results | Where-Object Verdict -eq 'PASS').Count
$fail = ($results | Where-Object Verdict -eq 'FAIL').Count
$skip = ($results | Where-Object Verdict -eq 'SKIP').Count
Write-Host ""
Write-Host ("RESULT: {0}/{1} PASS ({2} SKIP)" -f $pass, ($pass + $fail), $skip)
if ($fail -gt 0) { exit 1 }
