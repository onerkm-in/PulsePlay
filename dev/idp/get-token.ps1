# Mint a dev access token from the local Keycloak realm.
#
#   .\dev\idp\get-token.ps1 planner
#   .\dev\idp\get-token.ps1 manager -Decode
#
# Password grant against a public client. That is a shape you would never enable
# on a real IdP, and it is fine here for the same reason the admin password is
# "admin": this realm exists on loopback to exercise a code path, and holds
# nothing. Do not copy this client config into anything that matters.

param(
    [Parameter(Position = 0)]
    [ValidateSet('planner', 'manager', 'norole')]
    [string]$User = 'planner',

    [string]$BaseUrl = 'http://127.0.0.1:7010',

    # Print the decoded payload so you can see the claims the proxy will read.
    [switch]$Decode
)

$ErrorActionPreference = 'Stop'

$body = @{
    grant_type = 'password'
    client_id  = 'pulseplay-proxy'
    username   = $User
    password   = $User
}

try {
    $resp = Invoke-RestMethod -Method Post -Uri "$BaseUrl/realms/pulseplay/protocol/openid-connect/token" -Body $body
} catch {
    Write-Error "Token request failed. Is the IdP up? (docker compose -f dev/idp/docker-compose.yml up -d)`n$_"
    exit 1
}

if ($Decode) {
    $payload = $resp.access_token.Split('.')[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) { 2 { $payload += '==' } 3 { $payload += '=' } }
    $claims = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json

    Write-Host "`nClaims the proxy will read:" -ForegroundColor Cyan
    Write-Host ("  sub    : " + $claims.sub)
    Write-Host ("  iss    : " + $claims.iss)
    Write-Host ("  aud    : " + ($claims.aud -join ', '))
    Write-Host ("  roles  : " + ($claims.roles -join ', '))
    Write-Host ("  email  : " + $claims.email)
    Write-Host ""
}

# Bare token on stdout so it pipes:  $t = .\dev\idp\get-token.ps1 manager
$resp.access_token
