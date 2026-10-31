---
id: home-lab
category: infrastructure
skill: infrastructure
title: "Case study: your own box"
minutes: 14
summary: Your home server is a small production system, and every part of it is an interview story. Deploys poll Git, build an image per commit and roll back on a failed health check. A Cloudflare Tunnel publishes apps with no open ports, and Access signs people in at the edge. A reaper sheds load by shortening idle limits as memory runs out, and an incident showed what fixed rules miss. Backups are encrypted, off-site and restored every month, and an auto-fixer tries one cheap fix before calling for help.
objectives:
  - Explain pull-based deploys with immutable images, health checks and automatic rollback
  - Explain how a tunnel and an identity-aware proxy publish apps without open ports
  - Design load shedding that tightens as a resource runs out, and say why fixed rules failed
  - Describe a backup scheme you can trust, including restore tests and retention
  - Describe safe self-healing that avoids fix loops and respects deliberate changes
sources:
  - ['Cloudflare: Tunnel', 'https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/']
  - ['Cloudflare: validate Access JWTs', 'https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/']
  - ['restic: forget and prune', 'https://restic.readthedocs.io/en/stable/060_forget.html']
---

## Deploys that undo themselves

Every app on the box deploys the same way. A timer runs `bin/deploy <stack> --poll` every **2 minutes**. If the app's branch has moved, it builds an image tagged with the **commit**, retags the running one as `:previous` and the new one as `:current`, and starts it. Then it **waits up to 90 seconds for the container to report healthy**. If it doesn't, it points `:current` back at `:previous` and starts that again.

Three ideas make this safe:

- **Pull, not push.** The box fetches from GitHub, so nothing outside needs credentials to reach in. The cost is up to two minutes of delay.
- **Immutable images.** A commit's image never changes, so rolling back is just running the old image again: no rebuild, seconds not minutes. Old tags are pruned, keeping `:current`, `:previous` and the three newest.
- **A health check decides.** "The process started" is not "it works". The compose file's health check calls `/api/health`, and only a healthy container counts as deployed.

```predict
prompt: A commit makes the app crash on startup because a new environment variable is missing on the box. Nobody notices for ten minutes. What happens in that time?
choices:
  - The site is down for the whole ten minutes
  - It rolls back within about 90 seconds and then stays on the old version until a new commit lands
  - Every poll tries the broken commit again, so the site keeps dropping out for a minute or so, then recovering, every couple of minutes
  - Docker restarts the crashing container until it works
answer: 2
reveal: |
  The first attempt fails its health check and rolls back. But the deploy only records a commit once it succeeds, so two minutes later `main` still looks new and the deploy tries the same broken image again: swap, 90 seconds unhealthy, roll back. The site flaps until someone fixes the variable or pushes a fix. Remembering the commit that failed, and not retrying it, would turn that into one short blip and an alert. It's a classic retry storm: automatic recovery that repeats the failure.
```

## Publishing without open ports

The router has **no port forwarding**. A `cloudflared` container makes an **outbound** connection to Cloudflare and keeps it open. Requests for `leetcode.nikhil.ing` arrive at Cloudflare's edge and travel down that tunnel to the container by name on a shared Docker network (`http://leetcode-senpai:8080`). Nothing on the internet can connect to the box directly, and the home IP address never appears in DNS.

**Cloudflare Access** sits in front: it signs you in (Google, a one-time code) before a request ever reaches the tunnel, then adds a signed **JWT** header to every request. An app shouldn't trust the header blindly. It checks the **signature** against Access's public keys, the **issuer**, the **audience** (this application), the **expiry** and the **email**. That way a request that somehow skipped the edge, say from another container on the same network, is still refused.

Machines can't type a one-time code. They use a **service token** (a client id and secret sent as headers), or a separate hostname that skips Access and has the app check its own token, like Sundial's ingest endpoint.

## Load shedding by memory

The box once had 8 GB of RAM, shared by containers, a Telegram assistant and dozens of AI agent sessions. The **reaper** runs every **30 seconds** and kills idle sessions and orphaned dev processes. Its idle limits **shrink as available memory falls**:

| Available RAM | Level | Idle agent session killed after |
|---|---|---|
| 2 GiB or more | normal | 24 hours |
| under 2 GiB | low | 4 hours |
| under 1 GiB, or under 2 GiB with swap 90% full | high | 1 hour |
| under 0.5 GiB | critical | 15 minutes |

It also protects anything still working (the whole process tree must have used no CPU for two minutes), never touches services, and kills at most **8** per pass, because another pass comes 30 seconds later anyway. That's the shape of all good load shedding: **the scarcer the resource, the less you keep around**, with a bound on how much you do at once.

It wasn't always like this. On 15 October 2026 the box ran out of memory: swap was **99.9% full for over an hour** with 31 agents running, and the journal stops at 20:42 and the box came back at 21:12. The old reaper was running fine. It just had **fixed rules**: sessions idle for 24 hours, checked every 15 minutes, **whatever the memory**. Two more lessons from that incident:

- A **per-service memory cap** (systemd `MemoryMax`) protects others from that service, but **doesn't reserve memory for the host**. Every service can respect its cap while their sum exceeds the machine.
- A cleanup that runs every 15 minutes **can't protect against demand that grows between runs**. Hence 30 seconds.

