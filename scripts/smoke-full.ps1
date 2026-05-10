# Corrected full smoke test: uses assistantProfile (camelCase) as the proxy expects
$ErrorActionPreference = 'Stop'
$results = @()

function Add-Result { param($label, $latency, $status, $detail, $verdict)
    $script:results += [pscustomobject]@{
        Label = $label
        Latency = $latency
        Status = $status
        Detail = ($detail -replace "`r?`n", " " | Out-String).Trim().Substring(0, [Math]::Min(140, ($detail -replace "`r?`n", " ").Length))
        Verdict = $verdict
    }
}

function Poll { param($convId, $msgId, $profile, $maxSeconds = 120)
    $u = "http://127.0.0.1:8787/assistant/conversations/$convId/messages/${msgId}?assistantProfile=$profile"
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

function Extract-Text { param($msg)
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

function Is-RelevantCompleted { param($msg, $txt)
    if ($null -eq $msg -or $msg.status -ne 'COMPLETED') { return $false }
    if ([string]::IsNullOrWhiteSpace($txt)) { return $false }
    return ($txt -notmatch '(?i)\birrelevant\b')
}

# T1 health
$t = Get-Date
$h = Invoke-RestMethod http://127.0.0.1:8787/health -TimeoutSec 5
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$pass = ($h.ok -eq $true -and $h.profiles -contains 'default' -and $h.profiles -contains 'hse')
Add-Result 'T1 health' $lat 200 (($h | ConvertTo-Json -Compress)) ($(if ($pass) {'PASS'} else {'FAIL'}))

# T2 warehouse status
$t = Get-Date
$w = Invoke-RestMethod "http://127.0.0.1:8787/warehouse/status?assistantProfile=default" -TimeoutSec 15
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
Add-Result 'T2 warehouse/default' $lat 200 (($w | ConvertTo-Json -Compress)) 'PASS'

# T3 default roundtrip
Start-Sleep 2
$t = Get-Date
$body = '{"assistantProfile":"default","content":"What are total sales by category? Return a short answer.","contextText":""}'
$s = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 'default' 120
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$convDef = $s.conversation_id
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result 'T3 default new-conv sales question' $lat $r.status $txt $verdict

# T4 continue turn on default conversation
Start-Sleep 15
$t = Get-Date
$body = '{"assistantProfile":"default","content":"Which region has the highest sales? Return a short answer.","contextText":""}'
$s = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/$convDef/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 'default' 120
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result 'T4 default continue sales question' $lat $r.status $txt $verdict

# T5 hse roundtrip
Start-Sleep 15
$t = Get-Date
$body = '{"assistantProfile":"hse","content":"Show total_sales by region. Return a short answer.","contextText":""}'
$s = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 'hse' 180
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result 'T5 hse new-conv region question' $lat $r.status $txt $verdict

# T6 large body near cap
Start-Sleep 15
$t = Get-Date
$ctx = ('Context noise: margin = revenue - cost; ' * 190)  # ~7600 chars
$body = @{ assistantProfile='default'; content='What are total sales? Return a short answer.'; contextText=$ctx } | ConvertTo-Json -Compress
$bodySize = [System.Text.Encoding]::UTF8.GetByteCount($body)
$s = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r = Poll $s.conversation_id $s.message_id 'default' 120
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt = Extract-Text $r
$verdict = if (Is-RelevantCompleted $r $txt) { 'PASS' } else { 'FAIL' }
Add-Result "T6 large body ($bodySize B)" $lat $r.status $txt $verdict

# T7 oversized body - expect 413
$t = Get-Date
$huge = 'x' * 5242880
$body = @{ assistantProfile='default'; content='ignore'; contextText=$huge } | ConvertTo-Json -Compress
$code = 0; $msg = ''
try {
    Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
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
    Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 10 | Out-Null
} catch {
    $code = [int]$_.Exception.Response.StatusCode
    $msg = $_.Exception.Message
}
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$verdict = if ($code -eq 400) { 'PASS' } else { 'FAIL' }
Add-Result 'T8 bad profile 400' $lat $code $msg $verdict

# T9 capabilities
$t = Get-Date
$c = Invoke-RestMethod "http://127.0.0.1:8787/assistant/capabilities?assistantProfile=default" -TimeoutSec 10
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
Add-Result 'T9 capabilities' $lat 200 (($c | ConvertTo-Json -Compress)) 'PASS'

# T10 default continue turn (checks conversationMap routing stickiness)
Start-Sleep 15
$t = Get-Date
$convSales = $null
$body = '{"assistantProfile":"default","content":"What are total sales by segment? Return a short answer.","contextText":""}'
$s = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r1 = Poll $s.conversation_id $s.message_id 'default' 180
$convSales = $s.conversation_id
Start-Sleep 15
$body = '{"assistantProfile":"default","content":"Continue from the prior answer: which segment is highest? Return a short answer.","contextText":""}'
$s2 = Invoke-RestMethod -Method POST -Uri "http://127.0.0.1:8787/assistant/conversations/$convSales/messages" -ContentType 'application/json' -Body $body -TimeoutSec 60
$r2 = Poll $s2.conversation_id $s2.message_id 'default' 180
$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
$txt1 = Extract-Text $r1
$txt2 = Extract-Text $r2
$verdict = if ((Is-RelevantCompleted $r1 $txt1) -and (Is-RelevantCompleted $r2 $txt2)) { 'PASS' } else { 'FAIL' }
Add-Result 'T10 default 2-turn relevant continuation' $lat "$($r1.status)/$($r2.status)" "t1=$txt1 | t2=$txt2" $verdict

# T11 IDEA-039 Phase 1 — AI Insights observability hurdle.
# Three checks gated as one smoke step:
#   (a) `composeInsightsSettingsFingerprint` is exported from insightsCache.ts.
#   (b) `InsightsStageTrace` interface is declared and exported from visual.tsx.
#   (c) The cache-key parity vitest suite (IDEA-039) passes — proves changing
#       `domainGuidance` / `genieFields` / `sendContextToGenie` / `host` /
#       `apiBaseUrl` independently busts the cache key.
$t = Get-Date
$visualRoot = Join-Path (Split-Path $PSScriptRoot -Parent) 'genieChatVisual'
$detailParts = @()
$verdict = 'PASS'

# (a) helper export check
$cacheSrc = Get-Content (Join-Path $visualRoot 'src/insightsCache.ts') -Raw
if ($cacheSrc -notmatch 'export function composeInsightsSettingsFingerprint') {
    $verdict = 'FAIL'; $detailParts += 'composeInsightsSettingsFingerprint missing'
} else { $detailParts += 'fp-helper:ok' }

# (b) trace interface check
$visualSrc = Get-Content (Join-Path $visualRoot 'src/visual.tsx') -Raw
if ($visualSrc -notmatch 'export interface InsightsStageTrace') {
    $verdict = 'FAIL'; $detailParts += 'InsightsStageTrace missing'
} else { $detailParts += 'trace-iface:ok' }
if ($visualSrc -notmatch 'stageTraces\?: InsightsStageTrace\[\]') {
    $verdict = 'FAIL'; $detailParts += 'ChatMessageViewModel.stageTraces missing'
} else { $detailParts += 'viewmodel-field:ok' }

# (c) parity vitest must pass
Push-Location $visualRoot
try {
    $vitestOut = & npx --no-install vitest run tests/insightsCache.test.ts -t 'IDEA-039 parity' 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        $verdict = 'FAIL'; $detailParts += 'vitest IDEA-039 parity suite failed'
    } else {
        $detailParts += 'vitest:ok'
    }
} finally { Pop-Location }

$lat = [Math]::Round(((Get-Date) - $t).TotalSeconds, 2)
Add-Result 'T11 IDEA-039 observability hurdle' $lat 200 ($detailParts -join '; ') $verdict

# Summary
Write-Host ""
Write-Host "=== SMOKE TEST SUMMARY ==="
$results | Format-Table -AutoSize Label, Latency, Status, Verdict, Detail
$pass = ($results | Where-Object Verdict -eq 'PASS').Count
$fail = ($results | Where-Object Verdict -eq 'FAIL').Count
Write-Host ""
Write-Host ("RESULT: {0}/{1} PASS" -f $pass, ($pass + $fail))
if ($fail -gt 0) { exit 1 }
