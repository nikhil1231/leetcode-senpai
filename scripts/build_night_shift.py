"""Write static/simulators/nightshift.json: Night Shift, the on-call game for the Fundamentals course.

Each level is an incident at Ripple taught by a Fundamentals lesson: the page, the commands you can
run (with the output the box would print before and after it's stable), the actions you can take
(and what each really does), then the diagnosis and the lasting fix. `truth` is the hidden state,
for the model to stay consistent with when it plays Priya or answers a command nobody scripted.
Authored here as Python so long outputs stay readable. Run it after editing, then
`node --test tests/test_night_shift.cjs`, which plays every level both well and badly.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'static', 'simulators', 'nightshift.json')
F = 'fundamentals.'


def cmd(id, group, line, out, after=None, minutes=1):
    c = {'id': id, 'group': group, 'cmd': line, 'out': out.strip('\n')}
    if after:
        c['after'] = after.strip('\n')
    if minutes != 1:
        c['minutes'] = minutes
    return c


def act(id, label, effect, say, minutes=2, risky=False, relapse=None, after_say=None):
    a = {'id': id, 'label': label, 'effect': effect, 'say': say, 'minutes': minutes}
    if risky:
        a['risky'] = True
    if relapse:
        a['relapse'] = relapse
    return a


LEVELS = [
    {
        'id': 'oomkilled', 'title': 'The pod that kept dying', 'kicker': 'Exit code 137, and nothing in the logs.',
        'lessons': ['linux-processes', 'kubernetes'], 'clock': '02:14', 'par': 8,
        'impact': {'unit': 'failed link creations', 'perMin': 600},
        'points': [F + 'linux-processes.exit-code-137', F + 'linux-processes.jvm-container-memory', F + 'kubernetes.memory-limit-oomkilled', F + 'kubernetes.crashloop-debugging'],
        'page': 'FIRING  links-api: error rate 31% (threshold 2%) for 5m\n        links-api pods restarting: 14 restarts in 20m',
        'opening': [{'who': 'priya', 'text': "Evening. links-api's falling over and getting back up, over and over. It's yours, I'm on the other channel watching payments. Shout if you want a second pair of eyes."}],
        'timeline': [{'at': 5, 'who': 'sam', 'text': 'Support says creators can\'t make new links, about one in three tries fails. Twitter has noticed.'},
                     {'at': 10, 'who': 'marcus', 'text': "Is this the thing where we bumped the heap last week? Just asking."}],
        'commands': [
            cmd('pods', 'kubectl', 'kubectl get pods -l app=links-api', """
NAME                         READY   STATUS             RESTARTS      AGE
links-api-7c9f5d8b6-2xkqp    1/1     Running            5 (2m ago)    3d
links-api-7c9f5d8b6-9mzt4    0/1     CrashLoopBackOff   5 (40s ago)   3d
links-api-7c9f5d8b6-rv8wd    1/1     Running            4 (6m ago)    3d""", """
NAME                         READY   STATUS    RESTARTS   AGE
links-api-5d7b9c4f8-8hq2n    1/1     Running   0          4m
links-api-5d7b9c4f8-kx7mp    1/1     Running   0          3m
links-api-5d7b9c4f8-w2zcd    1/1     Running   0          3m"""),
            cmd('describe', 'kubectl', 'kubectl describe pod links-api-7c9f5d8b6-9mzt4', """
Containers:
  links-api:
    Image:          ripple/links-api:4.12.0
    Limits:         cpu: 2, memory: 2Gi
    Requests:       cpu: 1, memory: 2Gi
    Last State:     Terminated
      Reason:       OOMKilled
      Exit Code:    137
      Started:      02:03:11
      Finished:     02:09:52
    Environment:
      JAVA_OPTS:    -Xms2g -Xmx2g -XX:+UseG1GC
Events:
  Warning  BackOff  40s (x18 over 21m)  kubelet  Back-off restarting failed container"""),
            cmd('logs', 'kubectl', 'kubectl logs links-api-7c9f5d8b6-9mzt4 --previous | tail -5', """
02:09:47.102 INFO  c.r.links.Api - POST /links 201 12ms
02:09:48.880 INFO  c.r.links.Api - GET /r/k3Xz 302 2ms
02:09:50.415 INFO  c.r.links.Analytics - flushed 18,204 click events (batch buffer 412 MB)
02:09:51.977 INFO  c.r.links.Api - POST /links 201 15ms
(the log just stops: no exception, no OutOfMemoryError)"""),
            cmd('top', 'kubectl', 'kubectl top pod -l app=links-api', """
NAME                         CPU(cores)   MEMORY(bytes)
links-api-7c9f5d8b6-2xkqp    612m         2031Mi
links-api-7c9f5d8b6-rv8wd    588m         1987Mi""", """
NAME                         CPU(cores)   MEMORY(bytes)
links-api-5d7b9c4f8-8hq2n    540m         1802Mi
links-api-5d7b9c4f8-kx7mp    566m         1795Mi
links-api-5d7b9c4f8-w2zcd    521m         1788Mi"""),
            cmd('dmesg', 'node', 'dmesg -T | grep -i -A2 "killed process" | tail -3', """
[02:09:52] Memory cgroup out of memory: Killed process 31877 (java) total-vm:6143296kB, anon-rss:2096120kB
[02:09:52] oom_reaper: reaped process 31877 (java), now anon-rss:0kB
[01:58:07] Memory cgroup out of memory: Killed process 30211 (java) total-vm:6140188kB, anon-rss:2095880kB"""),
            cmd('jcmd', 'jvm', 'kubectl exec links-api-7c9f5d8b6-2xkqp -- jcmd 1 VM.native_memory summary', """
Total: reserved=3412MB, committed=2264MB
-                 Java Heap (reserved=2048MB, committed=1712MB)
-                     Class (reserved=1056MB, committed=148MB)
-                    Thread (reserved=212MB, committed=212MB)   210 threads
-                      Code (reserved=244MB, committed=62MB)
-                        GC (reserved=118MB, committed=96MB)
-                     Other (reserved=34MB, committed=34MB)    direct buffers"""),
            cmd('history', 'deploys', 'kubectl rollout history deploy/links-api', """
