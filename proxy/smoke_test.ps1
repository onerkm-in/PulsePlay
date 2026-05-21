# proxy/smoke_test.ps1 - PulsePlay proxy quick smoke (dev-loop scale).
#
# Speaks the current PulsePlay proxy contract:
#   * body / query param          assistantProfile (camelCase)
#   * response start envelope     conversation_id / message_id (snake_case)
#
# Pre-requisites
#   * proxy running on 127.0.0.1:8787
#   * at least one Databricks-Genie profile reachable (default name: "default")
#
# For the wider battery (large body / 413 / bad profile / capabilities /
# 2-turn continuation) run `scripts\smoke-full.ps1` from the repo root.
# For end-to-end shell + browser proof use `node playground/scripts/shell-smoke-proxy.mjs`.
#
# Exit code 0 if every assertion passes; 1 if any FAIL.

[CmdletBinding()]
param(
    [string]$ProxyBase  = 'http://127.0.0.1:8787',
    [string]$Profile    = 'default',
    [int]$PollSeconds   = 80
)

$ErrorActionPreference = 'Stop'
$results = @()

function Poll-Genie {
    param($conversationId, $messageId, $profile, $maxSeconds = 80)
    $url = "$ProxyBase/assistant/conversations/$conversationId/messages/${messageId}?assistantProfile=$profile"
    $deadline = (Get-Date).AddSeconds($maxSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-RestMethod -Uri $url -TimeoutSec 30
            $status = $r.status
            if ($status -eq 'COMPLETED' -or $status -eq 'FAILED' -or $status -eq 'CANCELLED') {
                return @{ status = $status; body = $r }
            }
        } catch { Write-Host "poll err: $_" }
        Start-Sleep -Seconds 2
    }
    return @{ status = 'TIMEOUT'; body = $null }
}

function Extract-Text {
    param($msg)
    if ($null -eq $msg) { return '' }
    if ($msg.content) { return $msg.content }
    if ($msg.attachments) {
        foreach ($a in $msg.attachments) {
            if ($a.text -and $a.text.content) { return $a.text.content }
            if ($a.query -and $a.query.description) { return $a.query.description }
        }
    }
    return ''
}

# TEST 1: health
Write-Host "Running TEST 1 (health)..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t1 = Invoke-RestMethod "$ProxyBase/health"
    $sw.Stop()
    $pass = ($t1.ok -eq $true -and $t1.profiles -contains $Profile)
    $results += [PSCustomObject]@{Label="TEST 1 health"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t1 | ConvertTo-Json -Compress); Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 1 health"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# TEST 2: warehouse status
Write-Host "Running TEST 2 (warehouse status)..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t2 = Invoke-RestMethod "$ProxyBase/warehouse/status?assistantProfile=$Profile"
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 2 warehouse/$Profile"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t2 | ConvertTo-Json -Compress); Verdict="PASS"}
} catch {
    $results += [PSCustomObject]@{Label="TEST 2 warehouse/$Profile"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# TEST 3: PING roundtrip on primary profile
Write-Host "Running TEST 3 (PING roundtrip)..."
$sw = [diagnostics.stopwatch]::StartNew()
$convId3 = $null
try {
    $body3 = @{assistantProfile=$Profile; content='Reply with exactly the word PING and nothing else.'; contextText=''} | ConvertTo-Json
    $start3 = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/start" -ContentType 'application/json' -Body $body3
    $poll3 = Poll-Genie -conversationId $start3.conversation_id -messageId $start3.message_id -profile $Profile -maxSeconds $PollSeconds
    $sw.Stop()
    $convId3 = $start3.conversation_id
    $text3 = Extract-Text $poll3.body
    $pass = ($poll3.status -eq 'COMPLETED' -and $text3 -match 'PING')
    $results += [PSCustomObject]@{Label="TEST 3 PING"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll3.status; Content=$text3; Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 3 PING"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# TEST 4: continue turn on the same conversation
if ($convId3) {
    Write-Host "Sleeping 5s before continuing TEST 4..."
    Start-Sleep -Seconds 5
    Write-Host "Running TEST 4 (continue conv with ECHO)..."
    $sw = [diagnostics.stopwatch]::StartNew()
    try {
        $body4 = @{assistantProfile=$Profile; content='Reply with exactly the word ECHO and nothing else.'; contextText=''} | ConvertTo-Json
        $start4 = Invoke-RestMethod -Method POST -Uri "$ProxyBase/assistant/conversations/$convId3/messages" -ContentType 'application/json' -Body $body4
        $poll4 = Poll-Genie -conversationId $convId3 -messageId $start4.message_id -profile $Profile -maxSeconds $PollSeconds
        $sw.Stop()
        $text4 = Extract-Text $poll4.body
        $pass = ($poll4.status -eq 'COMPLETED' -and $text4 -match 'ECHO')
        $results += [PSCustomObject]@{Label="TEST 4 continue ECHO"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll4.status; Content=$text4; Verdict=if($pass){"PASS"}else{"FAIL"}}
    } catch {
        $results += [PSCustomObject]@{Label="TEST 4 continue ECHO"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
    }
} else {
    $results += [PSCustomObject]@{Label="TEST 4 continue ECHO"; Latency=0; Status="SKIP"; Content="no conversation id from TEST 3"; Verdict="SKIP"}
}

# TEST 5: capabilities
Write-Host "Running TEST 5 (capabilities)..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t5 = Invoke-RestMethod "$ProxyBase/assistant/capabilities?assistantProfile=$Profile"
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 5 capabilities"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t5 | ConvertTo-Json -Compress); Verdict="PASS"}
} catch {
    $results += [PSCustomObject]@{Label="TEST 5 capabilities"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# Output Results
$passedCount = ($results | Where-Object { $_.Verdict -eq "PASS" }).Count
$failedCount = ($results | Where-Object { $_.Verdict -eq "FAIL" }).Count
$skipCount   = ($results | Where-Object { $_.Verdict -eq "SKIP" }).Count
Write-Host ""
Write-Host "| Label | Latency (s) | Status | Content (Truncated) | Verdict |"
Write-Host "|-------|-------------|--------|----------------------|---------|"
foreach ($r in $results) {
    $content = $r.Content -replace "\n", " " -replace "\|", " "
    if ($content.Length -gt 120) { $content = $content.Substring(0, 117) + "..." }
    Write-Host "| $($r.Label) | $($r.Latency.ToString('F2')) | $($r.Status) | $content | $($r.Verdict) |"
}
Write-Host ""
Write-Host ("RESULT: {0}/{1} PASS ({2} SKIP)" -f $passedCount, ($passedCount + $failedCount), $skipCount)
if ($failedCount -gt 0) { exit 1 }
