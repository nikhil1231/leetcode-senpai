#!/usr/bin/env bash
# Writes today's Ripple After Dark script with Claude Code (Nikhil's subscription), then hands it to the
# app to voice and keep. If Claude Code fails or its script is rejected, the app writes the script itself
# with its fallback model. Run by hand (systemctl --user start leetcode-senpai-podcast.service); safe to run again (a made episode is kept).
#
#   deploy/podcast-writer.sh            today
#   deploy/podcast-writer.sh 2026-11-13 a given day
set -uo pipefail

CONTAINER="${PODCAST_CONTAINER:-leetcode-senpai}"
CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
MODEL="${PODCAST_CLAUDE_MODEL:-opus}"
day_args=()
[ $# -ge 1 ] && day_args=(--day "$1")

say() { printf '[podcast] %s\n' "$*"; }
app() { docker exec -i -w "${PODCAST_APP_DIR:-/app}" "$CONTAINER" python -m server.podcast_drama "$@"; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

app brief "${day_args[@]}" > "$work/brief.json" || { say "could not get the brief"; exit 1; }
read -r status day < <(python3 -c 'import json,sys; b=json.load(open(sys.argv[1])); print(b["status"], b["day"])' "$work/brief.json")
case "$status" in
    done) say "$day already has an episode"; exit 0 ;;
    nothing) say "nothing to make an episode about yet"; exit 0 ;;
esac
python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["prompt"])' "$work/brief.json" > "$work/prompt.md"

# A plain writing job: no tools, no MCP servers, nothing kept, run outside any project.
say "writing $day with Claude Code ($MODEL)"
if (cd "$work" && timeout 900 "$CLAUDE" -p --model "$MODEL" --tools "" --strict-mcp-config \
        --no-session-persistence --output-format text < prompt.md > script.txt 2> claude.err) \
        && [ -s "$work/script.txt" ]; then
    if app submit --day "$day" --writer "claude-code:$MODEL" < "$work/script.txt"; then
        say "voiced and saved"
        exit 0
    fi
    say "the app rejected Claude Code's script; falling back"
else
    say "Claude Code failed: $(tail -c 300 "$work/claude.err" 2>/dev/null)"
fi

say "writing $day with the app's fallback model"
app ensure --day "$day"
