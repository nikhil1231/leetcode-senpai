param(
    [string]$TaskName = "Leetcode Senpai"
)

$ErrorActionPreference = "Stop"

$removed = $false
$taskNames = @($TaskName)
if ($TaskName -eq "Leetcode Senpai") {
    $taskNames += "LeetCode Revision"
}

foreach ($name in $taskNames) {
    & schtasks.exe /Query /TN $name | Out-Null
    if ($LASTEXITCODE -eq 0) {
        & schtasks.exe /Delete /TN $name /F | Out-Host
        if ($LASTEXITCODE -ne 0) {
            throw "Failed to remove scheduled task '$name'."
        }
        $removed = $true
    }

    $startupShortcut = Join-Path ([Environment]::GetFolderPath("Startup")) "$name.lnk"
    if (Test-Path -LiteralPath $startupShortcut) {
        Remove-Item -LiteralPath $startupShortcut -Force
        $removed = $true
    }
}

if ($removed) {
    Write-Host "Removed startup entry '$TaskName'."
} else {
    Write-Host "Startup entry '$TaskName' is not installed."
}
