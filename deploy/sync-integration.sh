#!/usr/bin/env bash
# Keep the leetcode-senpai testing checkout pinned to the head of the
# integration branch. That branch is the cumulative "Testing" stack, rebuilt
# locally by ticket-runner in the main leetcode repo
# (~/Documents/Programming/Learning/leetcode), which is the testing checkout's
# git `origin` -- so we sync from origin, not GitHub.
#
# Default: fetch + hard-reset the checkout to the integration head and sync
# dependencies from uv.lock. With --restart, also restart the LAN
# service, but only when the head actually moved. Used both as the service's
# ExecStartPre (no --restart, so a manual/boot start lands on head) and by the
# sync timer (--restart, to pick up new deploys automatically).
#
# This script is served from within the testing checkout at deploy/, so a
# `git reset --hard` restores it rather than losing it.
set -euo pipefail

repo="$HOME/Documents/Programming/Learning/leetcode-testing"
branch="integration/leetcode-senpai"
service="leetcode-senpai-testing.service"
cd "$repo"

before="$(git rev-parse HEAD)"
git fetch --quiet origin "$branch"
target="$(git rev-parse FETCH_HEAD)"

if [ "$before" != "$target" ]; then
  git reset --hard --quiet "$target"
fi

# Also retry a failed dependency sync when the checkout is already up to date.
"$HOME/.local/bin/uv" sync --locked --no-dev --quiet

if [ "$before" = "$target" ]; then
  exit 0
fi

if [ "${1:-}" = "--restart" ]; then
  systemctl --user restart "$service"
fi
