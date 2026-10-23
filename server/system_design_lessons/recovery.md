---
id: recovery
category: reliability
skill: operations
title: Backups, disaster recovery and graceful degradation
minutes: 16
summary: Replication protects you from losing a machine; only backups protect you from losing data to a bad migration, a mistaken delete or ransomware. Recovery is defined by two numbers — how much data you can lose (RPO) and how long you can be down (RTO) — and a backup that has never been restored is a hope, not a plan.
objectives:
  - Define RPO and RTO and derive them from business impact
  - Design backups with point-in-time recovery, the 3-2-1 rule and immutability
  - Compare disaster-recovery strategies from backup-and-restore to active-active by RTO, RPO and cost
  - Test recovery with restore drills and game days, and keep cross-system state consistent after a restore
sources:
  - ['GitLab: Postmortem of database outage of January 31 2017', 'https://about.gitlab.com/blog/2017/02/10/postmortem-of-database-outage-of-january-31/']
  - ['AWS: Disaster recovery options in the cloud', 'https://docs.aws.amazon.com/whitepapers/latest/disaster-recovery-workloads-on-aws/disaster-recovery-options-in-the-cloud.html']
  - ['PostgreSQL: Continuous archiving and point-in-time recovery', 'https://www.postgresql.org/docs/current/continuous-archiving.html']
---

> [!story] Five backup methods, none working
> In January 2017, a GitLab engineer fighting a replication problem ran a delete on the wrong database server and removed about 300 GB of production data. The team then discovered that, of five backup and replication mechanisms, none produced a usable recent copy: database dumps had silently failed for months (a version mismatch, with failure emails rejected), snapshots weren't enabled for the database servers, and the replica was the thing being repaired. They recovered from a staging snapshot taken six hours earlier, and lost six hours of user data. GitLab published the whole incident live, and it's still the best lesson in why **untested backups don't exist**.

## Two numbers define recovery

- **RPO (recovery point objective):** the maximum acceptable data loss, measured in time. "We can lose at most 5 minutes of orders."
- **RTO (recovery time objective):** the maximum acceptable time to restore service. "Checkout must be back within 30 minutes."

They come from business impact: what does an hour of downtime cost? What does losing an hour of orders cost (refunds, legal, trust)? Different data gets different targets — payments might need RPO ≈ 0, analytics clickstreams might tolerate a day.

```sim
name: tradeoff
title: Snapshot interval, PITR and restore time
config: {model: backup}
challenges:
  - {text: 'With snapshots alone, get the worst-case data loss (RPO) under 15 minutes. Note how often you have to snapshot.', metric: rpo, op: '<', value: 15, and: [{metric: wal, op: '==', value: false}]}
  - {text: 'Turn on continuous log archiving and get RPO under a minute with snapshots only once a day', metric: rpo, op: '<', value: 1, and: [{metric: x, op: '>=', value: 1000}]}
  - {text: 'Make the database 5 TB and see whether a 60-minute RTO is still achievable', metric: rto, op: '>', value: 60, and: [{metric: size, op: '>=', value: 5000}]}
takeaway: |
  Snapshots alone set RPO to the snapshot interval. Continuous WAL (or binlog) archiving gives point-in-time recovery to within seconds, with infrequent base snapshots. Restore time grows with data size and restore throughput, so big databases need faster restore paths — warm standbys, restoring from storage snapshots, or partial restores of the most critical data first.
```

## Backups that actually work

- **Point-in-time recovery (PITR):** periodic base backups plus a continuous archive of the write-ahead log. You can restore to any moment, such as "one second before the bad DELETE".
- **3-2-1 rule:** at least **3** copies, on **2** different kinds of media or storage, with **1** off-site — and today, one **immutable** or air-gapped (object lock, a separate account) so ransomware or a compromised admin can't delete your backups too.
- **Monitor backups like production:** alert when a backup job fails or produces a suspiciously small file, and when the WAL archive falls behind.
- **Restore regularly:** automate a restore into a scratch environment, run integrity checks and row counts, and record how long it took. That number is your real RTO.