REVISION  CHANGE-CAUSE
11        4.11.3  raise heap: -Xmx1536m -> -Xmx2g ("GC pauses during flush")
12        4.12.0  analytics: bigger click batches (flush every 20k)"""),
        ],
        'actions': [
            act('restart', 'kubectl rollout restart deploy/links-api', 'none', 'Fresh pods start, run for about six minutes, and get OOMKilled again. Restarting resets the clock; it fixes nothing.'),
            act('scale', 'Scale to 6 replicas', 'none', 'Six pods now, all creeping up towards 2 GiB. The new ones start dying ten minutes later. More copies of a pod that does not fit is more OOMKills.'),
            act('heap3', 'Raise -Xmx to 3g', 'worse', 'The heap can now grow past the 2 GiB limit on its own. Pods die faster: the kernel kills them as soon as the heap fills.'),
            act('limit', 'Raise the memory limit to 3Gi (request too)', 'temp', 'Pods stop dying and the error rate drops to zero. You bought headroom, but -Xmx2g still assumes the whole limit is heap.', relapse=40),
            act('pct', 'Set -XX:MaxRAMPercentage=75 (drop -Xmx) and roll out', 'fix', 'The rollout finishes: heap capped at 1.5 GiB, about 300 MiB left for metaspace, threads and buffers. Memory settles at 1.8 GiB and the restarts stop.', minutes=4),
            act('rollback', 'kubectl rollout undo (back to 4.11.3)', 'temp', 'Back on 4.11.3: smaller click batches, so less is allocated at once. It holds for now, but 4.11.3 still has -Xmx2g in a 2 GiB pod.', relapse=50),
        ],
        'diagnosis': {'prompt': 'What is killing the pods?', 'answer': 1, 'choices': [
            'A memory leak in the analytics batch, which eventually throws OutOfMemoryError',
            'The JVM process outgrows its 2 GiB cgroup limit: the heap alone may use all 2 GiB, and metaspace, threads and buffers come on top, so the kernel SIGKILLs it',
            'The liveness probe times out during long GC pauses, so the kubelet restarts the container',
            'The node is out of memory and the kubelet evicts the pod'],
            'explain': 'Exit 137 is 128 + 9, a SIGKILL. There is no Java OutOfMemoryError because the heap never ran out: the kernel killed the whole process when the cgroup hit 2 GiB. The pod events say OOMKilled, not a probe failure or an eviction.'},
        'fix': {'prompt': 'What is the lasting fix?', 'answer': 2, 'choices': [
            'Restart the pods every few hours with a CronJob',
            'Remove the memory limit so the pod can use what it needs',
            'Size the heap as a share of the limit (MaxRAMPercentage around 75%) and alert on container memory against its limit',
            'Raise -Xmx until the GC pauses go away'],
            'explain': 'The heap must leave room for everything else the JVM uses. A percentage keeps that true when someone changes the limit later. Removing the limit just moves the OOM to the node.'},
        'hints': ['What does exit code 137 mean, in numbers?', 'Compare what the JVM is allowed to use with what the container is allowed to use.'],
        'truth': 'links-api runs Java with -Xms2g -Xmx2g in a pod with a 2Gi memory limit. Heap plus metaspace (~150MB), 210 thread stacks (~210MB), code cache and GC (~160MB) and direct buffers exceed 2Gi under load, so the kernel OOM-kills the process (exit 137, reason OOMKilled). No Java OOM error is ever logged. Revision 11 raised the heap to 2g; revision 12 made analytics batches bigger, which pushed memory over sooner. The node itself has plenty of free memory. Liveness probes are fine.',
        'debrief': 'The JVM was told it could use all 2 GiB for heap inside a 2 GiB container, so everything else it needs pushed it over the cgroup limit and the kernel killed it. Exit 137 with no Java error is the tell.',
    },
    {
        'id': 'lockqueue', 'title': 'The migration that took the site down', 'kicker': 'A one-column ALTER, and every request timing out.',
        'lessons': ['postgres-internals'], 'clock': '14:02', 'par': 6,
        'impact': {'unit': 'failed requests', 'perMin': 3000},
        'points': [F + 'postgres-internals.ddl-lock-queue-outage', F + 'postgres-internals.diagnose-lock-outage', F + 'postgres-internals.safe-migration-practices'],
        'page': 'FIRING  api: p99 latency 30.0s (threshold 800ms)\nFIRING  api: 5xx rate 64%\nFIRING  pgbouncer: client wait queue 412',
        'opening': [{'who': 'priya', 'text': 'Everything just went red at once. API, redirects, the dashboard. CPU on the database is basically idle, which is odd. Jo merged something about ten minutes ago, I think.'}],
        'timeline': [{'at': 3, 'who': 'jo', 'text': 'My migration is still running?? It\'s just adding a column with a default. It worked in staging in like a second.'},
                     {'at': 6, 'who': 'sam', 'text': 'The whole site is down for everyone. Status page?'}],
        'commands': [
            cmd('activity', 'postgres', "SELECT pid, state, wait_event_type, now()-query_start AS age, left(query,60) FROM pg_stat_activity WHERE datname='ripple' ORDER BY age DESC LIMIT 6;", """
  pid  | state  | wait_event_type |   age    | left
