# deploy/ — LAN testing deployment

Runs the cumulative **Testing stack** of this app on the laptop at
`http://<laptop-ip>:8000`, always pinned to the head of the local
`integration/leetcode-senpai` branch that ticket-runner builds.

## Pieces

- `sync-integration.sh` — fetch + hard-reset the testing checkout to the
  integration head; `--restart` also restarts the service when the head moved.
- `leetcode-senpai-testing.service` — the app (uvicorn `run.py` on :8000).
  `ExecStartPre` runs the sync so every start lands on head.
- `leetcode-senpai-testing-sync.{service,timer}` — run the sync with `--restart`
  every minute so new deploys go live automatically.

## Topology (laptop)

- **This** checkout (`~/Documents/Programming/Learning/leetcode`) is where
  ticket-runner builds `integration/leetcode-senpai` locally (project publisher
  is `none` — nothing is pushed or deployed off-box).
- A **separate** checkout `~/Documents/Programming/Learning/leetcode-testing`
  serves :8000. Its git `origin` is *this* local repo, so it fetches the
  integration branch directly. It has its own `.venv` and untracked
  `.env.local` (Firestore creds) — never reset away.
- Not to be confused with the ticket-runner dashboard on **:4600**.

## Install / update

```sh
cp deploy/*.service deploy/*.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now leetcode-senpai-testing.service leetcode-senpai-testing-sync.timer
```

The `sync-integration.sh` script runs from this `deploy/` dir inside the testing
checkout; because it is tracked, `git reset --hard` restores it instead of
losing it.
