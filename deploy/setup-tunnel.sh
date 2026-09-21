#!/usr/bin/env bash
# Point a Cloudflare Tunnel at the local Leetcode Senpai server.
#
#     deploy/setup-tunnel.sh leetcode.example.com
#
# Everything here is idempotent — re-running after a hostname change or a failed
# attempt is fine. It does not create the Cloudflare account, the zone, or the
# Access policy: those are dashboard steps, and deploy/README.md lists them.
#
# Prerequisite: `cloudflared tunnel login` has been run once, which opens a
# browser, asks which zone to authorise, and leaves a certificate in
# ~/.cloudflared/cert.pem. Authorise the zone this hostname belongs to; a
# certificate issued for a different zone cannot create the DNS record.
#
# This writes its own config file and installs its own unit, so it never
# disturbs another project's tunnel on the same machine.
set -euo pipefail

HOSTNAME=${1:-}
TUNNEL_NAME=${TUNNEL_NAME:-leetcode-senpai}
LOCAL_PORT=${LOCAL_PORT:-8200}
CLOUDFLARED=${CLOUDFLARED:-$HOME/.local/bin/cloudflared}
CONFIG_DIR=$HOME/.cloudflared
CONFIG_FILE=$CONFIG_DIR/leetcode-senpai.yml
UNIT=cloudflared-leetcode.service

if [ -z "$HOSTNAME" ]; then
    echo "usage: $0 <hostname>   e.g. $0 leetcode.example.com" >&2
    exit 2
fi

if [ ! -x "$CLOUDFLARED" ]; then
    echo "cloudflared not found at $CLOUDFLARED" >&2
    exit 1
fi

if [ ! -f "$CONFIG_DIR/cert.pem" ]; then
    echo "Not logged in to Cloudflare yet. Run:" >&2
    echo "    $CLOUDFLARED tunnel login" >&2
    exit 1
fi

# Note the deleted_at test. A live tunnel does not omit the field or set it to
# null — it carries Go's zero time, "0001-01-01T00:00:00Z", which is a perfectly
# truthy string. Testing it for emptiness matches nothing at all, and the
# symptom is a config file with a blank tunnel id that cloudflared exits 255 on.
lookup_uuid() {
    "$CLOUDFLARED" tunnel list --output json | python3 -c "
import json, sys

name = sys.argv[1]
for t in json.load(sys.stdin):
    live = (t.get('deleted_at') or '').startswith('0001-01-01')
    if t.get('name') == name and live:
        print(t['id'])
        break
" "$TUNNEL_NAME"
}

# `tunnel create` fails if the name is taken, which on a re-run is the normal
# case rather than an error — so look first.
UUID=$(lookup_uuid)
if [ -z "$UUID" ]; then
    echo "Creating tunnel '$TUNNEL_NAME'..."
    "$CLOUDFLARED" tunnel create "$TUNNEL_NAME" >/dev/null
    UUID=$(lookup_uuid)
fi
if [ -z "$UUID" ]; then
    echo "Could not resolve a tunnel id for '$TUNNEL_NAME'" >&2
    exit 1
fi
echo "Tunnel $TUNNEL_NAME = $UUID"

cat >"$CONFIG_FILE" <<YAML
# Written by leetcode-senpai's deploy/setup-tunnel.sh — edit there, not here.
# Named for the project: this box runs more than one tunnel, and a shared
# config.yml would mean each project's setup deleting the other's ingress.
tunnel: $UUID
credentials-file: $CONFIG_DIR/$UUID.json

ingress:
  - hostname: $HOSTNAME
    service: http://localhost:$LOCAL_PORT
  # Anything else that reaches this tunnel is not for us.
  - service: http_status:404
YAML
echo "Wrote $CONFIG_FILE -> http://localhost:$LOCAL_PORT"

# Creates the proxied CNAME for the hostname. Safe to repeat; it updates an
# existing record that already points at this tunnel.
#
# --config matters. Without it cloudflared reads the default ~/.cloudflared/
# config.yml, which on a box running a second tunnel names *that* tunnel, and
# the record is created pointing at the wrong one.
#
# The hostname check matters more. When cert.pem does not cover the zone, this
# command does not fail — it treats the hostname as a subdomain of a zone the
# certificate *does* cover and cheerfully creates, say,
# `leetcode.example.com.some-other-zone.net`. A silent wrong answer is worse
# than an error, so the requested hostname has to appear in the output.
route_output=$("$CLOUDFLARED" --config "$CONFIG_FILE" tunnel route dns "$TUNNEL_NAME" "$HOSTNAME" 2>&1 || true)
echo "$route_output"
if ! grep -qE "(^|[^.[:alnum:]-])${HOSTNAME//./\.}([^.[:alnum:]-]|$)" <<<"$route_output"; then
    echo >&2
    echo "DNS was not routed to $HOSTNAME." >&2
    echo "Most likely ~/.cloudflared/cert.pem does not cover that zone. Either:" >&2
    echo "  - re-run '$CLOUDFLARED tunnel login' and authorise the zone, or" >&2
    echo "  - add the record by hand in the dashboard: CNAME $HOSTNAME ->" >&2
    echo "    $UUID.cfargotunnel.com, proxied." >&2
    echo "Check for a stray record before retrying." >&2
    exit 1
fi

UNIT_DIR=$HOME/.config/systemd/user
mkdir -p "$UNIT_DIR"
install -m 644 "$(dirname "$0")/$UNIT" "$UNIT_DIR/$UNIT"
systemctl --user daemon-reload
systemctl --user enable --now "$UNIT"
systemctl --user restart "$UNIT"

echo
echo "Tunnel service:"
systemctl --user --no-pager --lines=0 status "$UNIT" || true
echo
echo "Next: put an Access application in front of https://$HOSTNAME (see deploy/README.md),"
echo "then set ACCESS_TEAM_DOMAIN / ACCESS_AUD in .env.local and restart"
echo "leetcode-senpai.service."
