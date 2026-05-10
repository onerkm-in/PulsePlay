param(
    [string]$AppName = "test-superuser-genie-powerbi",
    [string]$WorkspacePath = "/Workspace/Users/onerkm@gmail.com/databricks_apps/test-superuser-genie-powerbi",
    [switch]$Deploy,
    [switch]$WorkspaceSource
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

if (-not $WorkspaceSource) {
    Push-Location $repoRoot
    try {
        databricks bundle validate --target dev
        if ($LASTEXITCODE -ne 0) {
            throw "Bundle validation failed"
        }
        databricks bundle deploy --target dev
        if ($LASTEXITCODE -ne 0) {
            throw "Bundle deploy failed"
        }
        if ($Deploy) {
            databricks bundle run test_superuser_genie_powerbi --target dev
        }
    } finally {
        Pop-Location
    }
    return
}

$proxyRoot = Join-Path $repoRoot "proxy"
$stageRoot = Join-Path $repoRoot ".databricks-app-build"
$stagePath = Join-Path $stageRoot $AppName

$resolvedStageRoot = [System.IO.Path]::GetFullPath($stageRoot)
$resolvedStagePath = [System.IO.Path]::GetFullPath($stagePath)
if (-not $resolvedStagePath.StartsWith($resolvedStageRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to stage outside $resolvedStageRoot"
}

if (Test-Path -LiteralPath $stagePath) {
    Remove-Item -LiteralPath $stagePath -Recurse -Force
}
New-Item -ItemType Directory -Path $stagePath | Out-Null

$files = @(
    "server.js",
    "package.json",
    "package-lock.json",
    "app.yaml",
    "README.databricks-app.md"
)

foreach ($file in $files) {
    Copy-Item -LiteralPath (Join-Path $proxyRoot $file) -Destination (Join-Path $stagePath $file)
}

Write-Host "Staged Databricks App source at $stagePath"
Write-Host "Uploading source to $WorkspacePath"
databricks workspace mkdirs $WorkspacePath
databricks workspace import-dir $stagePath $WorkspacePath --overwrite

$appExists = $true
databricks apps get $AppName --output json *> $null
if ($LASTEXITCODE -ne 0) {
    $appExists = $false
}

if (-not $appExists) {
    Write-Host "Creating Databricks app $AppName without starting compute"
    databricks apps create $AppName `
        --description "test_SuperUser Genie for Power BI proxy hosted on Databricks Apps" `
        --no-compute
} else {
    Write-Host "Databricks app $AppName already exists"
}

if ($Deploy) {
    Write-Host "Deploying $AppName from $WorkspacePath"
    databricks apps deploy $AppName --source-code-path $WorkspacePath --mode SNAPSHOT
} else {
    Write-Host "Source uploaded and app exists. Re-run with -Deploy to start a deployment."
}
