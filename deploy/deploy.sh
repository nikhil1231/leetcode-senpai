#!/usr/bin/env bash
# Deploy leetcode.nikhil.ing from a dev machine: run deploy/update.sh on the
# laptop over ssh.
#
#     deploy/deploy.sh            # deploy origin/main
#     deploy/deploy.sh --check    # dry run: say what would happen
#     deploy/deploy.sh --force    # reinstall + restart even if already at head
#
# Push first — this deploys what GitHub has, not what is on your disk.
#
# The box is reached by trying several addresses in order, because Tailscale is
# the usual route but not a dependency: if the tailnet is down and you are on
# the house LAN, the mDNS name still gets there. Override the whole list with
# LEETCODE_HOST=... to force one.
set -euo pipefail

SSH_USER="${LEETCODE_SSH_USER:-nikhil}"
REMOTE_DIR="${LEETCODE_REMOTE_DIR:-Documents/Programming/Learning/leetcode}"

if [ -n "${LEETCODE_HOST:-}" ]; then
    CANDIDATES=("$LEETCODE_HOST")
else
    CANDIDATES=(
        100.112.203.91                           # Tailscale address, from anywhere on the tailnet
        nikhil-hp-pavilion                       # MagicDNS, when the search domain is set
        nikhil-hp-pavilion.tail1360ba.ts.net     # ...spelled out
        nikhil-hp-pavilion.local                 # mDNS, same LAN, no tailnet needed
    )
fi

host=""
for candidate in "${CANDIDATES[@]}"; do
    printf 'trying %s... ' "$candidate"
    if ssh -o ConnectTimeout=4 -o BatchMode=yes -o StrictHostKeyChecking=accept-new \
           "$SSH_USER@$candidate" true 2>/dev/null; then
        echo "ok"
        host="$candidate"
        break
    fi
    echo "no"
done

if [ -z "$host" ]; then
    echo >&2
    echo "Could not reach the box at any of: ${CANDIDATES[*]}" >&2
    echo "Check \`tailscale status\`, or set LEETCODE_HOST=<addr> to force one." >&2
    exit 1
fi

# -t so the deploy's progress and colours arrive as it goes rather than in one
# lump at the end, and so Ctrl-C reaches the remote script.
exec ssh -t "$SSH_USER@$host" "$REMOTE_DIR/deploy/update.sh $*"