```sort
prompt: Does each mechanism protect against an accidental DROP TABLE?
buckets: [Protects (can go back in time), Does not protect]
items:
  - {text: 'A synchronous replica in another zone', bucket: 1, why: 'The DROP replicates to it within milliseconds.'}
  - {text: 'Nightly snapshots kept for 30 days', bucket: 0, why: "You can restore last night's state, losing up to a day of changes."}
  - {text: 'Base backups plus continuous WAL archiving (PITR)', bucket: 0, why: 'Restore to the second before the DROP.'}
  - {text: 'RAID 10 on the database server', bucket: 1, why: 'RAID protects against disk failure, not against commands that delete data.'}
  - {text: 'A delayed replica that applies changes 1 hour late', bucket: 0, why: 'You have an hour to stop it before it applies the DROP — a neat complement to backups.'}
  - {text: 'Multi-region active-active replication', bucket: 1, why: 'The deletion propagates everywhere.'}
```

```calc
title: What's the RPO?
prompt: A database takes a full snapshot every **24 hours** and ships transaction-log segments to object storage every **5 minutes** (each segment is uploaded when full or after 5 minutes). Ignoring upload time, what's the worst-case RPO, in **minutes**?
answer: 5
unit: minutes
tolerance: 1.05
steps: |
  The snapshot interval doesn't set the RPO when logs are archived: you restore the latest snapshot and replay archived logs up to the failure. What's lost is the **unshipped** log segment — at most 5 minutes of changes. To get closer to zero, stream WAL continuously (e.g. `pg_receivewal`) or replicate synchronously to another site. The snapshot interval still matters for **RTO**, because a day of logs takes time to replay.
```

## Disaster recovery strategies

| Strategy | What runs in the DR region | RTO | RPO | Cost |
|---|---|---|---|---|
| **Backup and restore** | Nothing; backups copied there | Hours to a day | Hours (or minutes with PITR) | Lowest |
| **Pilot light** | Core data replicated; compute off or minimal | Tens of minutes to hours | Minutes | Low |
| **Warm standby** | A scaled-down but running copy of the full stack | Minutes | Seconds to minutes | Medium |
| **Multi-site active-active** | Full capacity serving traffic in every region | Near zero | Near zero (with conflict handling) | Highest; hardest |

```sort
prompt: Which DR strategy fits each system?
buckets: [Backup and restore, Pilot light, Warm standby, Active-active]
items:
  - {text: 'An internal analytics warehouse that can be down for a day', bucket: 0, why: 'Cheapest. A day of RTO is acceptable.'}
  - {text: 'A B2B SaaS app with a 1-hour RTO and a 15-minute RPO in its contracts', bucket: 1, why: 'Replicated data plus infrastructure as code that can scale compute up within the hour.'}
  - {text: 'A payments API with a 10-minute RTO', bucket: 2, why: 'A running, scaled-down copy can take traffic in minutes after promotion and scale-up.'}
  - {text: 'A global consumer product where regional outages must be invisible', bucket: 3, why: 'Traffic already runs everywhere. Losing a region just shifts load — at the price of multi-region data design.'}
```

## The restore is a procedure, not a command

```order
prompt: Order a recovery from an accidental bulk deletion at 14:32:10.
items:
  - Stop the damage — block the job or user, and pause writes to affected tables if needed
  - Decide the recovery point (14:32:09) and announce the incident and expected impact
  - Restore a base backup to a new instance and replay the WAL archive up to 14:32:09
  - Verify the restored data (row counts, integrity checks, spot-checking known records)
  - Copy back only the deleted rows, or cut over to the restored instance, reconciling changes made since 14:32
  - Check consistency with other systems (caches, search indexes, object storage, downstream consumers) and replay or invalidate as needed
explain: Restoring alongside production, not over it, keeps the post-incident writes. And a database restore can leave other systems ahead of it — files in object storage, events already consumed downstream, caches holding deleted data — so recovery includes reconciliation, using idempotent replay where possible.
```

