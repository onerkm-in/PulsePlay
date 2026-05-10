function Poll-Genie {
    param($conversationId, $messageId, $profile = 'default')
    $url = "http://localhost:8787/assistant/conversations/$conversationId/messages/$messageId?profile=$profile"
    for ($i = 0; $i -lt 40; $i++) {
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

$results = @()

# TEST 1
Write-Host "Running TEST 1..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t1 = Invoke-RestMethod http://localhost:8787/health
    $sw.Stop()
    $pass = ($t1.ok -eq $true -and $t1.profiles.Count -ge 2)
    $results += [PSCustomObject]@{Label="TEST 1"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t1 | ConvertTo-Json -Compress | Select-Object -First 120); Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 1"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# TEST 2
Write-Host "Running TEST 2..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t2 = Invoke-RestMethod "http://localhost:8787/warehouse/status?profile=default"
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 2"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t2 | ConvertTo-Json -Compress | Select-Object -First 120); Verdict="PASS"}
} catch {
    $results += [PSCustomObject]@{Label="TEST 2"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# TEST 3
Write-Host "Running TEST 3..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $body3 = @{profile='default'; content='Reply with exactly the word PING and nothing else.'; contextText=''} | ConvertTo-Json
    $start3 = Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body3
    $poll3 = Poll-Genie -conversationId $start3.conversationId -messageId $start3.messageId -profile 'default'
    $sw.Stop()
    $convId3 = $start3.conversationId
    $text3 = $poll3.body.attachments | Where-Object { $_.type -eq 'text' } | Select-Object -ExpandProperty text
    $pass = ($poll3.status -eq 'COMPLETED' -and $text3 -match "PING")
    $results += [PSCustomObject]@{Label="TEST 3"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll3.status; Content=$text3; Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 3"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

Write-Host "Sleeping 13s..."
Start-Sleep -Seconds 13

# TEST 4
Write-Host "Running TEST 4..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $body4 = @{profile='hse'; content='Reply with exactly the word PONG and nothing else.'; contextText=''} | ConvertTo-Json
    $start4 = Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body4
    $poll4 = Poll-Genie -conversationId $start4.conversationId -messageId $start4.messageId -profile 'hse'
    $sw.Stop()
    $text4 = $poll4.body.attachments | Where-Object { $_.type -eq 'text' } | Select-Object -ExpandProperty text
    $pass = ($poll4.status -eq 'COMPLETED' -and $text4 -match "PONG")
    $results += [PSCustomObject]@{Label="TEST 4"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll4.status; Content=$text4; Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 4"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

Write-Host "Sleeping 13s..."
Start-Sleep -Seconds 13

# TEST 5
Write-Host "Running TEST 5..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $body5 = @{profile='default'; content='Reply with exactly the word ECHO and nothing else.'; contextText=''} | ConvertTo-Json
    $start5 = Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/$convId3/messages" -ContentType 'application/json' -Body $body5
    $poll5 = Poll-Genie -conversationId $convId3 -messageId $start5.messageId -profile 'default'
    $sw.Stop()
    $text5 = $poll5.body.attachments | Where-Object { $_.type -eq 'text' } | Select-Object -ExpandProperty text
    $pass = ($poll5.status -eq 'COMPLETED' -and $text5 -match "ECHO")
    $results += [PSCustomObject]@{Label="TEST 5"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll5.status; Content=$text5; Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 5"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

Write-Host "Sleeping 13s..."
Start-Sleep -Seconds 13

# TEST 6
Write-Host "Running TEST 6..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $ctx6 = 'Context noise: margin = revenue - cost; ' * 190
    $body6_obj = @{profile='default'; content='Reply with just the word OK.'; contextText=$ctx6}
    $body6 = $body6_obj | ConvertTo-Json
    $byteCount6 = [System.Text.Encoding]::UTF8.GetByteCount($body6)
    $start6 = Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body6
    $poll6 = Poll-Genie -conversationId $start6.conversationId -messageId $start6.messageId -profile 'default'
    $sw.Stop()
    $text6 = $poll6.body.attachments | Where-Object { $_.type -eq 'text' } | Select-Object -ExpandProperty text
    $pass = ($poll6.status -eq 'COMPLETED' -and $text6 -match "OK")
    $results += [PSCustomObject]@{Label="TEST 6"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll6.status; Content="Bytes: $byteCount6; Response: $text6"; Verdict=if($pass){"PASS"}else{"FAIL"}}
    $GLOBALS_byteCount6 = $byteCount6
} catch {
    $results += [PSCustomObject]@{Label="TEST 6"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

Write-Host "Sleeping 13s..."
Start-Sleep -Seconds 13

# TEST 7
Write-Host "Running TEST 7..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $body7 = @{profile='default'; content='Reply with exactly the word DONE.'; contextText=''} | ConvertTo-Json
    $start7 = Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body7
    $poll7 = Poll-Genie -conversationId $start7.conversationId -messageId $start7.messageId -profile 'default'
    $sw.Stop()
    $text7 = $poll7.body.attachments | Where-Object { $_.type -eq 'text' } | Select-Object -ExpandProperty text
    $pass = ($poll7.status -eq 'COMPLETED' -and $text7 -match "DONE")
    $results += [PSCustomObject]@{Label="TEST 7"; Latency=$sw.Elapsed.TotalSeconds; Status=$poll7.status; Content=$text7; Verdict=if($pass){"PASS"}else{"FAIL"}}
} catch {
    $results += [PSCustomObject]@{Label="TEST 7"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

Write-Host "Sleeping 13s..."
Start-Sleep -Seconds 13

# TEST 8
Write-Host "Running TEST 8..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $huge = 'x' * 5242880
    $body8 = @{profile='default'; content='ignore'; contextText=$huge} | ConvertTo-Json
    Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body8
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 8"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content="Unexpectedly accepted large body"; Verdict="FAIL"}
} catch {
    $sw.Stop()
    $statusCode = $_.Exception.Response.StatusCode.value__
    $pass = ($statusCode -eq 413)
    $results += [PSCustomObject]@{Label="TEST 8"; Latency=$sw.Elapsed.TotalSeconds; Status=$statusCode; Content=$_.Exception.Message; Verdict=if($pass){"PASS"}else{"FAIL"}}
}

# TEST 9
Write-Host "Running TEST 9..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $body9 = @{profile='nonexistent'; content='hi'} | ConvertTo-Json
    Invoke-RestMethod -Method POST -Uri "http://localhost:8787/assistant/conversations/start" -ContentType 'application/json' -Body $body9
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 9"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content="Accepted invalid profile"; Verdict="FAIL"}
} catch {
    $sw.Stop()
    $statusCode = $_.Exception.Response.StatusCode.value__
    $pass = ($statusCode -eq 400)
    $results += [PSCustomObject]@{Label="TEST 9"; Latency=$sw.Elapsed.TotalSeconds; Status=$statusCode; Content=$_.Exception.Message; Verdict=if($pass){"PASS"}else{"FAIL"}}
}

# TEST 10
Write-Host "Running TEST 10..."
$sw = [diagnostics.stopwatch]::StartNew()
try {
    $t10 = Invoke-RestMethod "http://localhost:8787/assistant/capabilities?profile=default"
    $sw.Stop()
    $results += [PSCustomObject]@{Label="TEST 10"; Latency=$sw.Elapsed.TotalSeconds; Status="200"; Content=($t10 | ConvertTo-Json -Compress | Select-Object -First 120); Verdict="PASS"}
} catch {
    $results += [PSCustomObject]@{Label="TEST 10"; Latency=$sw.Elapsed.TotalSeconds; Status="ERR"; Content=$_.Exception.Message; Verdict="FAIL"}
}

# Output Results
$passedCount = ($results | Where-Object { $_.Verdict -eq "PASS" }).Count
Write-Host ""
Write-Host "| Label | Latency (s) | Status | Content (Truncated) | Verdict |"
Write-Host "|-------|-------------|--------|----------------------|---------|"
foreach ($r in $results) {
    $content = $r.Content -replace "\n", " " -replace "\|", " "
    if ($content.Length -gt 120) { $content = $content.Substring(0, 117) + "..." }
    Write-Host "| $($r.Label) | $($r.Latency.ToString('F2')) | $($r.Status) | $content | $($r.Verdict) |"
}
Write-Host ""
Write-Host "$passedCount/10 PASS"
Write-Host "Test 6 Request Body Size: $GLOBALS_byteCount6 bytes"
