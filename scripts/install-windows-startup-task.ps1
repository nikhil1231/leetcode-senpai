param(
    [string]$TaskName = "Leetcode Senpai",
    [switch]$AtStartup
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$startScript = Join-Path $repoRoot "scripts\start-windows-service.ps1"

if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Start script was not found at $startScript"
}

$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
$schedule = if ($AtStartup) { "ONSTART" } else { "ONLOGON" }

& schtasks.exe /Create /TN $TaskName /TR $taskRun /SC $schedule /F | Out-Host
if ($LASTEXITCODE -ne 0) {
    if ($AtStartup) {
        throw "Failed to create scheduled task '$TaskName'. Try running PowerShell as Administrator."
    }

    Write-Host "Scheduled task creation failed; installing a Startup folder shortcut instead."
    $startupDir = [Environment]::GetFolderPath("Startup")
    $shortcutPath = Join-Path $startupDir "$TaskName.lnk"
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "powershell.exe"
    $shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`""
    $shortcut.WorkingDirectory = $repoRoot
    $shortcut.WindowStyle = 7
    $shortcut.Description = "Starts the Leetcode Senpai local FastAPI service."
    $shortcut.Save()

    Start-Process `
        -FilePath "powershell.exe" `
        -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $startScript) `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden

    Write-Host "Installed and started Startup shortcut '$shortcutPath'."
    Write-Host "Open http://127.0.0.1:8000 after a few seconds."
    exit 0
}

& schtasks.exe /Run /TN $TaskName | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Created scheduled task '$TaskName', but failed to start it."
}

Write-Host "Installed and started scheduled task '$TaskName'."
Write-Host "Open http://127.0.0.1:8000 after a few seconds."
