param(
    [string]$TaskName = "LeetCode Revision"
)

$ErrorActionPreference = "Stop"

$removed = $false

& schtasks.exe /Query /TN $TaskName | Out-Null
if ($LASTEXITCODE -eq 0) {
    & schtasks.exe /Delete /TN $TaskName /F | Out-Host
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to remove scheduled task '$TaskName'."
    }
    $removed = $true
}

$startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "$TaskName.lnk"
if (Test-Path -LiteralPath $startupShortcut) {
    Remove-Item -LiteralPath $startupShortcut -Force
    $removed = $true
}

if ($removed) {
    Write-Host "Removed startup entry '$TaskName'."
} else {
    Write-Host "Startup entry '$TaskName' is not installed."
}