```order
prompt: Order the reaper's levels from most to least relaxed.
items:
  - normal (24-hour idle limit)
  - low (4 hours)
  - high (1 hour)
  - critical (15 minutes)
explain: Each step down in available memory shortens how long an idle session may live. Swap 90% full pushes the box to "high" early, because a full swap means the next spike has nowhere to go.
```

## Backups you have actually restored

Every night at 04:00, **restic** makes an **encrypted, deduplicated** snapshot of the data, secrets and local backups and sends it to Google Drive: **off the box**, so a dead disk or a stolen laptop doesn't take the backups with it. SQLite databases are **copied safely first** (with SQLite's own backup, not `cp` on a live file, which can capture a half-written page). Retention keeps **7 daily, 4 weekly and 12 monthly** snapshots: fine-grained recent history and a year of coarse history, at little cost thanks to deduplication.

**A backup nobody has restored is a hope, not a backup.** On the 2nd of every month a job restores the latest snapshot to a scratch directory, opens every database, checks it holds rows, loads the Postgres dump into a throwaway server, and reports. And the restic password lives somewhere other than the box, or the encrypted backup is useless exactly when it is needed.

## Self-healing that knows when to stop

The **auto-fixer** runs every minute against the dashboard's list of problems. For each one it:

1. **Leaves alone what was meant**: a container stopped on purpose, a paused timer, a deploy in progress, an agent working on that app.
2. **Waits until the problem has lasted** about 3 minutes, so blips fix themselves.
3. Tries **one cheap fix**: restart the container or rerun a job, but only jobs that are safe to repeat (never a booking or a prescription request).
4. If it's still broken 5 minutes later, starts **one** AI diagnosis run, at most once per problem a day.
5. **Escalates to a human** on Telegram. A problem that comes back within 24 hours of a fix is escalated, not retried.

The rules against loops matter as much as the fixes. Without them, a restart that "works" for a minute turns into an endless restart loop that hides the real fault.

```questions
- kind: check
  prompt: Why does rolling back on the box take seconds rather than minutes?
  choices:
    - text: The previous commit's image still exists, so rollback just runs it again with no rebuild
      correct: true
    - text: Docker caches the last container's memory
      why: Containers are started fresh; the image is what's kept.
    - text: The deploy script reverts the Git commit and rebuilds quickly
      why: Nothing is rebuilt and the commit stays on main.
  explanation: Immutable images tagged per commit, with :previous kept, make rollback a retag and a restart.
- kind: check
  prompt: Why doesn't the box need any open ports for its public sites?
  choices:
    - text: cloudflared makes an outbound connection to Cloudflare, and requests come back down it
      correct: true
    - text: Cloudflare scans for the box's IP and connects on port 443
      why: Nothing connects in; the box's IP isn't even in DNS.
    - text: The router forwards 80 and 443 automatically
      why: There is no port forwarding at all.
  explanation: A tunnel turns inbound traffic into responses on a connection the box opened.
- kind: check
  prompt: Every service on the box had a memory cap, yet the box ran out of memory. How?
  choices:
    - text: Caps protect the others from one service but reserve nothing; the sum of all services can still exceed the machine
      correct: true
    - text: systemd ignores MemoryMax for user services
      why: The caps were enforced; they just don't add up to a guarantee.
    - text: Swap doesn't count toward memory
      why: Swap filling up was part of the failure, not a loophole.
  explanation: Limits per service are not a budget for the whole host.
- kind: fire
  prompt: What does an app behind Cloudflare Access check in the JWT header?
  choices:
    - text: Signature, issuer, audience, expiry and email
      correct: true
    - text: Only that the header is present
      why: Anything that reaches the app without going through the edge could send one.
    - text: The user's IP address
      why: The edge already authenticated the person; the token proves it.
  explanation: Verify the token, not the fact that a header exists.
- kind: fire
  prompt: How does the reaper react when available memory falls under 1 GiB?
  choices:
    - text: Idle agent sessions are killed after 1 hour instead of 24
      correct: true
    - text: It kills every agent at once
      why: It only kills idle ones, and at most 8 per pass.
    - text: Nothing changes until the next 15-minute run
      why: That was the old reaper; it now runs every 30 seconds with memory-aware limits.
  explanation: The scarcer the memory, the shorter idle sessions may live.
- kind: fire
  prompt: Why does the box restore its backup every month?
  choices:
    - text: A backup is only trusted once it has been restored and its databases checked
      correct: true
    - text: restic deletes snapshots that are never read
      why: Retention is set by the forget policy, not by reads.
    - text: To keep Google Drive's storage warm
      why: The point is proving recovery works.
  explanation: Restore tests turn "we have backups" into "we can recover".
- kind: fire
  prompt: A container the auto-fixer restarted fails again two hours later. What does it do?
  choices:
    - text: Escalates to Nikhil instead of restarting it again
      correct: true
    - text: Restarts it again, as many times as needed
      why: That's the restart loop the rules exist to prevent.
    - text: Deletes and redeploys the stack
      why: It never takes destructive actions like that.
  explanation: A problem that returns within 24 hours of a fix goes to a human.
```