```incident
title: The migration that deleted the wrong rows
intro: |
  11:05. A data migration meant to delete soft-deleted accounts older than 3 years ran with a broken WHERE clause. It deleted 1.8M active accounts' profile rows before someone noticed at 11:09 and killed it. The database has nightly snapshots and continuous WAL archiving. Users are getting errors; the API is otherwise healthy.
start: s1
nodes:
  s1:
    text: First action?
    options:
      - {label: 'Stop anything still writing to or deleting from the profiles table, and disable the migration job', next: s2, quality: good, note: 'Stop the bleeding before recovering.'}
      - {label: 'Restore last night''s snapshot over production immediately', next: bad1, quality: bad, note: 'That throws away every legitimate write since midnight, for every table.'}
      - {label: 'Ask users to re-enter their profiles', next: bad2, quality: bad}
  bad1:
    text: The restore takes 50 minutes and erases 11 hours of orders, signups and payments. You now have a much bigger incident.
    verdict: bad
  bad2:
    text: Most users won't, the data is lost, and trust takes the hit.
    verdict: bad
  s2:
    text: Writes to profiles are paused. What's the recovery plan?
    options:
      - {label: 'PITR-restore to a new instance at 11:04:59, then copy back only the deleted profile rows by primary key', next: s3, quality: good, note: 'Surgical: recovers the lost rows without discarding later writes elsewhere.'}
      - {label: 'PITR-restore to 11:04:59 and cut all traffic over to that instance', next: s3b, quality: ok, note: 'Simpler, but loses every write to other tables between 11:05 and the cutover.'}
  s3b:
    text: Service returns at 12:00, but 55 minutes of orders across the whole database are gone and must be reconciled from payment-provider records.
    verdict: ok
  s3:
    text: The restored instance is ready at 11:47 and the rows are copied back by 11:58. What else needs fixing?
    options:
      - {label: 'Invalidate profile caches and reindex search for affected users; check downstream consumers that received deletion events', next: done, quality: good}
      - {label: 'Nothing — the database is correct again', next: done2, quality: ok}
  done:
    text: Caches and search reflect the restored data, and the account-deleted events consumed by the email service are reconciled, so nobody gets a "sorry to see you go" email.
    verdict: good
  done2:
    text: The database is right, but caches serve "user not found" for up to an hour, search excludes 1.8M users, and the email service sends goodbye emails to people who never left.
    verdict: ok
debrief: |
  Stop the damage, restore **beside** production to a precise point, copy back surgically, then reconcile every system that observed the bad change. Afterwards: dry-run destructive migrations, require row-count guards (abort if more than N rows would be affected), and rehearse restores until the time is known.
```

> [!senior] Practise failure on purpose
> Recovery that's only done during real incidents is slow and error-prone. Run **game days**: restore last night's backup, fail over a region in staging (or production, for the brave), kill a dependency. Measure actual RTO and RPO and fix what breaks. Netflix's Chaos Monkey made "instances die" a daily non-event. The same principle applies to backups and regional failover.

```interview
say: |
  "Targets first: orders and payments get RPO under a minute and RTO under 30 minutes; analytics gets a day. Postgres takes nightly base backups plus continuous WAL archiving to object storage in another region and account, with object lock so backups can't be deleted. A warm standby in the second region gives the 30-minute RTO. Restores are automated weekly into a scratch environment with integrity checks, and the measured duration is tracked. For accidental deletes we restore beside production and copy back surgically, then reconcile caches, search and downstream consumers."
followups:
  - q: Isn't a replica enough?
    a: No. Replicas faithfully copy deletes, bad migrations and ransomware encryption. Backups with point-in-time recovery let you go back to before the mistake.
  - q: How do you know your RTO?
    a: By restoring regularly and timing it, end to end — including verification and reconnecting applications. Untested estimates are usually optimistic by multiples.
  - q: What's tricky about restoring one database in a microservices system?
    a: Other systems moved on — events were consumed, files written, caches populated. Recovery needs reconciliation, ideally through idempotent replay, plus invalidation.
weak: |
  "We have backups and replicas, so we're covered." No RPO or RTO, no PITR, never tested, no plan for reconciling other systems.
strong: |
  Derives RPO and RTO per data class, uses PITR with immutable off-site backups, picks a DR tier to match, tests restores and measures them, restores surgically, and reconciles dependent systems.
```

```recall
prompt: Explain the difference between RPO and RTO, and how backups, PITR and a warm standby each affect them.
points:
  - RPO is the maximum acceptable data loss measured in time; RTO is the maximum acceptable time to restore service
  - Periodic backups alone give an RPO equal to the backup interval and an RTO of the full restore time
  - Point-in-time recovery (base backups plus a continuous log archive) reduces RPO to seconds or minutes of unarchived log
  - A warm standby in another region reduces RTO to minutes (promotion and scale-up), at extra cost
model: |
  RPO answers "how much data can we lose?" — measured back in time from the failure — and RTO answers "how long can we be down?" With only nightly backups, the RPO is up to 24 hours and the RTO is however long a full restore takes, which grows with data size. Adding continuous archiving of the write-ahead log enables point-in-time recovery: restore the last base backup and replay logs up to just before the incident, so the RPO shrinks to whatever log hadn't been shipped yet, often seconds. A warm standby already running in another region cuts the RTO to the time needed to promote it and scale it up — minutes rather than hours — in exchange for paying to run it.
```