-------+--------+-----------------+----------+--------------------------------------------------------------
 48211 | active | IO              | 00:41:07 | SELECT creator_id, count(*) FROM links JOIN clicks USING (lin
 48990 | active | Lock            | 00:09:58 | ALTER TABLE links ADD COLUMN archived boolean NOT NULL DEFAULT
 49102 | active | Lock            | 00:09:57 | SELECT url FROM links WHERE slug = $1
 49103 | active | Lock            | 00:09:57 | SELECT url FROM links WHERE slug = $1
 49104 | active | Lock            | 00:09:56 | UPDATE links SET clicks = clicks + 1 WHERE id = $1
(… 397 more rows waiting on Lock)""", """
  pid  | state  | wait_event_type |   age    | left
-------+--------+-----------------+----------+--------------------------------------------------------------
 48211 | active | IO              | 00:43:30 | SELECT creator_id, count(*) FROM links JOIN clicks USING (lin
 51877 | active |                 | 00:00:00 | SELECT url FROM links WHERE slug = $1"""),
            cmd('locks', 'postgres', 'SELECT pid, mode, granted FROM pg_locks WHERE relation = \'links\'::regclass ORDER BY granted DESC, pid LIMIT 5;', """
  pid  |        mode         | granted
-------+---------------------+---------
 48211 | AccessShareLock     | t
 48990 | AccessExclusiveLock | f
 49102 | AccessShareLock     | f
 49103 | AccessShareLock     | f
 49104 | RowExclusiveLock    | f"""),
            cmd('blocking', 'postgres', 'SELECT pid, pg_blocking_pids(pid) FROM pg_stat_activity WHERE pid IN (48990, 49102);', """
  pid  | pg_blocking_pids
-------+------------------
 48990 | {48211}
 49102 | {48990}"""),
            cmd('deploy', 'deploys', 'git log --oneline -3 origin/main', """
a91f2c0 links: add archived flag (migration 0142)
7d03b11 analytics: creator leaderboard export
e48a2b9 redirects: cache negative lookups"""),
            cmd('pool', 'app', 'curl -s localhost:9127/metrics | grep pgbouncer_pools_client', """
pgbouncer_pools_client_active_connections{database="ripple"} 100
pgbouncer_pools_client_waiting_connections{database="ripple"} 412
pgbouncer_pools_server_active_connections{database="ripple"} 100""", """
pgbouncer_pools_client_active_connections{database="ripple"} 23
pgbouncer_pools_client_waiting_connections{database="ripple"} 0"""),
            cmd('cpu', 'node', 'top -b -n1 | head -5   (on the database host)', """
top - 14:12:03 up 61 days,  load average: 1.12, 1.08, 0.97
%Cpu(s):  6.1 us,  1.2 sy,  0.0 ni, 92.3 id,  0.4 wa
MiB Mem :  64221.4 total,   2210.8 free,  18744.2 used,  43266.4 buff/cache"""),
        ],
        'actions': [
            act('restartapp', 'Restart the API pods', 'none', 'New pods connect, send their first query, and join the same lock queue. Nothing changes.'),
            act('scaleapp', 'Scale the API to 20 pods', 'worse', 'More pods, more connections, all waiting on the same lock. pgbouncer\'s queue doubles.'),
            act('cancelalter', 'SELECT pg_cancel_backend(48990)  (the ALTER)', 'fix', 'The ALTER is cancelled. Its place in the lock queue frees up and 400 queued queries run in a second. Latency is back to normal.', minutes=1),
            act('killreport', 'SELECT pg_terminate_backend(48211)  (the 41-minute report)', 'fix', 'The report dies, the ALTER gets its lock, finishes in 40 ms, and the queue drains. Site back. The analytics team will ask where their export went.', minutes=1),
            act('restartdb', 'Restart Postgres', 'outage', 'Postgres restarts: 90 seconds of total outage, every connection dropped, then everything comes back. It worked, the hard way.', minutes=4, risky=True),
            act('vacuum', 'VACUUM ANALYZE links', 'none', 'The VACUUM itself waits in the lock queue behind the ALTER. Nothing moves.'),
        ],
        'diagnosis': {'prompt': 'Why did adding a column take everything down?', 'answer': 0, 'choices': [
            'The ALTER waits for an ACCESS EXCLUSIVE lock behind a 41-minute report query, and every query on links queues behind the waiting ALTER until the pool is exhausted',
            'Adding a NOT NULL column with a default rewrites the whole table, which pins the CPU',
            'The report query is so heavy that it starves the database of I/O',
            'pgbouncer crashed and stopped handing out connections'],
            'explain': 'The database CPU is idle; everything is waiting on a lock. pg_blocking_pids shows the chain: report → ALTER → everyone. Lock requests queue in order, so a waiting ACCESS EXCLUSIVE blocks even plain SELECTs that would not conflict with the report.'},
        'fix': {'prompt': 'What stops this happening again?', 'answer': 3, 'choices': [
            'Never run migrations during the day',
            'Give pgbouncer a much bigger pool',
            'Run every migration inside a long transaction so it can be rolled back',
            'Set a short lock_timeout on migrations and retry them, and keep long analytics queries off the primary (a replica, with statement_timeout)'],
            'explain': 'With lock_timeout = 2s the ALTER gives up instead of queueing everyone behind it, and a retry loop gets it in when the table is quiet. Long reports belong on a replica.'},
        'hints': ['The database is idle. What is everything waiting for?', 'Who is blocking whom?'],
        'truth': 'pid 48211 is a 41-minute analytics report (SELECT on links JOIN clicks) holding AccessShareLock on links. Migration 0142 (pid 48990) runs ALTER TABLE links ADD COLUMN archived boolean NOT NULL DEFAULT false, which needs AccessExclusiveLock and is queued behind the report. Every later query on links (reads and writes) queues behind the ALTER. pgbouncer has 100 server connections all stuck and 412 clients waiting. Database CPU is idle (92% idle); memory and disk are fine. Postgres 16, so the ADD COLUMN with a constant default is metadata-only and would take milliseconds once it has the lock.',
        'debrief': 'A one-line migration waited for its lock behind a long report, and Postgres queued every other query behind the waiting migration. Nothing was busy; everything was waiting.',
    },
    {
        'id': 'frozenloop', 'title': 'Every endpoint got slow at once', 'kicker': 'An async service, a new feature, and CPU at 4%.',
        'lessons': ['python-runtime'], 'clock': '19:40', 'par': 7,
        'impact': {'unit': 'slow or failed requests', 'perMin': 900},
        'points': [F + 'python-runtime.event-loop-cooperative', F + 'python-runtime.blocking-call-freezes-loop', F + 'python-runtime.offload-blocking-work'],
        'page': 'FIRING  previews: p99 latency 9.8s (threshold 500ms)\nFIRING  previews: health check timeouts on 3/6 pods',
        'opening': [{'who': 'priya', 'text': 'The link-preview service is crawling. All endpoints, even /healthz. CPU is low, memory is flat. It was fine this morning.'}],
        'timeline': [{'at': 4, 'who': 'sam', 'text': 'Previews spin forever in the app. Not the end of the world, but it looks broken.'},
                     {'at': 8, 'who': 'marcus', 'text': 'Kubernetes has started restarting pods for failing health checks. That will not help, I assume.'}],
        'commands': [
            cmd('latency', 'metrics', 'curl -s previews:9100/metrics | grep -E "latency_p99|inflight"', """
http_latency_p99_seconds{route="/healthz"} 8.91
http_latency_p99_seconds{route="/preview"} 9.83
http_latency_p99_seconds{route="/oembed"} 9.12
http_inflight_requests 486""", """
http_latency_p99_seconds{route="/healthz"} 0.004
http_latency_p99_seconds{route="/preview"} 0.41
http_inflight_requests 31"""),
            cmd('top', 'node', 'top -b -n1 -p $(pgrep -f uvicorn) | tail -2', """
  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
    1 app       20   0  412988  98144  14012 S   4.0   1.2  12:03.55 uvicorn"""),
            cmd('pyspy', 'python', 'py-spy dump --pid 1', """
Thread 0x7F2B1C (idle): "MainThread"
    recv_into (ssl.py:1314)
    readinto (socket.py:720)
    _read_status (http/client.py:292)
    getresponse (http/client.py:1428)
    urlopen (urllib3/connectionpool.py:791)
    send (requests/adapters.py:589)
    get (requests/api.py:73)
    fetch_favicon (previews/favicon.py:18)
    build_preview (previews/handlers.py:44)
    run (asyncio/events.py:84)
    _run_once (asyncio/base_events.py:1936)"""),
            cmd('diff', 'deploys', 'git show --stat HEAD && git show HEAD -- previews/favicon.py | tail -8', """
commit 3e7d1aa  previews: show site favicons
 previews/favicon.py  | 21 +++++
 previews/handlers.py |  3 +-
+import requests
+
+async def fetch_favicon(url):
+    r = requests.get(urljoin(url, "/favicon.ico"), timeout=8)
+    return r.content if r.ok else None"""),
            cmd('logs', 'app', 'kubectl logs deploy/previews --since=2m | grep -c "favicon timeout"', """
1184"""),
        ],
        'actions': [
            act('restart', 'Restart the pods', 'none', 'Fresh pods are fast for about twenty seconds, until the first few previews hit slow favicon hosts. Then they freeze again.'),
            act('scale', 'Scale from 6 to 18 pods', 'temp', 'Each pod still freezes, but there are three times as many, so latency drops to "bad" instead of "broken". It\'s spending money on a bug.', relapse=25),
            act('workers', 'Run uvicorn with 4 workers per pod', 'temp', 'Four event loops per pod instead of one: things improve a little, and each loop still freezes the same way.', relapse=25),
            act('rollback', 'Roll back to the previous release', 'fix', 'Favicons are gone, and so is the problem: p99 back to 400 ms within a minute.', minutes=2),
            act('flag', 'Turn off the favicon feature flag', 'fix', 'The flag stops the favicon fetch. Latency recovers immediately, and the rest of the release stays out.', minutes=1),
            act('timeout', 'Lower the favicon timeout to 1 s', 'temp', 'Each blocking call is shorter, so the freezes are shorter. Still every request on the pod waits for each favicon fetch, one at a time.', relapse=20),
        ],
        'diagnosis': {'prompt': 'Why is every endpoint slow, even /healthz?', 'answer': 2, 'choices': [
            'The new feature is CPU-heavy, and the GIL stops the other requests from running',
            'The favicon hosts are rate-limiting us, so the requests queue at the load balancer',
            'fetch_favicon calls requests.get, a blocking call, inside async code: while it waits on the network the single event loop can run nothing else',
            'The pods are out of file descriptors because of the new outbound connections'],
            'explain': 'py-spy shows the main thread (the event loop) sitting in a socket read inside requests.get. An async def that calls a synchronous library still blocks the loop, so every other request, including the health check, waits behind it.'},
        'fix': {'prompt': 'What is the right fix for the feature?', 'answer': 0, 'choices': [
            'Use an async HTTP client (httpx.AsyncClient) with a short timeout, or run the blocking call with await asyncio.to_thread(...)',
            'Add more uvicorn workers so a frozen loop matters less',
            'Cache favicons forever so the call happens less often',
            'Switch the service to threads instead of asyncio'],
            'explain': 'Await something that actually yields: an async client, or offload blocking work to a thread pool. More workers only hides it until traffic grows.'},
        'hints': ['Low CPU, high latency, every route at once: what can one call do to a whole asyncio process?', 'Look at what the main thread is doing right now.'],
        'truth': 'The previews service is a single-process uvicorn asyncio app per pod (6 pods). Release 3e7d1aa added fetch_favicon, an async def that calls requests.get(timeout=8), a blocking call. Many favicon hosts are slow, so each call blocks the event loop for seconds; every request on that pod, including /healthz, waits. CPU is ~4%, memory flat, file descriptors fine. A feature flag previews.favicons exists and is on.',
        'debrief': 'One synchronous HTTP call inside async code held the event loop, so the whole service waited on slow favicon hosts. Low CPU with every route slow is the signature.',
    },
    {
        'id': 'fdleak', 'title': 'Too many open files', 'kicker': 'It works after a restart. For about forty minutes.',
        'lessons': ['linux-processes'], 'clock': '03:27', 'par': 8,
        'impact': {'unit': 'failed webhooks', 'perMin': 400},
        'points': [F + 'linux-processes.fd-limit-leak', F + 'linux-processes.fd-leak-vs-limit'],
        'page': 'FIRING  webhooks: delivery failures 22% (threshold 1%)',
        'opening': [{'who': 'priya', 'text': 'Webhook deliveries failing again. Last night someone restarted it and it went away, so we never looked. I\'d like us to look.'}],
        'timeline': [{'at': 6, 'who': 'sam', 'text': 'Two big partners say they\'re missing click webhooks. They reconcile in the morning and they will notice.'}],
        'commands': [
            cmd('logs', 'app', 'journalctl -u webhooks --since "10 min ago" | tail -4', """
03:26:58 webhooks[2210]: ERROR deliver partner=acme: [Errno 24] Too many open files
03:26:58 webhooks[2210]: ERROR deliver partner=zeta: [Errno 24] Too many open files
03:26:59 webhooks[2210]: ERROR accept: OSError: [Errno 24] Too many open files
03:27:01 webhooks[2210]: INFO  deliver partner=acme 200 (retry 3)"""),
            cmd('count', 'linux', 'for i in 1 2 3; do ls /proc/2210/fd | wc -l; sleep 60; done', """
1019
1022
1024""", """
212
211
213""", minutes=3),
            cmd('limits', 'linux', "grep 'open files' /proc/2210/limits", """
Max open files            1024                 1024                 files"""),
            cmd('lsof', 'linux', 'lsof -p 2210 | awk \'{print $5}\' | sort | uniq -c | sort -rn | head -4', """
    962 IPv4
     31 REG
     18 unix
      9 FIFO"""),
            cmd('ss', 'linux', 'ss -tanp | grep 2210 | awk \'{print $1}\' | sort | uniq -c', """
    941 CLOSE-WAIT
     21 ESTAB"""),
            cmd('code', 'app', 'grep -n "Session\\|close" webhooks/deliver.py', """
14:    s = requests.Session()
15:    s.mount("https://", HTTPAdapter(max_retries=3))
22:    resp = s.post(hook.url, json=payload, timeout=10)
(no close)"""),
        ],
        'actions': [
            act('restart', 'systemctl restart webhooks', 'temp', 'Fresh process, 40 descriptors. Deliveries recover. The count starts climbing again at about 20 a minute.', relapse=40),
            act('ulimit', 'Raise LimitNOFILE to 65536 and restart', 'temp', 'Plenty of room now: at this rate it takes two days to fill. It will, though.', minutes=3, relapse=120),
            act('patch', 'Deploy the fix: one shared Session, created at start-up', 'fix', 'One pooled session reuses a handful of connections. The descriptor count sits flat at about 210.', minutes=4),
            act('kill9', 'kill -9 2210', 'outage', 'The process dies mid-delivery: in-flight webhooks are lost and systemd restarts it. Same as a restart, minus the clean shutdown.', minutes=1, risky=True),
        ],
        'diagnosis': {'prompt': 'What is going on?', 'answer': 3, 'choices': [
            'The service handles more partners than 1024 descriptors allow: the limit is too low for the load',
            'A partner\'s endpoint is slow, so connections pile up waiting',
            'The disk is full, so new files cannot be opened',
            'Each delivery creates a new requests.Session and never closes it, so sockets leak (CLOSE-WAIT) until the 1024 limit is hit'],
            'explain': 'The count climbs steadily and never falls, and almost all of it is sockets in CLOSE-WAIT: the far end closed, we never did. A high but flat count would mean the limit is too low; a climbing one is a leak.'},
        'fix': {'prompt': 'What is the lasting fix?', 'answer': 1, 'choices': [
            'Raise the limit to 1,000,000 so it never matters',
            'Share one Session (a connection pool) across deliveries, or close each one with a context manager; alert on descriptor count against the limit',
            'Restart the service every 30 minutes with a timer',
            'Lower the delivery timeout so connections close sooner'],
            'explain': 'Fix the leak, then watch it: the descriptor count as a share of the limit is a cheap, early alert.'},
        'hints': ['Is the descriptor count high and flat, or climbing?', 'What state are those sockets in?'],
        'truth': 'The webhooks service (pid 2210, Python) creates a new requests.Session for every delivery and never closes it, leaking a socket per delivery that ends in CLOSE-WAIT. It leaks about 20 descriptors a minute; the limit is 1024, so it fails roughly 45 minutes after each restart. Load is normal. Disk is fine.',
        'debrief': 'Every delivery opened a new session and never closed it, so sockets piled up in CLOSE-WAIT until the process hit its 1024-descriptor limit. Restarting hid it for forty minutes at a time.',
    },
    {
        'id': 'poolqueue', 'title': 'Latency up, CPU idle', 'kicker': 'A Java service waiting politely in line.',
        'lessons': ['java-concurrency'], 'clock': '11:05', 'par': 8,
        'impact': {'unit': 'checkout calls over 2 s', 'perMin': 700},
        'points': [F + 'java-concurrency.pool-growth-rule', F + 'java-concurrency.bounded-queue-rejection-policy', F + 'java-concurrency.pool-sizing-formula'],
        'page': 'FIRING  payouts-api: p99 latency 14.2s (threshold 1s)\nWARN    fraud-check provider: p50 latency 1.9s (usually 120ms)',
        'opening': [{'who': 'priya', 'text': 'Payouts are slow. The fraud-check provider is having a bad morning, but we time out at 3 s, so I don\'t get why we\'re at 14.'}],
        'timeline': [{'at': 5, 'who': 'marcus', 'text': 'Creators are getting paid late. That\'s the one thing we promised them.'}],
        'commands': [
            cmd('metrics', 'metrics', 'curl -s payouts:8081/actuator/metrics/executor.* | jq ...', """
executor.pool.size        {name="fraudPool"}   8
executor.pool.max         {name="fraudPool"}   64
executor.active           {name="fraudPool"}   8
executor.queued           {name="fraudPool"}   6214
executor.completed.rate   {name="fraudPool"}   4.1/s""", """
executor.pool.size        {name="fraudPool"}   48
executor.active           {name="fraudPool"}   41
executor.queued           {name="fraudPool"}   0"""),
            cmd('config', 'app', 'grep -A6 "fraudPool" src/main/java/com/ripple/payouts/Executors.java', """
new ThreadPoolExecutor(
    8,                         // corePoolSize
    64,                        // maximumPoolSize
    60, TimeUnit.SECONDS,
    new LinkedBlockingQueue<>(),   // unbounded
    new ThreadPoolExecutor.AbortPolicy());"""),
            cmd('jstack', 'jvm', 'jstack 1 | grep -A3 "fraudPool" | head -8', """
"fraudPool-3" #41 prio=5 os_prio=0 tid=0x... nid=0x2c waiting on condition
   java.lang.Thread.State: TIMED_WAITING (parking)
        at jdk.internal.misc.Unsafe.park(Native Method)
        at java.net.http.HttpClientImpl.send(HttpClientImpl.java:556)
(8 threads, all in HttpClient.send to fraud.example)"""),
            cmd('cpu', 'node', 'top -b -n1 | head -4', """
%Cpu(s):  7.4 us,  0.9 sy,  0.0 ni, 91.2 id
MiB Mem :  16023.0 total,   9124.2 free"""),
            cmd('arrivals', 'metrics', 'curl -s payouts:8081/actuator/metrics/payouts.submitted.rate', """
payouts.submitted.rate  42/s"""),
        ],
        'actions': [
            act('max', 'Raise maximumPoolSize to 256', 'none', 'Nothing changes. With an unbounded queue the offer never fails, so the pool never grows past its core size of 8.'),
            act('core', 'Raise corePoolSize to 64 (hot config reload)', 'fix', 'Eight threads become 64. Each waits about 1.9 s on the provider, so 64 threads handle about 33 checks a second; the queue drains in a few minutes.', minutes=3),
            act('restart', 'Restart the service', 'worse', 'The queued payouts were in memory: 6,214 of them are gone and have to be replayed from the ledger. The new process fills its queue again within minutes.', risky=True),
            act('timeout', 'Lower the fraud-check timeout to 500 ms', 'temp', 'Calls fail faster, so the queue drains, but most fraud checks now time out and payouts are held for manual review.', relapse=30),
            act('bound', 'Bound the queue at 500 with CallerRunsPolicy', 'temp', 'Back-pressure: submitters slow down instead of piling work into memory. The backlog stops growing, but it is still 8 threads against 42 a second.', relapse=30),
        ],
        'diagnosis': {'prompt': 'Why is latency 14 s when the provider only takes 2?', 'answer': 1, 'choices': [
            'The provider is rate-limiting us, so most calls wait for a token',
            'With 8 threads each blocked about 2 s on the slow provider, the pool does 4 checks a second against 42 arriving; the rest wait in an unbounded queue, and the pool never grows because the queue never fills',
            'Garbage collection pauses are holding up all the threads',
            'The 3 s timeout is not being applied, so calls hang forever'],
            'explain': 'ThreadPoolExecutor queues first and grows second. An unbounded LinkedBlockingQueue never rejects an offer, so maximumPoolSize is dead config: you stay at core size and the queue absorbs the overload as latency.'},
        'fix': {'prompt': 'What should the pool look like?', 'answer': 2, 'choices': [
            'Keep the unbounded queue and raise maximumPoolSize further',
            'Use Executors.newCachedThreadPool() so threads are unlimited',
            'Size core threads for the blocking calls (threads ≈ arrival rate × wait time), bound the queue with a deliberate rejection policy, and put a circuit breaker on the provider',
            'Move fraud checks onto the common ForkJoinPool'],
            'explain': 'Little\'s law sizes it: 42/s × 2 s needs about 84 threads in flight (or virtual threads). A bounded queue makes overload visible, and a breaker stops a slow provider from taking you down with it.'},
        'hints': ['How many threads are actually running, and why not more?', 'When does a ThreadPoolExecutor add threads beyond its core size?'],
        'truth': 'payouts-api uses a ThreadPoolExecutor(core 8, max 64, unbounded LinkedBlockingQueue, AbortPolicy) for fraud checks. The fraud provider\'s latency rose from 120ms to ~1.9s (still under the 3s timeout). 8 threads × (1/1.9s) ≈ 4 checks/s against 42/s submitted, so 6,000+ tasks queue in memory and latency grows. Because the queue is unbounded, the pool never grows past 8. CPU is idle; GC is normal.',
        'debrief': 'A slow provider plus a pool that queues first and grows second: eight threads did all the work while thousands of payouts waited in an unbounded queue, and maximumPoolSize never came into play.',
    },
    {
        'id': 'natroute', 'title': 'Payments cannot reach the bank', 'kicker': 'A tidy-up Terraform change and a lot of timeouts.',
        'lessons': ['aws-core', 'cicd-iac'], 'clock': '16:48', 'par': 7,
        'impact': {'unit': 'failed payouts', 'perMin': 250},
        'points': [F + 'aws-core.nat-gateway-outbound', F + 'aws-core.public-vs-private-subnet', F + 'cicd-iac.plan-in-pr-apply-in-ci'],
        'page': 'FIRING  payouts-worker: bank API calls failing 100% (connect timeout)',
        'opening': [{'who': 'priya', 'text': 'Every call to the bank\'s API is timing out. Their status page is green. Internal stuff seems fine.'}],
        'timeline': [{'at': 5, 'who': 'jo', 'text': 'Oh, I applied my Terraform cleanup about twenty minutes ago. It was only removing unused things. I think.'}],
        'commands': [
            cmd('curl', 'network', 'kubectl exec deploy/payouts-worker -- curl -sS -m 5 https://api.bank.example/health', """
curl: (28) Connection timed out after 5001 milliseconds""", """
{"status":"ok"}"""),
            cmd('internal', 'network', 'kubectl exec deploy/payouts-worker -- curl -sS -m 5 http://ledger.internal/health', """
{"status":"ok"}"""),
            cmd('routes', 'aws', 'aws ec2 describe-route-tables --filters Name=tag:Name,Values=private-a --query "RouteTables[].Routes"', """
[
  { "DestinationCidrBlock": "10.20.0.0/16", "GatewayId": "local", "State": "active" }
]""", """
[
  { "DestinationCidrBlock": "10.20.0.0/16", "GatewayId": "local", "State": "active" },
  { "DestinationCidrBlock": "0.0.0.0/0", "NatGatewayId": "nat-0a41f", "State": "active" }
]"""),
            cmd('nat', 'aws', 'aws ec2 describe-nat-gateways --query "NatGateways[].[NatGatewayId,State,SubnetId]"', """
[ [ "nat-0a41f", "available", "subnet-public-a" ] ]"""),
            cmd('sg', 'aws', 'aws ec2 describe-security-groups --group-ids sg-payouts --query "SecurityGroups[].IpPermissionsEgress"', """
[ [ { "IpProtocol": "-1", "IpRanges": [ { "CidrIp": "0.0.0.0/0" } ] } ] ]"""),
            cmd('tflog', 'terraform', 'git log -1 -p infra/network/routes.tf | head -14', """
commit 5b1e7f2  network: remove unused routes (jo)
-resource "aws_route" "private_a_default" {
-  route_table_id         = aws_route_table.private_a.id
-  destination_cidr_block = "0.0.0.0/0"
-  nat_gateway_id         = aws_nat_gateway.a.id
-}
 (applied from a laptop: terraform apply -auto-approve)"""),
        ],
        'actions': [
            act('restart', 'Restart the payouts workers', 'none', 'Same timeouts. The pods are fine; their packets have nowhere to go.'),
            act('sgopen', 'Open the security group egress wider', 'none', 'Egress was already 0.0.0.0/0. The packets leave the instance and find no route.'),
            act('publicip', 'Move the workers into the public subnet with public IPs', 'outage', 'It works after a messy redeploy, and your payout workers are now directly on the internet. Priya winces.', minutes=6, risky=True),
            act('route', 'Restore 0.0.0.0/0 → nat-0a41f on the private route table', 'fix', 'The route is back. The next call to the bank succeeds; the retry queue drains in two minutes.', minutes=2),
            act('revert', 'Revert the Terraform commit and apply it through CI', 'fix', 'CI shows the plan: one route to add. Applied. Calls to the bank recover, and the change is on the record.', minutes=4),
        ],
        'diagnosis': {'prompt': 'Why can the workers reach the ledger but not the bank?', 'answer': 0, 'choices': [
            'The Terraform cleanup deleted the private subnet\'s default route to the NAT gateway, so traffic for the internet has nowhere to go while traffic inside the VPC still works',
            'The NAT gateway has failed and needs replacing',
            'The workers\' security group blocks outbound traffic to the internet',
            'The bank has blocked our IP address'],
            'explain': 'Only the local 10.20.0.0/16 route is left. Inside the VPC still works; anything else is dropped. The NAT gateway itself is healthy and the security group allows all egress.'},
        'fix': {'prompt': 'What process change stops this one?', 'answer': 3, 'choices': [
            'Ban deleting resources from Terraform',
            'Give the workers public IPs so they never depend on NAT',
            'Run terraform apply only at night',
            'Plan in the pull request so reviewers see "destroy: aws_route.private_a_default", apply only from CI, and alert on egress failures from private subnets'],
            'explain': 'The plan would have shown a route being destroyed. Applying from laptops with -auto-approve skips the one moment where someone would have noticed.'},
        'hints': ['What still works, and what doesn\'t? What do those two have in common?', 'Follow the packet: instance, subnet route table, then?'],
        'truth': 'Terraform commit 5b1e7f2 (applied from a laptop with -auto-approve) removed aws_route.private_a_default (0.0.0.0/0 → nat-0a41f) from the private subnet route table. The NAT gateway is still available in the public subnet. Security group egress allows everything. Internal VPC traffic (10.20.0.0/16) works; anything to the internet times out. The bank is healthy and has not blocked anyone.',
        'debrief': 'A cleanup removed the private subnet\'s default route to the NAT gateway. Traffic inside the VPC kept working, so it looked like the bank was down, but nothing could leave.',
    },
    {
        'id': 'flapping', 'title': 'Down every two minutes', 'kicker': 'The deploy that kept undoing itself, and doing itself again.',
        'lessons': ['home-lab', 'cicd-iac'], 'clock': '22:10', 'par': 6,
        'impact': {'unit': 'minutes of downtime', 'perMin': 0.5},
        'points': [F + 'home-lab.failed-commit-retry-storm', F + 'home-lab.health-check-gates-deploy', F + 'home-lab.immutable-image-rollback'],
        'page': 'FIRING  uptime: leetcode.example is down (3rd time in 10 min)\nRESOLVED uptime: leetcode.example is up',
        'opening': [{'who': 'priya', 'text': 'The home box keeps flapping. Down for a minute and a half, up for half a minute, down again. Like clockwork.'}],
        'timeline': [{'at': 4, 'who': 'sam', 'text': 'It\'s 10pm, nobody\'s using it, but the uptime monitor is very upset.'}],
        'commands': [
            cmd('deploylog', 'deploys', 'journalctl -u deploy@leetcode --since "15 min ago" | grep -E "new commit|healthy|rolling back"', """
22:00:02 new commit 9c4e1ab, building
22:01:34 not healthy after 90s, rolling back to :previous
22:02:02 new commit 9c4e1ab, building
22:03:33 not healthy after 90s, rolling back to :previous
22:04:01 new commit 9c4e1ab, building
22:05:32 not healthy after 90s, rolling back to :previous""", """
22:12:02 new commit 3d0f9e2, building
22:12:31 healthy: :current is 3d0f9e2"""),
            cmd('logs', 'docker', 'docker logs leetcode-senpai --since 3m 2>&1 | tail -4', """
Traceback (most recent call last):
  File "/app/server/config.py", line 31, in <module>
    TUTOR_NOTES_MODEL = os.environ["TUTOR_NOTES_MODEL"]
KeyError: 'TUTOR_NOTES_MODEL'"""),
            cmd('timer', 'deploys', 'systemctl list-timers | grep deploy', """
22:06:00  1min left  22:04:00  58s ago  infra-deploy@leetcode.timer"""),
            cmd('commit', 'git', 'git log -1 --stat origin/main', """
commit 9c4e1ab  config: read the notes model from the environment
 server/config.py | 2 +-"""),
            cmd('ps', 'docker', 'docker ps --format "{{.Names}} {{.Image}} {{.Status}}" | grep leetcode', """
leetcode-senpai ripple/leetcode:previous Up 21 seconds (healthy)"""),
        ],
        'actions': [
            act('stoptimer', 'Stop the deploy timer', 'temp', 'The flapping stops: :previous stays up. Nothing deploys now, including the fix whenever it lands.', relapse=60, minutes=1),
            act('env', 'Add TUTOR_NOTES_MODEL to the stack\'s env file', 'fix', 'The next poll builds 9c4e1ab again, and this time it starts and passes its health check. Stable on the new commit.', minutes=3),
            act('revert', 'git revert 9c4e1ab and push', 'fix', 'The next poll sees a new commit, builds it, it\'s healthy. Stable. The config change will need to come back properly.', minutes=3),
            act('restart', 'docker restart leetcode-senpai', 'none', 'It restarts :previous, which was already fine. Two minutes later the timer tries 9c4e1ab again.'),
            act('force', 'Force-start 9c4e1ab and skip the health check', 'outage', 'The container crash-loops on the missing variable, and with the health check skipped nothing rolls it back. Down until you undo it.', risky=True, minutes=2),
        ],
        'diagnosis': {'prompt': 'Why does the site go down every two minutes?', 'answer': 2, 'choices': [
            'The box is running out of memory and the container is OOM-killed',
            'The health check is too strict and fails healthy containers',
            'Commit 9c4e1ab crashes on start (a missing environment variable), so each poll deploys it, it fails the health check and rolls back, and the next poll sees the same "new" commit and tries again',
            'Docker\'s restart policy keeps restarting a crashed container'],
            'explain': 'The rollback works, but the deploy only records a commit once it succeeds, so main still looks new two minutes later. Automatic recovery that repeats the failure is a retry storm.'},
        'fix': {'prompt': 'What should the deploy script do differently?', 'answer': 1, 'choices': [
            'Poll less often, every 30 minutes',
            'Remember a commit that failed its health check and don\'t retry it until main moves on, and alert when that happens',
            'Remove the health check so deploys always go through',
            'Retry failed commits with exponential backoff'],
            'explain': 'One failure, one rollback, one alert. Backoff still retries the same broken image; remembering it stops the storm.'},
        'hints': ['What happens on every poll? What does the poll think it\'s looking at?'],
        'truth': 'The home box polls GitHub every 2 minutes. Commit 9c4e1ab reads TUTOR_NOTES_MODEL from the environment, which is not set on the box, so the container crashes on start. Each poll builds it, waits 90s for health, fails, and rolls back to :previous. The deploy only records successful commits, so the next poll retries the same commit. Memory and disk are fine.',
        'debrief': 'A commit that crashed on start was deployed, rolled back, and deployed again every two minutes, because the deploy never remembered that it had failed.',
    },
    {
        'id': 'zombies', 'title': 'fork: Resource temporarily unavailable', 'kicker': 'A container slowly filling up with the dead.',
        'lessons': ['linux-processes', 'kubernetes'], 'clock': '05:51', 'par': 8,
        'impact': {'unit': 'failed thumbnail jobs', 'perMin': 120},
        'points': [F + 'linux-processes.zombie-processes', F + 'linux-processes.pid1-signal-handling', F + 'linux-processes.pid1-shell-init-fix'],
        'page': 'FIRING  thumbnails: job failures 48%\n        error: fork: Resource temporarily unavailable',
        'opening': [{'who': 'priya', 'text': 'Thumbnail workers can\'t start ffmpeg any more. It\'s been getting worse all night. Memory and CPU look normal.'}],
        'timeline': [{'at': 6, 'who': 'sam', 'text': 'New uploads have grey boxes instead of thumbnails.'}],
        'commands': [
            cmd('ps', 'linux', 'kubectl exec deploy/thumbs -- ps -eo pid,ppid,stat,comm | head -8', """
  PID  PPID STAT COMMAND
    1     0 Ssl  python
   41     1 Z    ffmpeg <defunct>
   42     1 Z    ffmpeg <defunct>
   57     1 Z    ffmpeg <defunct>
   63     1 Z    ffmpeg <defunct>
   71     1 Z    sh <defunct>
(4,087 more)""", """
  PID  PPID STAT COMMAND
    1     0 Ss   tini
    7     1 Ssl  python
 9911     7 R    ffmpeg"""),
            cmd('count', 'linux', "kubectl exec deploy/thumbs -- sh -c 'ps -eo stat | grep -c ^Z; cat /sys/fs/cgroup/pids.max'", """
4093
4096"""),
            cmd('dockerfile', 'app', 'tail -3 thumbs/Dockerfile', """
COPY . /app
WORKDIR /app
CMD ["python", "-m", "thumbs.worker"]"""),
            cmd('code', 'app', 'grep -n "Popen\\|wait" thumbs/render.py', """
33:    proc = subprocess.Popen(["sh", "-c", f"ffmpeg -i {src} ... {dst} &"])
34:    return  # ffmpeg runs in the background; the shell exits at once"""),
            cmd('mem', 'kubectl', 'kubectl top pod -l app=thumbs', """
NAME                      CPU(cores)   MEMORY(bytes)
thumbs-6d8f7c9b5-x2l9k    310m         402Mi"""),
        ],
        'actions': [
            act('restart', 'Restart the pods', 'temp', 'A new PID namespace: zero zombies, jobs work again. They start piling up at about 500 an hour.', relapse=45),
            act('pidsmax', 'Raise the pod\'s pids limit to 32768', 'temp', 'Room for eight times as many zombies. It buys most of a day.', relapse=90, minutes=3),
            act('tini', 'Add tini as PID 1 (ENTRYPOINT ["tini", "--"]) and roll out', 'fix', 'tini reaps every orphan that lands on it. The zombie count stays at zero, and SIGTERM now reaches the worker too.', minutes=4),
            act('killzombies', 'kill -9 every <defunct> process', 'none', 'Nothing happens: zombies are already dead. Only their parent calling wait() removes them, and their parent is PID 1.'),
        ],
        'diagnosis': {'prompt': 'Why can\'t the container start new processes?', 'answer': 3, 'choices': [
            'ffmpeg is leaking memory, so the container cannot allocate more',
            'The node has run out of PIDs because other pods are busy',
            'Each ffmpeg is still running in the background and they never finish',
            'Each job\'s shell exits at once, orphaning ffmpeg onto PID 1 (the Python worker), which never wait()s for children it didn\'t start, so finished ffmpegs stay zombies until the pids limit is full'],
            'explain': 'The Z state means exited but not reaped, and their parent is PID 1. A normal app as PID 1 doesn\'t reap orphans; an init does. 4,093 zombies against a pids.max of 4,096 is the whole story.'},
        'fix': {'prompt': 'What is the lasting fix?', 'answer': 0, 'choices': [
            'Run a real init as PID 1 (tini, or docker run --init), and have the worker wait for its own subprocesses instead of backgrounding them through a shell',
            'Restart the workers every hour with a CronJob',
            'Raise pids.max as high as the node allows',
            'Run ffmpeg in a separate pod'],
            'explain': 'An init reaps orphans and forwards signals. And code that starts a child should wait() for it: subprocess.run, or keep the Popen and call wait.'},
        'hints': ['What does STAT Z mean, and who is their parent?', 'What is PID 1 in this container, and what is PID 1 expected to do?'],
        'truth': 'The thumbs worker runs as PID 1 (exec-form CMD, Python). For each job it runs sh -c "ffmpeg ... &": the shell exits immediately, orphaning ffmpeg, which is re-parented to PID 1. When ffmpeg finishes it becomes a zombie because the Python worker never waits for children it did not start. Zombies accumulate (~500/hour) until the cgroup pids.max (4096) is reached; then fork fails. Memory and CPU are normal.',
        'debrief': 'Every job orphaned an ffmpeg onto PID 1, the worker, which never reaped them. Thousands of zombies later the container hit its process limit and could not fork.',
    },
]


def build():
    for i, l in enumerate(LEVELS):
        l['order'] = i + 1
        ids = [a['id'] for a in l['actions']]
        assert any(a['effect'] == 'fix' for a in l['actions']), l['id']
        assert len(set(ids)) == len(ids) and len({c['id'] for c in l['commands']}) == len(l['commands']), l['id']
    return {'version': 1, 'cast': ['priya', 'sam', 'marcus', 'jo'], 'levels': LEVELS}


if __name__ == '__main__':
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(build(), fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'wrote {OUT}')
