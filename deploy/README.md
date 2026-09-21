# deploy/ — LAN testing deployment and public access

Two deployments run on the laptop, from two different checkouts:

| | checkout | port | reached by |
|---|---|---|---|
| **Live** | `~/Documents/Programming/Learning/leetcode-live` | 127.0.0.1:8200 | `https://leetcode.nikhil.ing` through the tunnel |
| **Testing** | `~/Documents/Programming/Learning/leetcode-testing` | :8000 | the laptop / LAN |

One server (`run.py`) serves both the API and the static frontend in each.

## Testing stack (LAN)

Pinned to the head of the local `integration/leetcode-senpai` branch that
ticket-runner builds.

- `sync-integration.sh` — fetch + hard-reset the testing checkout to the
  integration head; `--restart` also restarts the service when the head moved.
- `leetcode-senpai-testing.service` — the app (uvicorn `run.py` on :8000).
  `ExecStartPre` runs the sync so every start lands on head.
- `leetcode-senpai-testing-sync.{service,timer}` — run the sync with `--restart`
  every minute so new deploys go live automatically.

### Topology (laptop)

- **This** checkout (`~/Documents/Programming/Learning/leetcode`) is where
  ticket-runner builds `integration/leetcode-senpai` locally. Nothing serves it:
  a live site pinned to a build tree shows mid-build states, and the two would
  fight over which branch is checked out.
- A **separate** checkout `~/Documents/Programming/Learning/leetcode-testing`
  serves :8000. Its git `origin` is *this* local repo, so it fetches the
  integration branch directly. It has its own `.venv` and untracked
  `.env.local` (Firestore creds) — never reset away.
- A third checkout `~/Documents/Programming/Learning/leetcode-live` serves the
  public hostname on :8200. Its `origin` is GitHub, and it has its own
  `.venv` and `.env.local`.
- Not to be confused with the ticket-runner dashboard on **:4600**.

### Install / update

Install uv at `~/.local/bin/uv` (the default installer location), or adjust
the executable paths in the service and sync script. In the testing checkout,
run `uv sync --locked --no-dev` before enabling the service.

```sh
cp deploy/*.service deploy/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now leetcode-senpai-testing.service leetcode-senpai-testing-sync.timer
```

The `sync-integration.sh` script runs from this `deploy/` dir inside the testing
checkout; because it is tracked, `git reset --hard` restores it instead of
losing it.

## Getting to it from outside the house — Cloudflare Tunnel + Access

`cloudflared` runs on the laptop and dials *out* to Cloudflare, so there is no
port forwarded, no inbound firewall rule and no public IP anywhere. Cloudflare
Access sits in front of the hostname doing Google sign-in against an email
allowlist, which is why the app renders no login page in this mode.

- `leetcode-senpai.service` — the live app on `127.0.0.1:8200`, `AUTH_MODE=access`.
- `cloudflared-leetcode.service` — the tunnel (user unit, like the others here).
- `setup-tunnel.sh` — creates the tunnel, writes
  `~/.cloudflared/leetcode-senpai.yml` pointing at `localhost:8200`, adds the
  DNS record, installs the unit.
- `~/.cloudflared/` holds the config and the tunnel credentials. Outside the
  repo deliberately: that JSON file is a bearer token for the tunnel.

This box also runs a **separate** tunnel for HolaFresca. They are kept apart —
own tunnel, own config file, own unit — because each project's `setup-tunnel.sh`
rewrites the config file it names, and a shared `config.yml` would mean setting
up one project silently deletes the other's ingress rule.

The binary is user-installed at `~/.local/bin/cloudflared` (same arrangement as
`uv` — there is no passwordless sudo on this box).

### One-time setup

```sh
cloudflared tunnel login          # browser: authorise the nikhil.ing zone
deploy/setup-tunnel.sh leetcode.nikhil.ing
```

Then in the Cloudflare dashboard, **Zero Trust → Access → Applications**: add a
self-hosted app for that hostname, with a policy of *Allow* / *Emails* listing
who gets in, and Google as the login method. Free for up to 50 users.

Finally, tell the app which Access instance to trust — in the gitignored
`.env.local` at the repo root, then restart `leetcode-senpai.service`:

```
AUTH_MODE=access
ACCESS_TEAM_DOMAIN=yourteam.cloudflareaccess.com
ACCESS_AUD=<the application's Audience tag>
ACCESS_UID=<your Firebase uid — whose Firestore data to serve>
ALLOWED_EMAILS=you@example.com
```

Set the Access session duration to something long (a month) — it is short by
default, and every lapse costs a round trip through Google.

Lapses themselves are handled: `static/app.js` tags API calls with
`X-Requested-With`, which is what makes the edge answer an expired request with
a same-origin 401 instead of a cross-origin 302 that `fetch` follows and then
cannot read (a redirect surfaces as a bare `TypeError`, indistinguishable from
being offline, and the tab just fills with errors). On a 401 it reloads, because
only a document load can follow the chain out to Google and back. Nothing else
in this API returns 401, which is what makes the signal safe to act on.

### What actually authenticates a request

`server/access.py` and `server/auth.py`.

- The `Cf-Access-Authenticated-User-Email` header is **never read**. Cloudflare
  sets it, but so can anything that reaches the port — it is a claim, not a
  proof. Only the signed assertion is trusted, checked against the team's
  published keys for signature, audience, issuer and expiry.
- A request without a valid assertion is refused, never fallen back on. That is
  the case that matters if the Access policy is ever off or misconfigured:
  otherwise a stranger arrives as the owner. `AUTH_MODE=access` with
  `ACCESS_AUD` unset refuses everything with a 503 rather than letting traffic
  through unchecked.
- The audience tag is per-application, so a valid Access token for some *other*
  app behind the same team does not open this one.
- The service binds `127.0.0.1`, so the tunnel is the only route in. Nothing on
  the LAN or the tailnet reaches :8200 without going through Access first; the
  testing stack on :8000 is what the house uses.
- A verified, allow-listed email is served as `ACCESS_UID` — this is a
  single-user app, and that uid is the Firestore document the data lives under.
- Leave `ACCESS_TEAM_DOMAIN` or `ACCESS_AUD` unset under any other `AUTH_MODE`
  and none of it is enforced, which is what local dev and the test suite run as.

```sh
systemctl --user status cloudflared-leetcode.service
journalctl --user -u cloudflared-leetcode.service -f   # connections, reconnects
cloudflared tunnel list
cloudflared tunnel info 38df3f10-a095-4696-9a31-5173210b7ddf
curl -s localhost:8200/api/health                      # unauthenticated liveness
```

Address this tunnel by **UUID**, or pass `--config`. A bare `cloudflared tunnel
info leetcode-senpai` reads the default `~/.cloudflared/config.yml`, which on
this box belongs to HolaFresca, and answers about that tunnel instead — it
reports on the wrong one rather than complaining.

### Deploying

The live site serves the live checkout's working tree, so a deploy is a `git
pull` in that tree plus a restart:

```sh
cd ~/Documents/Programming/Learning/leetcode-live
git pull
~/.local/bin/uv sync --locked --no-dev
systemctl --user restart leetcode-senpai.service
curl -s localhost:8200/api/health
```