```questions
- kind: check
  prompt: What does RPO measure?
  choices:
    - text: The maximum acceptable data loss, measured as time before the failure
      correct: true
    - text: The maximum time to restore service
      why: That's RTO.
    - text: Requests per operation
      why: Unrelated.
    - text: The backup file size
      why: Size affects restore time, not the loss window.
  explanation: RPO bounds how far back in time the restored state may be. RTO bounds how long recovery takes.
- kind: check
  type: multi
  prompt: Which protect against an accidental mass deletion? Select all that apply.
  choices:
    - text: Point-in-time recovery from base backups plus a WAL archive
      correct: true
    - text: Daily snapshots retained for 30 days
      correct: true
    - text: A delayed replica applying changes an hour late
      correct: true
    - text: A synchronous replica
      why: It replicates the deletion immediately.
    - text: RAID mirroring
      why: It mirrors the deletion too.
  explanation: Only mechanisms that keep history independent of the live copy let you go back in time.
- kind: check
  type: order
  prompt: Order a recovery from a bad deletion.
  items:
    - Stop the ongoing damage
    - Choose the recovery point just before the incident
    - Restore to a separate instance using backups and log replay
    - Verify the restored data
    - Copy back or cut over, then reconcile dependent systems
  explanation: Restoring beside production keeps later legitimate writes. Reconciliation fixes the caches, indexes and consumers that saw the bad change.
- kind: check
  prompt: Why must backups be restored regularly in a test environment?
  choices:
    - text: Backups fail silently, and only a real restore proves they're usable and tells you the actual RTO
      correct: true
    - text: Restores make backups smaller
      why: No effect.
    - text: Regulations forbid untested backups
      why: Some require testing, but the engineering reason is that backups fail silently.
    - text: It keeps the backup storage warm
      why: Not a thing.
  explanation: GitLab had five mechanisms and none worked. Testing is the only evidence a backup exists.
- kind: fire
  type: numeric
  prompt: Log segments are shipped every 2 minutes and full backups are taken daily. Ignoring upload time, what's the worst-case RPO in minutes?
  answer: 2
  unit: minutes
  tolerance: 0.01
  explanation: You restore the daily backup and replay shipped logs. Only the last unshipped segment — up to 2 minutes — is lost.
- kind: fire
  prompt: Which DR strategy gives the lowest RTO and RPO, at the highest cost and complexity?
  choices:
    - text: Multi-site active-active
      correct: true
    - text: Backup and restore
      why: The cheapest option, with the slowest recovery.
    - text: Pilot light
      why: It needs time to scale compute up.
    - text: Warm standby
      why: Recovery takes minutes, and it's cheaper than active-active.
  explanation: Active-active already serves from every region, so a regional loss shifts traffic — but multi-region writes need careful data design.
- kind: fire
  prompt: Why should at least one backup copy be immutable or in a separate account?
  choices:
    - text: Ransomware or a compromised admin account can't delete or encrypt it along with production
      correct: true
    - text: Immutable storage is faster to restore from
      why: Speed isn't the point.
    - text: It halves storage cost
      why: Unrelated.
    - text: It replaces the need for testing
      why: You still need to test restores.
  explanation: Attackers increasingly target backups first. Object lock or an air-gapped account preserves a recovery path.
- kind: fire
  level: advanced
  prompt: After restoring a database to 10:00, which other systems may need reconciling? Select the best answer.
  choices:
    - text: Caches, search indexes, object storage and downstream consumers that observed changes after 10:00
      correct: true
    - text: None — the database is the source of truth, so everything else corrects itself
      why: Caches and consumers keep their own state and won't roll back.
    - text: Only the load balancer
      why: Routing isn't affected.
    - text: Only the backups
      why: The backups aren't what's out of sync.
  explanation: Restoring one store makes it "older" than its neighbours. Invalidate derived data and replay events idempotently.
- kind: fire
  type: multi
  prompt: Which practices make destructive data migrations safer? Select all that apply.
  choices:
    - text: Dry-running and checking the affected row count before executing
      correct: true
    - text: Guards that abort if more rows than expected would change
      correct: true
    - text: Running in batches with the ability to stop
      correct: true
    - text: Confirming a recent restorable backup or PITR window first
      correct: true
    - text: Running directly on production without review because it's urgent
      why: That's how the incidents in this lesson happen.
  explanation: Make the blast radius visible and limited, and make sure recovery is possible before you start.
```
