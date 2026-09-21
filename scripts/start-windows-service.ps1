$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$uv = (Get-Command uv -ErrorAction SilentlyContinue).Source
$logDir = Join-Path $repoRoot "logs"
$stdoutLog = Join-Path $logDir "leetcode-revision.stdout.log"
$stderrLog = Join-Path $logDir "leetcode-revision.stderr.log"

if (-not $uv) {
    throw "uv was not found on PATH. Install uv, then run: uv sync --locked"
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

$command = "`"$uv`" run --locked --no-dev run.py >> `"$stdoutLog`" 2>> `"$stderrLog`""
& cmd.exe /d /c $command
exit $LASTEXITCODE
