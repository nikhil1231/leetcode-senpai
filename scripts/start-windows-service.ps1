$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$python = Join-Path $repoRoot ".venv\Scripts\python.exe"
$logDir = Join-Path $repoRoot "logs"
$stdoutLog = Join-Path $logDir "leetcode-revision.stdout.log"
$stderrLog = Join-Path $logDir "leetcode-revision.stderr.log"

if (-not (Test-Path -LiteralPath $python)) {
    throw "Virtualenv Python was not found at $python. Create it with: python -m venv .venv"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
Set-Location $repoRoot

$env:UVICORN_RELOAD = "false"

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::AppendAllText(
    $stdoutLog,
    "$(Get-Date -Format o) starting Leetcode Senpai from $repoRoot`r`n",
    $utf8NoBom
)

$command = "`"$python`" run.py >> `"$stdoutLog`" 2>> `"$stderrLog`""
& cmd.exe /d /c $command
exit $LASTEXITCODE
