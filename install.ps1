# Install opencode-agent-memory-tools (global OpenCode plugin)
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Invoke-NodeScript([string]$ScriptPath) {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        & node $ScriptPath
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        return
    }
    Write-Host "Node.js is required." -ForegroundColor Red
    exit 1
}

Write-Host "opencode-agent-memory-tools installer" -ForegroundColor Cyan
Invoke-NodeScript "$PSScriptRoot\scripts\install-global.mjs"
Write-Host "`nDone! Restart OpenCode." -ForegroundColor Green
Write-Host 'Verify: opencode run "call memoryList and show the result"' -ForegroundColor White