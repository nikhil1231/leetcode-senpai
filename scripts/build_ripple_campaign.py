"""Write static/simulators/ripple.json: the Ripple Ops campaign for the design builder.

Authored content kept as Python so graphs stay short to write. Run it after editing, then
`node --test tests/test_sd_sim.cjs`, which checks every level is beatable with its reference
design and not with its starting one.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'static', 'simulators', 'ripple.json')


def g(nodes, edges, settings=None):
    """nodes: [(defId, col, row, cfg)], edges: [(i, j)] by 1-based index."""
    out = {'nodes': [], 'edges': []}
    for i, n in enumerate(nodes, 1):
        d, col, row = n[0], n[1], n[2]
        node = {'id': f'n{i}', 'defId': d, 'x': 40 + col * 190, 'y': 40 + row * 96}
        if len(n) > 3 and n[3]:
            node['cfg'] = n[3]
        out['nodes'].append(node)
    out['edges'] = [{'id': f'e{k}', 'from': f'n{a}', 'to': f'n{b}'} for k, (a, b) in enumerate(edges, 1)]
    if settings:
        out['settings'] = settings
    return out


CONCEPTS = {
    'estimates': {'label': 'Back-of-envelope estimates', 'lesson': 'estimates', 'sim': 'boe',
                  'points': ['sd.estimates.daily-to-per-second', 'sd.estimates.estimate-drives-decision']},
    'request-flow': {'label': 'The path of a request', 'lesson': 'request-flow', 'sim': 'http',
                     'points': ['sd.request-flow.request-hop-sequence', 'sd.request-flow.typical-latency-figures']},
    'scaling': {'label': 'Finding the bottleneck', 'lesson': 'scaling',
                'points': ['sd.scaling.throughput-is-narrowest-stage', 'sd.scaling.saturation-signals-bottleneck']},
    'balancing': {'label': 'Stateless servers behind a load balancer', 'lesson': 'stateless-balancing',
                  'points': ['sd.stateless-balancing.horizontal-scaling-shared-state', 'sd.request-flow.lb-health-and-request-id']},
    'caching': {'label': 'Cache-aside and hit rates', 'lesson': 'cache-aside', 'sim': 'cachestrategies',
                'points': ['sd.cache-aside.db-load-is-miss-rate', 'sd.cache-aside.cache-is-capacity-plan']},
    'hot-keys': {'label': 'Hot keys and stampedes', 'lesson': 'hot-keys', 'sim': 'cachestrategies',
                 'points': ['sd.hot-keys.sharding-spreads-keys-not-one-key', 'sd.hot-keys.local-l1-cache-for-hot-reads']},
    'consistent-hashing': {'label': 'Consistent hashing', 'lesson': 'consistent-hashing', 'sim': 'partitioning',
                           'points': ['sd.consistent-hashing.modulo-remaps-most-keys', 'sd.consistent-hashing.ring-add-moves-one-over-n']},
    'cdn': {'label': 'HTTP caching and CDNs', 'lesson': 'http-cdn', 'sim': 'http',
            'points': ['sd.http-cdn.private-vs-public', 'sd.http-cdn.two-cache-questions']},
    'rate-limiting': {'label': 'Rate limiting', 'lesson': 'rate-limiting',
                      'points': ['sd.rate-limiting.token-bucket-burst-rate', 'sd.overload.shed-early']},
    'retries': {'label': 'Retries and retry storms', 'lesson': 'retry-identity',
                'points': ['sd.retry-identity.backoff-with-jitter', 'sd.service-quality.retries-amplify-outages']},
    'overload': {'label': 'Overload, timeouts and circuit breakers', 'lesson': 'overload',
                 'points': ['sd.overload.bound-concurrency-and-queues', 'sd.overload.metastable-failure']},
    'queues': {'label': 'Queues, backlogs and workers', 'lesson': 'queue-basics', 'sim': 'pubsub',
               'points': ['sd.queue-basics.burst-absorption-isolation', 'sd.queue-basics.backlog-drain-rate']},
    'async': {'label': 'Synchronous or asynchronous work', 'lesson': 'sync-async',
              'points': ['sd.sync-async.sync-when-user-needs-answer', 'sd.sync-async.flaky-dependency-not-fail-action']},
    'dead-letters': {'label': 'Poison messages and dead letters', 'lesson': 'dead-letters',
                     'points': ['sd.dead-letters.poison-message-stalls-partition', 'sd.dead-letters.permanent-failures-dead-letter']},
    'object-storage': {'label': 'Object storage for bytes', 'lesson': 'object-storage',
                       'points': ['sd.object-storage.proxying-uploads-melts-api', 'sd.object-storage.bytes-vs-metadata-placement']},
    'storage': {'label': 'When the database is the bottleneck', 'lesson': 'partitioning', 'sim': 'sqlsharding',
                'points': ['sd.scaling.scaling-front-tier-overloads-database', 'sd.partitioning.shard-key-matches-access']},
    'partitioning': {'label': 'Sharding and shard keys', 'lesson': 'partitioning', 'sim': 'sqlsharding',
                     'points': ['sd.partitioning.shard-key-matches-access', 'sd.partitioning.hash-partitioning-tradeoffs']},
    'replication': {'label': 'Replication and failover', 'lesson': 'replication', 'sim': 'replanomalies',
                    'points': ['sd.replication.async-ack-loss-window', 'sd.replication.semi-sync-one-replica']},
    'recovery': {'label': 'Backups, RPO and RTO', 'lesson': 'recovery', 'sim': 'wal',
                 'points': ['sd.recovery.rpo-definition', 'sd.recovery.rto-definition']},
    'redundancy': {'label': 'Surviving a zone failure', 'lesson': 'stateless-balancing', 'sim': 'phiaccrual',
                   'points': ['sd.stateless-balancing.zone-failure-sizing', 'sd.service-quality.redundancy-independence']},
    'regions': {'label': 'Multiple regions', 'lesson': 'consistency', 'sim': 'cap',
                'points': ['sd.consistency.partition-tolerance-not-optional', 'sd.request-flow.rtt-physical-limit']},
    'observability': {'label': 'Monitoring and safe deploys', 'lesson': 'observability',
                      'points': ['sd.observability.four-golden-signals', 'sd.observability.metrics-for-is-it-wrong']},
    'search': {'label': 'Search indexes', 'lesson': 'search-index',
               'points': ['sd.search-index.like-leading-wildcard-scan', 'sd.search-index.search-load-isolation']},
    'realtime': {'label': 'Real-time delivery', 'lesson': 'realtime-push', 'sim': 'pubsub',
                 'points': ['sd.realtime-push.websockets-full-duplex', 'sd.realtime-push.pubsub-backplane-routing']},
    'geo': {'label': 'Geospatial indexes', 'lesson': 'geo-index',
            'points': ['sd.geo-index.two-btree-indexes-poor', 'sd.geo-index.geohash-structure']},
    'feed': {'label': 'Feed fan-out', 'lesson': 'feed-fanout',
             'points': ['sd.feed-fanout.push-write-cost-scales-followers', 'sd.feed-fanout.celebrity-problem']},
    'payments': {'label': 'Payments that never double-charge', 'lesson': 'design-payments', 'sim': 'twopc',
                 'points': ['sd.design-payments.timeout-is-unknown-outcome', 'sd.design-payments.persist-state-before-call']},
}

BASIC = ['client', 'app-server', 'db-sql', 'dns']
T2 = BASIC + ['load-balancer', 'cache', 'monitoring']
T3 = T2 + ['cdn', 'consistent-hash']
T4 = T3 + ['api-gateway', 'rate-limiter', 'auth-service']
T5 = T4 + ['message-queue', 'worker', 'dead-letter-queue', 'object-store', 'external-service', 'notification-service', 'email-server', 'db-timeseries', 'olap']
T6 = T5 + ['db-nosql', 'block-storage', 'id-generator']
T7 = T6 + ['service-discovery']
T8 = T7
T9 = T8 + ['search-engine', 'geospatial', 'recommendation', 'stream-processor', 'websocket-server', 'db-graph']
T10 = T9 + ['payment', 'reconciliation', 'spam-filter', 'matching-engine']

LEVELS = [
    {
        'id': 'garage', 'chapter': 'foundations', 'tier': 'Garage', 'users': '2k creators', 'title': 'Ripple v0',
        'kicker': 'Three people in a flat, one link shortener, and a credit card with a limit.',
        'brief': [
            {'who': 'marcus', 'text': "We launch to friends on Monday. Two thousand creators, maybe 150 clicks each a day. I've got $300 a month for infrastructure, and that's my personal card. Don't make me explain the bill to my partner."},
            {'who': 'sam', 'text': 'People paste a long link, get a short one, and clicks redirect. That\'s the whole product for now. Redirects should feel instant.'},
            {'who': 'jo', 'text': "I set the defaults on everything to 'medium' because it sounded safe. Was that... fine?"},
        ],
        'goal': 'Serve every redirect and new link with a client, an app server and a database, inside $300 a month.',
        'dau': 2000, 'traffic': {'read': {'perUser': 150, 'kb': 0.5, 'cacheable': 0.9, 'workingSetGb': 0.2}, 'write': {'perUser': 3, 'kb': 0.5}, 'peak': 2.4},
        'data': {'gb': 5}, 'slo': {'availability': 99.5, 'p99': {'read': 200, 'write': 400}, 'budget': 300},
        'events': [],
        'estimate': ['peakReadRps', 'storageGbYear'],
        'concepts': ['estimates', 'request-flow'], 'lessons': ['request-flow', 'estimates', 'numbers'], 'sims': ['boe', 'dns', 'http'],
        'toolbox': BASIC,
        'hints': ['Work out the peak requests per second first. It is far smaller than "two thousand users" makes it sound.',
                  'Click a component to pick its size. The medium sizes are built for traffic you don\'t have yet.',
                  'Small app server, small database: about $200 a month, with plenty of headroom.'],
        'start': g([('client', 0, 2)], []),
        'solution': g([('client', 0, 2), ('app-server', 1, 2, {'tier': 's'}), ('db-sql', 2, 2, {'tier': 's'})], [(1, 2), (2, 3)]),
        'debrief': 'Most early systems need less than you think. Sizing to the numbers is the first habit interviewers look for.',
    },
    {
        'id': 'launch-day', 'chapter': 'foundations', 'tier': 'Launched', 'users': '50k creators', 'title': 'Front page of Hacker News',
        'kicker': 'Ripple goes public. At 1pm someone posts it to Hacker News.',
        'brief': [
            {'who': 'sam', 'text': "We're live for everyone! Fifty thousand creators signed up, and their links get about 200 clicks each a day. Oh, and we're on the front page of Hacker News at 1pm. Eight times the traffic for three hours."},
            {'who': 'marcus', 'text': '$900 a month. If we fall over on launch day, nobody gives us a second look.'},
            {'who': 'priya', 'text': 'One server is one failure. And one server is also a ceiling. Find out which one bites first.'},
        ],
        'goal': 'Survive an 8× launch spike without blowing the budget.',
        'dau': 50000, 'traffic': {'read': {'perUser': 200, 'kb': 0.5, 'cacheable': 0.9, 'workingSetGb': 2}, 'write': {'perUser': 3, 'kb': 0.5}, 'peak': 2.2},
        'data': {'gb': 40}, 'slo': {'availability': 99.9, 'p99': {'read': 200, 'write': 400}, 'budget': 900},
        'events': [{'id': 'hn', 'type': 'surge', 'at': 13, 'dur': 3, 'params': {'mult': 8}, 'label': 'Hacker News front page', 'who': 'sam', 'line': "We're #1 on Hacker News! Traffic just went up eight times."}],
        'estimate': ['peakReadRps', 'peakWriteRps'],
        'concepts': ['scaling', 'balancing'], 'lessons': ['scaling', 'stateless-balancing', 'service-quality'], 'sims': ['boe'],
        'toolbox': T2,
        'hints': ['Multiply your peak by eight. Which component runs out first?',
                  'Several app servers need a load balancer in front, or one of them does all the work.',
                  'Autoscaling reacts an hour late in this model. For a spike you know is coming, scale up beforehand.'],
        'start': 'garage',
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 's', 'count': 5}), ('db-sql', 3, 2, {'tier': 's'})], [(1, 2), (2, 3), (3, 4)]),
        'debrief': 'Stateless servers behind a load balancer turn "how big is the box" into "how many boxes". Know your peak, then add headroom.',
    },
    {
        'id': 'viral-link', 'chapter': 'caching', 'tier': 'Seed round', 'users': '500k creators', 'title': 'A viral evening',
        'kicker': 'A celebrity shares a Ripple link at dinner time, and someone restarts Redis at the worst moment.',
        'brief': [
            {'who': 'marcus', 'text': "Seed round closed. Half a million creators. Budget's $3,500 a month, and I want change back."},
            {'who': 'sam', 'text': "Every evening is busy, but tonight a pop star shares a Ripple link at 6pm. Expect three times our normal evening for three hours."},
            {'who': 'priya', 'text': "Database reads cost us more every week. And for the record: someone will flush the cache during the spike. They always do."},
        ],
        'goal': 'Carry a tripled evening peak, and keep standing when the cache empties in the middle of it.',
        'dau': 500000, 'traffic': {'read': {'perUser': 200, 'kb': 0.5, 'cacheable': 0.92, 'workingSetGb': 8}, 'write': {'perUser': 3, 'kb': 0.5}, 'peak': 2.3},
        'data': {'gb': 300}, 'slo': {'availability': 99.9, 'p99': {'read': 150, 'write': 300}, 'budget': 3500},
        'events': [
            {'id': 'popstar', 'type': 'surge', 'at': 18, 'dur': 3, 'params': {'mult': 3}, 'label': 'Pop star shares a link', 'who': 'sam', 'line': 'She posted it. Here it comes.'},
            {'id': 'flush', 'type': 'cache-flush', 'at': 19, 'dur': 1, 'label': 'Someone flushes the cache', 'who': 'jo', 'line': "Um. I ran FLUSHALL on what I thought was my local Redis."},
        ],
        'estimate': ['peakReadRps', 'cacheGb'],
        'concepts': ['caching', 'hot-keys'], 'lessons': ['cache-aside', 'hot-keys', 'cache-freshness'], 'sims': ['cachestrategies'],
        'toolbox': T3,
        'hints': ['At peak, how many reads per second reach the database? A cache turns that into the miss rate times the traffic.',
                  'The cache holds the hot set. How big is it, and how big is your cache?',
                  'When the cache empties, every miss goes to the database at once. Request coalescing (on the cache) merges identical misses.'],
        'start': 'launch-day',
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 'l', 'count': 6}), ('cache', 3, 1, {'tier': '13', 'coalesce': True}), ('db-sql', 3, 3, {'tier': 'm'})],
                      [(1, 2), (2, 3), (3, 4), (3, 5)]),
        'debrief': "Once the cache carries most reads, it is the capacity plan, and losing it is a database outage. Plan for the cold cache.",
    },
    {
        'id': 'partner-api', 'chapter': 'apis', 'tier': 'Seed round', 'users': '1M creators', 'title': 'The partner API',
        'kicker': 'Ripple opens its API. Partners retry like they are paid by the request, and someone points a botnet at it.',
        'brief': [
            {'who': 'sam', 'text': "Three big partners are integrating! One of them is bulk-importing their whole link catalogue at 4pm tomorrow. Twenty-five times our normal write rate for two hours."},
            {'who': 'priya', 'text': "Their client retries every failure immediately, with no backoff. And we're getting probed at 2am. Assume it becomes a flood."},
            {'who': 'marcus', 'text': '$3,500. Partners are the business plan, so their bad behaviour is our problem.'},
        ],
        'goal': 'Keep normal users healthy through a partner bulk import and a night-time flood of junk requests.',
        'dau': 1000000, 'traffic': {'read': {'perUser': 120, 'kb': 0.5, 'cacheable': 0.9, 'workingSetGb': 10}, 'write': {'perUser': 6, 'kb': 0.5}, 'peak': 2.3},
        'data': {'gb': 500}, 'slo': {'availability': 99.9, 'p99': {'read': 150, 'write': 300}, 'budget': 3500},
        'events': [
            {'id': 'import', 'type': 'partner-burst', 'at': 16, 'dur': 2, 'params': {'mult': 25, 'quota': 2}, 'label': 'Partner bulk import', 'who': 'sam', 'line': "They've started the import. All of it. At once."},
            {'id': 'flood', 'type': 'ddos', 'at': 2, 'dur': 1, 'params': {'mult': 40}, 'label': 'Junk-request flood', 'who': 'priya', 'line': 'Paged. Forty times normal traffic, all random short codes.'},
        ],
        'estimate': ['peakWriteRps', 'peakReadRps'],
        'concepts': ['rate-limiting', 'retries', 'overload'], 'lessons': ['rate-limiting', 'retry-identity', 'overload', 'api-contracts'], 'sims': [],
        'toolbox': T4,
        'hints': ['Twenty-five times your write rate: can one database primary take it? And what do failed writes turn into?',
                  'Retries without backoff multiply load. Something has to say "slow down" (429) before the database does.',
                  'A rate limiter or gateway in front enforces partner quotas and drops junk floods early.'],
        'start': 'viral-link',
        'solution': g([('client', 0, 2), ('rate-limiter', 1, 2), ('load-balancer', 2, 2), ('app-server', 3, 2, {'tier': 'l', 'count': 4}), ('cache', 4, 1, {'tier': '13', 'coalesce': True}), ('db-sql', 4, 3, {'tier': 'm'})],
                      [(1, 2), (2, 3), (3, 4), (4, 5), (4, 6)]),
        'debrief': 'Overload you accept becomes retries you can\'t afford. Shed early, at the edge, with a clear 429.',
    },
    {
        'id': 'async-work', 'chapter': 'queues', 'tier': 'Series A', 'users': '5M users', 'title': 'Off the request path',
        'kicker': 'Click analytics, link previews and email digests. Each one wants to run inside the redirect.',
        'brief': [
            {'who': 'sam', 'text': "Series A! Creators want click analytics, link preview images, and an email when a link takes off. Can every click count? Every single one?"},
            {'who': 'jo', 'text': "I prototyped it: the redirect handler writes the click to Postgres, renders the preview, and calls the email API. Works great on my laptop."},
            {'who': 'priya', 'text': "Our email provider has an incident roughly monthly. And one day someone will upload a file the preview renderer chokes on. Analytics can lag, but not by more than 15 minutes."},
            {'who': 'marcus', 'text': '$16,000 a month. Five million users. Make the numbers work.'},
        ],
        'goal': 'Count every click, render every preview and send every email, without making redirects wait for any of it.',
        'dau': 5000000, 'traffic': {'read': {'perUser': 40, 'kb': 0.5, 'cacheable': 0.9, 'workingSetGb': 20, 'jobs': [{'kind': 'analytics', 'per': 1}]},
                                    'write': {'perUser': 1, 'kb': 0.5, 'jobs': [{'kind': 'notify', 'per': 0.5}]},
                                    'upload': {'perUser': 0.1, 'kb': 400, 'jobs': [{'kind': 'process', 'per': 1, 'ms': 600}]},
                                    'media': {'perUser': 4, 'kb': 60}, 'peak': 2.2},
        'data': {'gb': 800, 'mediaGb': 4000}, 'slo': {'availability': 99.9, 'p99': {'read': 150, 'write': 300, 'upload': 1500}, 'budget': 16000, 'lagMin': 15},
        'events': [
            {'id': 'poison', 'type': 'poison-message', 'at': 14, 'label': 'A file the renderer chokes on', 'who': 'jo', 'line': "Someone uploaded a 9,000-page PDF as a 'preview image'. The worker keeps crashing on it."},
            {'id': 'email', 'type': 'slow-dependency', 'at': 19, 'dur': 2, 'params': {'ms': 6000, 'err': 0.4}, 'label': 'Email provider incident', 'who': 'priya', 'line': 'Email provider status page: "degraded". Six-second responses.'},
        ],
        'estimate': ['peakReadRps', 'storageGbYear', 'egressTbMonth'],
        'concepts': ['async', 'queues', 'dead-letters', 'object-storage'], 'lessons': ['sync-async', 'queue-basics', 'dead-letters', 'object-storage', 'event-streams'], 'sims': ['pubsub', 'streamwindow'],
        'toolbox': T5,
        'hints': ['Which of these does the user need to wait for? Everything else can be a job on a queue.',
                  'Click analytics at peak is thousands of writes per second. Is the main database the right home? A time-series store or warehouse takes bulk writes cheaply.',
                  'Uploads go straight to object storage, and storage events put the preview job on the queue. Add a dead-letter queue for files that never render.'],
        'start': 'partner-api',
        'solution': g([('client', 0, 2), ('cdn', 1, 0), ('rate-limiter', 1, 2), ('load-balancer', 2, 2), ('app-server', 3, 2, {'tier': 'l', 'count': 6}), ('cache', 4, 1, {'tier': '26', 'coalesce': True}),
                       ('db-sql', 4, 3, {'tier': 'm'}), ('object-store', 2, 0), ('message-queue', 5, 2), ('worker', 6, 2, {'tier': 'l', 'count': 4, 'timeouts': True}), ('dead-letter-queue', 6, 4),
                       ('db-timeseries', 7, 1), ('external-service', 7, 3)],
                      [(1, 2), (2, 8), (1, 8), (1, 3), (3, 4), (4, 5), (5, 6), (5, 7), (5, 9), (8, 9), (9, 10), (9, 11), (10, 12), (10, 13), (10, 7)]),
        'debrief': 'Do on the request path only what the user waits for. A queue in between turns a slow or broken dependency into a backlog instead of an outage.',
    },
    {
        'id': 'postgres-full', 'chapter': 'storage', 'tier': 'Series A', 'users': '5M users', 'title': 'The disk is full',
        'kicker': 'Nine terabytes, a write rate that keeps climbing, and a primary that will die tonight.',
        'brief': [
            {'who': 'priya', 'text': "The Postgres box has 9 TB of link history and click data on it, and the biggest disk we can buy is 8 TB. Also, the primary will fail tonight at 7. I don't know that. I just know."},
            {'who': 'sam', 'text': "Creators edit links a lot now: ten writes a day each. And when someone saves a link, it has to stay saved. Losing one is a support ticket and a tweet."},
            {'who': 'marcus', 'text': "Storage is getting expensive. $15,000 a month, and tell me why the database is the biggest line."},
        ],
        'goal': 'Fit the data, carry the write rate, and lose no acknowledged writes when the primary dies.',
        'dau': 5000000, 'traffic': {'read': {'perUser': 30, 'kb': 1, 'cacheable': 0.85, 'workingSetGb': 40}, 'write': {'perUser': 10, 'kb': 1}, 'peak': 2.3},
        'data': {'gb': 9000}, 'slo': {'availability': 99.9, 'p99': {'read': 150, 'write': 300}, 'budget': 15000, 'noLoss': True},
        'events': [{'id': 'primary', 'type': 'db-failover', 'at': 19, 'label': 'The primary dies', 'who': 'priya', 'line': 'Primary is gone. Kernel panic. Let\'s see what we built.'}],
        'estimate': ['peakWriteRps', 'storageGbYear'],
        'concepts': ['partitioning', 'replication', 'recovery', 'storage'], 'lessons': ['partitioning', 'replication', 'recovery', 'storage-engines', 'indexes'], 'sims': ['sqlsharding', 'partitioning', 'wal', 'lsm', 'replanomalies'],
        'toolbox': T6,
        'hints': ['Writes scale with shards, not replicas. How many writes per second at peak, and how many can one primary take?',
                  'Nine terabytes on 8 TB disks means at least two shards, or a store that grows on its own.',
                  'Promoting an asynchronous replica loses the last few seconds of writes. A synchronous standby in another zone (multi-AZ) doesn\'t.'],
        'start': 'async-work',
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 'l', 'count': 4}), ('cache', 3, 1, {'tier': '52', 'coalesce': True}),
                       ('db-sql', 3, 3, {'tier': 'l', 'shards': 2, 'azs': 2})], [(1, 2), (2, 3), (3, 4), (3, 5)]),
        'debrief': 'Replicas buy read capacity and failover; shards buy write capacity and room. Know which problem you have before you pay for either.',
    },
    {
        'id': 'pager', 'chapter': 'reliability', 'tier': 'Series B', 'users': '50M users', 'title': "Priya's worst day",
        'kicker': 'A zone goes dark, a deploy goes wrong and a cache node dies, all before dinner.',
        'brief': [
            {'who': 'priya', 'text': "Fifty million users and a 99.95% target. That's 43 seconds of downtime a day. Today, a whole availability zone drops at 11, someone ships a bad build at 4, and a cache node dies at 8. I'd like to sleep tonight."},
            {'who': 'marcus', 'text': "Redundancy isn't free. $45,000 a month. Spend it where a failure actually lands."},
            {'who': 'jo', 'text': "If we have three zones, do we need three times the servers? That feels like a lot of money."},
        ],
        'goal': 'Hit 99.95% through a zone outage, a bad deploy and a lost cache node.',
        'dau': 50000000, 'traffic': {'read': {'perUser': 20, 'kb': 1, 'cacheable': 0.92, 'workingSetGb': 60}, 'write': {'perUser': 1.5, 'kb': 1}, 'peak': 2.2},
        'data': {'gb': 6000}, 'slo': {'availability': 99.95, 'p99': {'read': 150, 'write': 300}, 'budget': 45000, 'noLoss': True},
        'events': [
            {'id': 'zone', 'type': 'az-outage', 'at': 11, 'dur': 2, 'label': 'Zone us-east-1b goes dark', 'who': 'priya', 'line': 'Lost a whole zone. Power, apparently.'},
            {'id': 'deploy', 'type': 'bad-deploy', 'at': 16, 'dur': 2, 'params': {'err': 0.3}, 'label': 'A bad build ships', 'who': 'jo', 'line': 'I merged it. Tests were green! Why is the error rate 30%?'},
            {'id': 'cachenode', 'type': 'cache-node', 'at': 20, 'label': 'A cache node dies', 'who': 'priya', 'line': 'Cache node 3 just vanished.'},
        ],
        'estimate': ['peakReadRps'],
        'concepts': ['redundancy', 'observability', 'consistent-hashing', 'replication'], 'lessons': ['service-quality', 'observability', 'consistent-hashing', 'stateless-balancing', 'recovery'], 'sims': ['phiaccrual', 'bully', 'raft'],
        'toolbox': T7,
        'hints': ['Every component on the request path needs to exist in more than one zone. Spread instances across zones (AZs).',
                  'Losing one of three zones loses a third of capacity. Size for the two that are left.',
                  'Monitoring plus canary releases catch a bad build on a few servers. A consistent-hash ring (or cache replicas) means a dead node empties only its share.'],
        'start': 'postgres-full',
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 'xl', 'count': 12, 'azs': 3, 'canary': True}), ('consistent-hash', 3, 1),
                       ('cache', 4, 1, {'tier': '26', 'count': 4, 'coalesce': True, 'azs': 2}), ('db-sql', 3, 3, {'tier': 'l', 'replicas': 2, 'azs': 2}), ('monitoring', 2, 4)],
                      [(1, 2), (2, 3), (3, 4), (4, 5), (3, 5), (3, 6)]),
        'debrief': 'Availability is redundancy in independent failure domains, sized for the loss, plus fast detection. Monitoring is part of the architecture.',
    },
    {
        'id': 'europe', 'chapter': 'distributed', 'tier': 'Series B', 'users': '50M users', 'title': 'Launch in Europe',
        'kicker': 'Almost half the users are an ocean away, and the region they are routed to will go down.',
        'brief': [
            {'who': 'sam', 'text': "45% of our users are in Europe now, and they say Ripple feels slow. Our target is 150 ms. Can we be fast there too?"},
            {'who': 'priya', 'text': "And when us-east has its annual bad day, I'd like Ripple to keep working. Without losing anyone's links. At 3pm, it will."},
            {'who': 'marcus', 'text': "Two regions is twice the bill, isn't it? $90,000. Show me it's worth it."},
        ],
        'goal': 'Serve European users fast, and survive the loss of a whole region with no lost writes.',
        'dau': 50000000, 'traffic': {'read': {'perUser': 20, 'kb': 1, 'cacheable': 0.92, 'workingSetGb': 60}, 'write': {'perUser': 1.5, 'kb': 1}, 'peak': 2.2},
        'data': {'gb': 6000}, 'far': {'share': 0.45, 'rttMs': 90},
        'slo': {'availability': 99.9, 'p99': {'read': 150, 'write': 400}, 'budget': 90000, 'noLoss': True},
        'events': [{'id': 'region', 'type': 'region-outage', 'at': 15, 'dur': 2, 'label': 'us-east-1 has a bad day', 'who': 'priya', 'line': 'The whole region. Status page is also down, which is a nice touch.'}],
        'estimate': ['peakReadRps'],
        'concepts': ['regions', 'replication', 'redundancy'], 'lessons': ['consistency', 'replication', 'consensus', 'guarantees'], 'sims': ['cap', 'quorum', 'raft', 'crdt'],
        'toolbox': T8,
        'hints': ['Light takes time: a round trip across the Atlantic is ~90 ms, and a request needs two. Only being closer fixes that.',
                  'Two regions need geo DNS to send people to the nearer one, and away from a dead one. Set regions in the panel.',
                  'Asynchronous replication between regions loses the last seconds of writes in a failover. Synchronous replication costs a round trip per write: check the write target.'],
        'start': 'pager',
        'solution': g([('client', 0, 2), ('dns', 1, 2), ('load-balancer', 2, 2), ('app-server', 3, 2, {'tier': 'xl', 'count': 8, 'azs': 3, 'canary': True}), ('consistent-hash', 4, 1),
                       ('cache', 5, 1, {'tier': '26', 'count': 3, 'coalesce': True}), ('db-sql', 4, 3, {'tier': 'l', 'replicas': 1, 'azs': 2}), ('monitoring', 3, 4)],
                      [(1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (4, 6), (4, 7)], {'regions': 2, 'crossRegion': 'sync'}),
        'debrief': 'Latency is geography; durability across regions is a round trip per write. Every multi-region design is a choice about which one you pay for.',
    },
    {
        'id': 'social', 'chapter': 'specialised', 'tier': 'Scale-up', 'users': '200M users', 'title': 'Ripple becomes social',
        'kicker': 'A home feed, search and places nearby. And a celebrity whose every post is a hot key.',
        'brief': [
            {'who': 'sam', 'text': "Ripple has a home feed now: posts from people you follow. Plus search, and 'links near you'. Users read their feed about 30 times a day, and the average poster has 200 followers."},
            {'who': 'jo', 'text': "I built the feed as a big JOIN across follows and posts, and search as LIKE '%term%'. It's fine with my test data of twelve posts."},
            {'who': 'priya', 'text': "At 7pm the most-followed account on Ripple posts. A quarter of all feed reads will want that one post for an hour."},
            {'who': 'marcus', 'text': "$750,000 a month. Yes, really: at this size bandwidth alone is a fortune. We're a real company now. Act like it."},
        ],
        'goal': 'Feed, search and nearby lookups at 200M users, through a celebrity post.',
        'dau': 200000000, 'traffic': {'read': {'perUser': 30, 'kb': 20, 'cacheable': 0.95, 'workingSetGb': 400},
                                      'write': {'perUser': 0.5, 'kb': 2, 'jobs': [{'kind': 'fanout', 'per': 1, 'fanout': 200}, {'kind': 'index', 'per': 1}]},
                                      'search': {'perUser': 2, 'kb': 6}, 'geo': {'perUser': 1, 'kb': 3}, 'media': {'perUser': 6, 'kb': 50}, 'peak': 2.1},
        'data': {'gb': 40000, 'mediaGb': 900000}, 'slo': {'availability': 99.9, 'p99': {'read': 200, 'write': 400, 'search': 400, 'geo': 200}, 'budget': 750000, 'lagMin': 10},
        'events': [{'id': 'celebrity', 'type': 'hot-key', 'at': 19, 'dur': 1, 'params': {'share': 0.25}, 'label': 'The most-followed account posts', 'who': 'priya', 'line': 'There it is. One post, a quarter of all reads.'},
                   {'id': 'everyone', 'type': 'surge', 'at': 19, 'dur': 1, 'params': {'mult': 2, 'types': ['read']}, 'label': 'Everyone opens the app to see it', 'who': 'sam', 'line': 'Notifications went out. Everyone is opening Ripple at once.'}],
        'estimate': ['peakReadRps', 'egressTbMonth', 'cacheGb'],
        'concepts': ['feed', 'hot-keys', 'search', 'geo', 'cdn'], 'lessons': ['feed-fanout', 'search-index', 'geo-index', 'hot-keys', 'http-cdn'], 'sims': ['cachestrategies', 'partitioning', 'lsm'],
        'toolbox': T9,
        'hints': ['Pre-compute feeds: each post becomes a fan-out job that writes into followers\' cached timelines. Reads then hit the cache, not a JOIN.',
                  'Searches and nearby lookups belong in their own indexes (a search cluster, a geospatial service), not scans of the main database.',
                  'One key at a quarter of reads saturates one cache shard however many you have. A local cache in the app (hot-key option) absorbs it.'],
        'start': 'europe',
        'solution': g([('client', 0, 2), ('cdn', 1, 0), ('dns', 1, 2), ('load-balancer', 2, 2), ('app-server', 3, 2, {'tier': 'xl', 'count': 90, 'azs': 3}),
                       ('cache', 4, 1, {'tier': '52', 'count': 12, 'hotKey': True, 'coalesce': True}), ('db-nosql', 4, 3), ('search-engine', 5, 3, {'tier': 'l', 'count': 8, 'azs': 2}),
                       ('geospatial', 5, 4, {'count': 2}), ('message-queue', 4, 4), ('worker', 5, 5, {'tier': 'l', 'count': 10}), ('dead-letter-queue', 6, 5), ('object-store', 2, 0), ('monitoring', 3, 5)],
                      [(1, 2), (2, 13), (1, 3), (3, 4), (4, 5), (5, 6), (5, 7), (5, 8), (5, 9), (5, 10), (10, 11), (10, 12), (11, 6), (11, 8)]),
        'debrief': 'At this scale every read pattern gets its own structure: timelines in cache, an inverted index for search, a geo index for nearby. The work moves to write time.',
    },
    {
        'id': 'ripple-pay', 'chapter': 'casebook', 'tier': 'Global', 'users': '20M payers', 'title': 'Ripple Pay',
        'kicker': 'Tips for creators. Real money, a flaky payment provider, and the busiest shopping day of the year.',
        'brief': [
            {'who': 'sam', 'text': "Ripple Pay: fans tip creators with one tap. Twenty million people use it. Today's a holiday, so expect four times normal from 6pm."},
            {'who': 'priya', 'text': "The payment provider will go slow at 8pm, eight-second responses for an hour. And our ledger primary will die at 10, because of course it will."},
            {'who': 'marcus', 'text': "A tip that's charged twice, or lost, makes the news. A slow tip page is fine. Don't let the provider take the whole of Ripple down with it. $40,000."},
        ],
        'goal': 'Take payments through a holiday spike, a slow provider and a dead ledger primary: nothing lost, nothing else broken, every tip charged within the hour.',
        'dau': 20000000, 'traffic': {'read': {'perUser': 10, 'kb': 2, 'cacheable': 0.85, 'workingSetGb': 20}, 'write': {'perUser': 1, 'kb': 1}, 'payment': {'perUser': 2, 'kb': 1}, 'peak': 2.3},
        'data': {'gb': 3000}, 'slo': {'availability': 99.5, 'p99': {'read': 200, 'payment': 1000}, 'budget': 40000, 'noLoss': True, 'lagMin': 60},
        'events': [
            {'id': 'holiday', 'type': 'surge', 'at': 18, 'dur': 3, 'params': {'mult': 4}, 'label': 'Holiday rush', 'who': 'sam', 'line': "Here's the rush. Tips are flying."},
            {'id': 'provider', 'type': 'slow-dependency', 'at': 20, 'dur': 1, 'params': {'ms': 8000, 'err': 0.5}, 'label': 'Payment provider slows to a crawl', 'who': 'priya', 'line': "Provider p99 is eight seconds. Our threads are going to start piling up."},
            {'id': 'ledger', 'type': 'db-failover', 'at': 22, 'label': 'The ledger primary dies', 'who': 'priya', 'line': 'Ledger primary down. This is the one that holds the money.'},
        ],
        'estimate': ['peakWriteRps'],
        'concepts': ['payments', 'overload', 'replication'], 'lessons': ['design-payments', 'overload', 'outbox', 'transactions', 'retry-identity'], 'sims': ['twopc', 'isolation', 'wal'],
        'toolbox': T10,
        'hints': ['Payments go through their own payment service. When the provider takes eight seconds, threads waiting on it can\'t serve anything else: timeouts fail fast instead.',
                  'Failing fast still fails the tip. Record the payment as pending in the ledger, answer the fan, and charge the provider from a queue: a slow provider becomes a backlog.',
                  'The ledger cannot lose an acknowledged payment: a synchronous standby in another zone.'],
        'start': 'social',
        'solution': g([('client', 0, 2), ('rate-limiter', 1, 2), ('load-balancer', 2, 2), ('app-server', 3, 2, {'tier': 'xl', 'count': 10, 'azs': 3, 'timeouts': True}),
                       ('cache', 4, 1, {'tier': '26', 'coalesce': True, 'azs': 2}), ('db-sql', 5, 3, {'tier': 'xl', 'azs': 2, 'shards': 2}), ('payment', 4, 3, {'count': 10, 'azs': 3, 'timeouts': True}),
                       ('external-service', 7, 4), ('monitoring', 3, 4), ('message-queue', 5, 5), ('worker', 6, 5, {'tier': 'l', 'count': 5, 'timeouts': True}), ('dead-letter-queue', 7, 6)],
                      [(1, 2), (2, 3), (3, 4), (4, 5), (4, 6), (4, 7), (7, 6), (7, 10), (10, 11), (10, 12), (11, 8), (11, 6)]),
        'debrief': 'Isolate the dependency you don\'t control: bounded waits, fast failure, and state written before the call so a timeout is never a mystery.',
    },
]

SIDE = [
    {
        'id': 'ripple-chat', 'chapter': 'casebook', 'side': True, 'tier': 'Side quest', 'users': '10M users', 'title': 'Ripple Chat',
        'kicker': 'Creators want to talk to their fans, live.',
        'brief': [
            {'who': 'sam', 'text': "Chat! Ten million daily users sending about 60 messages each. Messages should land in under 300 ms. Polling every few seconds feels broken."},
            {'who': 'jo', 'text': 'Each WebSocket server keeps its connections in memory. So if Alice is on server 1 and Bob on server 2... hmm.'},
            {'who': 'marcus', 'text': '$40,000. And I want it to survive a zone outage at lunch.'},
        ],
        'goal': 'Deliver live messages across many servers in under 300 ms, through a zone outage.',
        'dau': 10000000, 'traffic': {'realtime': {'perUser': 60, 'kb': 1, 'persist': 1}, 'read': {'perUser': 15, 'kb': 4, 'cacheable': 0.8, 'workingSetGb': 30}, 'peak': 2.2},
        'data': {'gb': 5000}, 'slo': {'availability': 99.9, 'p99': {'realtime': 300, 'read': 200}, 'budget': 40000},
        'events': [{'id': 'zone', 'type': 'az-outage', 'at': 12, 'dur': 2, 'label': 'A zone goes down at lunch', 'who': 'priya', 'line': 'Zone down. Every connection on it just dropped and is reconnecting.'}],
        'estimate': ['peakWriteRps', 'storageGbYear'],
        'concepts': ['realtime', 'partitioning', 'redundancy'], 'lessons': ['realtime-push', 'design-chat', 'partitioning'], 'sims': ['pubsub', 'tcp'],
        'toolbox': T10,
        'hints': ['Hold connections open on WebSocket servers instead of polling app servers.',
                  'Messages for people on another server need a pub/sub backplane: connect the WebSocket tier to a queue or cache.',
                  'Sixty messages a day each, stored forever: a store that takes heavy writes and grows on its own.'],
        'start': None,
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('websocket-server', 2, 1, {'tier': 'l', 'count': 6, 'azs': 3}), ('app-server', 2, 3, {'tier': 'm', 'count': 4, 'azs': 3}),
                       ('message-queue', 3, 0), ('db-nosql', 3, 2), ('cache', 3, 4, {'tier': '26', 'azs': 2})],
                      [(1, 2), (2, 3), (2, 4), (3, 5), (3, 6), (4, 7), (4, 6)]),
        'debrief': 'A chat system is a connection tier, a backplane between its servers, and a store built for append-heavy writes.',
    },
    {
        'id': 'ripple-video', 'chapter': 'casebook', 'side': True, 'tier': 'Side quest', 'users': '2M viewers', 'title': 'Ripple Video',
        'kicker': 'Creators upload video. Bandwidth becomes the whole bill.',
        'brief': [
            {'who': 'sam', 'text': "Video posts! Two million daily viewers, about 40 video segments each (1 MB apiece), and creators upload a few thousand videos a day. A big premiere at 8pm, five times normal viewing."},
            {'who': 'marcus', 'text': "I've read that video companies are bandwidth companies. $330,000. Prove it, then beat it."},
            {'who': 'jo', 'text': 'Should the app server transcode the video while the creator waits? It only takes a minute or so.'},
        ],
        'goal': 'Stream through a 5× premiere without the bandwidth bill eating the company, and get uploads transcoded within 30 minutes.',
        'dau': 2000000, 'traffic': {'media': {'perUser': 40, 'kb': 1000}, 'read': {'perUser': 10, 'kb': 3, 'cacheable': 0.9, 'workingSetGb': 10},
                                    'upload': {'perUser': 0.002, 'kb': 200000, 'jobs': [{'kind': 'process', 'per': 1, 'ms': 60000}]}, 'peak': 2.4},
        'data': {'gb': 500, 'mediaGb': 2000000}, 'slo': {'availability': 99.9, 'p99': {'media': 300, 'read': 200}, 'budget': 330000, 'lagMin': 30},
        'events': [{'id': 'premiere', 'type': 'surge', 'at': 20, 'dur': 2, 'params': {'mult': 5, 'types': ['media', 'read']}, 'label': 'Premiere night', 'who': 'sam', 'line': 'The premiere is live!'}],
        'estimate': ['egressTbMonth', 'storageGbYear'],
        'concepts': ['object-storage', 'cdn', 'queues'], 'lessons': ['design-video', 'object-storage', 'http-cdn', 'queue-basics'], 'sims': ['http'],
        'toolbox': T10,
        'hints': ['Work out the bandwidth: viewers × segments × 1 MB. At $0.09 per GB from origin, what is that a month?',
                  'Video bytes never touch app servers: clients upload straight to object storage and watch through a CDN.',
                  'Transcoding is minutes of CPU per video: a queue and a pool of GPU workers.'],
        'start': None,
        'solution': g([('client', 0, 2), ('cdn', 1, 1), ('load-balancer', 1, 3), ('object-store', 2, 1), ('app-server', 2, 3, {'tier': 'm', 'count': 4}), ('db-sql', 3, 3, {'tier': 'm'}),
                       ('message-queue', 3, 1), ('worker', 4, 1, {'tier': 'gpu', 'count': 2}), ('dead-letter-queue', 5, 1), ('cache', 3, 4, {'tier': '13'})],
                      [(1, 2), (2, 4), (1, 4), (1, 3), (3, 5), (5, 6), (5, 10), (4, 7), (7, 8), (7, 9), (8, 4)]),
        'debrief': 'For video, the CDN is the product and the bandwidth is the bill. Bytes go client to storage to edge; servers only handle metadata.',
    },
    {
        'id': 'ripple-rides', 'chapter': 'casebook', 'side': True, 'tier': 'Side quest', 'users': '1M drivers', 'title': 'Ripple Rides',
        'kicker': 'A partnership with a ride company: drivers report their location every four seconds.',
        'brief': [
            {'who': 'sam', 'text': "Our partner's app shows Ripple links from drivers nearby. A million drivers send their location about every 4 seconds while online, and riders look up nearby drivers 20 times a day."},
            {'who': 'priya', 'text': "That's a write rate Postgres has opinions about. And when the stadium empties at 10pm, everyone looks at the same few blocks."},
            {'who': 'marcus', 'text': '$30,000.'},
        ],
        'goal': 'Take a firehose of location updates and answer nearby lookups fast, including the stadium crowd.',
        'dau': 1000000, 'traffic': {'locate': {'perUser': 2000, 'kb': 0.1}, 'write': {'perUser': 5, 'kb': 1}, 'geo': {'perUser': 60, 'kb': 2}, 'read': {'perUser': 20, 'kb': 2, 'cacheable': 0.8, 'workingSetGb': 5}, 'peak': 2.0},
        'data': {'gb': 1500}, 'slo': {'availability': 99.9, 'p99': {'geo': 150, 'locate': 300}, 'budget': 30000},
        'events': [{'id': 'stadium', 'type': 'surge', 'at': 22, 'dur': 1, 'params': {'mult': 3, 'types': ['geo', 'read']}, 'label': 'The stadium empties', 'who': 'priya', 'line': 'Concert just ended. Sixty thousand people opened the app.'}],
        'estimate': ['peakWriteRps'],
        'concepts': ['geo', 'partitioning', 'storage'], 'lessons': ['geo-index', 'design-rides', 'partitioning'], 'sims': ['partitioning', 'lsm'],
        'toolbox': T10,
        'hints': ['Location updates at peak are tens of thousands of writes a second. Which store takes that, and does it need to keep history?',
                  'Nearby lookups on latitude/longitude columns are scans. A geospatial index (geohash or quadtree) in memory answers them.',
                  'Latest locations are tiny and short-lived: keep them in the geo index; send history to a time-series store.'],
        'start': None,
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 'xl', 'count': 16, 'azs': 2}), ('geospatial', 3, 1, {'count': 4, 'azs': 2}), ('db-sql', 3, 3, {'tier': 'm', 'azs': 2}),
                       ('cache', 3, 4, {'tier': '6'})],
                      [(1, 2), (2, 3), (3, 4), (3, 5), (3, 6)]),
        'debrief': 'Separate the firehose (latest positions, in memory) from the record (trips, durable). Different data, different stores.',
    },
    {
        'id': 'ripple-notify', 'chapter': 'casebook', 'side': True, 'tier': 'Side quest', 'users': '30M users', 'title': 'Ripple Notifications',
        'kicker': 'Push, email and in-app alerts for thirty million people, through a provider that throttles.',
        'brief': [
            {'who': 'sam', 'text': "Every like, follow and tip can notify someone: about three notifications per action, and people act twice a day. Alerts should arrive within 5 minutes."},
            {'who': 'priya', 'text': "The push provider will slow down at 6pm, and some app version sends us payloads that crash the sender. Neither should hold up everyone else."},
            {'who': 'marcus', 'text': '$25,000.'},
        ],
        'goal': 'Deliver notifications within 5 minutes through a slow provider and a poison payload.',
        'dau': 30000000, 'traffic': {'write': {'perUser': 2, 'kb': 1, 'jobs': [{'kind': 'notify', 'per': 3}]}, 'read': {'perUser': 10, 'kb': 2, 'cacheable': 0.85, 'workingSetGb': 30}, 'peak': 2.2},
        'data': {'gb': 2000}, 'slo': {'availability': 99.9, 'p99': {'write': 300, 'read': 200}, 'budget': 25000, 'lagMin': 5},
        'events': [{'id': 'poison', 'type': 'poison-message', 'at': 9, 'label': 'A payload that crashes the sender', 'who': 'jo', 'line': 'App v4.2 sends emoji the sender library can\'t encode. It crashes. Every time.'},
                   {'id': 'push', 'type': 'slow-dependency', 'at': 18, 'dur': 2, 'params': {'ms': 5000, 'err': 0.3}, 'label': 'Push provider slows down', 'who': 'priya', 'line': 'Push provider latency just went to five seconds.'}],
        'estimate': ['peakWriteRps'],
        'concepts': ['queues', 'dead-letters', 'async'], 'lessons': ['design-notifications', 'dead-letters', 'queue-basics', 'sync-async'], 'sims': ['pubsub'],
        'toolbox': T10,
        'hints': ['The action (a like) must not wait for the notification. Put notifications on a queue.',
                  'Workers send through the notification service. How many notifications per second at peak?',
                  'A dead-letter queue parks the payload that always fails, so the rest flow.'],
        'start': None,
        'solution': g([('client', 0, 2), ('load-balancer', 1, 2), ('app-server', 2, 2, {'tier': 'l', 'count': 7}), ('cache', 3, 1, {'tier': '26'}), ('db-sql', 3, 3, {'tier': 'l', 'azs': 2}),
                       ('message-queue', 3, 4), ('worker', 4, 4, {'tier': 'l', 'count': 5}), ('dead-letter-queue', 5, 5), ('notification-service', 5, 3, {'count': 3, 'timeouts': True}), ('external-service', 6, 3)],
                      [(1, 2), (2, 3), (3, 4), (3, 5), (3, 6), (6, 7), (6, 8), (7, 9), (9, 10)]),
        'debrief': 'Notifications are a pipeline of queues with failure parking at every stage. The user action never waits for delivery.',
    },
]


ASKS = {  # the question a gap asks when a run fails on that concept
    'estimates': 'How do you turn daily users into peak requests per second, and what does that number decide?',
    'request-flow': 'What hops does one request pass through, and roughly how long does each take?',
    'scaling': 'How do you find the component that limits throughput, and why does scaling anything else not help?',
    'balancing': 'Why do several app servers need a load balancer, and what must be true of the servers for it to work?',
    'caching': "How does a cache's hit rate set the database's load, and how do you size the cache?",
    'hot-keys': 'Why does adding cache shards not relieve one hot key, and what does? What happens when the cache empties at peak?',
    'consistent-hashing': 'Why does losing one node of a hash-mod-N cache empty most of it, and how does a ring change that?',
    'cdn': 'Which responses can a CDN cache, and what does it change about the bandwidth bill?',
    'rate-limiting': 'Where would you put a rate limiter, and what does it protect when a client misbehaves?',
    'retries': 'How can clients retrying failures keep a system down after the trigger has passed, and how do you stop it?',
    'overload': 'What happens to a service whose threads wait on a slow dependency, and what do timeouts and circuit breakers change?',
    'queues': "How fast does a queue's backlog drain, and how many workers do you need for a given arrival rate?",
    'async': 'Which work belongs on the request path and which should be queued? What does the client get back?',
    'dead-letters': 'What does one message that always fails do to a queue, and how does a dead-letter queue help?',
    'object-storage': 'Why should uploads and downloads bypass the app servers, and how do clients reach storage directly?',
    'storage': 'When the database is the bottleneck, how do you tell whether you need replicas, shards or a different store?',
    'partitioning': 'How do you choose a shard key, and what goes wrong with a bad one?',
    'replication': 'What can be lost when a primary dies with asynchronous replicas, and what does a synchronous standby cost?',
    'recovery': 'What are RPO and RTO, and what sets them for a database restored from backup?',
    'redundancy': 'How do you size a fleet to survive losing one of three zones?',
    'regions': 'What does a second region fix, what does it cost, and what is lost in a regional failover?',
    'observability': 'How do monitoring and canary releases limit the damage of a bad deploy?',
    'search': "Why is LIKE '%term%' slow at scale, and what does an inverted index do instead?",
    'realtime': 'How does a message reach a user connected to a different WebSocket server?',
    'geo': 'Why are two range indexes on latitude and longitude a poor way to find nearby things, and what works better?',
    'feed': 'When would you fan a home feed out on write rather than on read, and what do you do about accounts with huge followings?',
    'payments': 'How do you take a payment through a slow or failing provider without losing or double-charging it?',
}


def main():
    for k, v in CONCEPTS.items():
        v['ask'] = ASKS[k]
    levels = LEVELS + SIDE
    for i, l in enumerate(levels):
        l['order'] = i + 1
        if l.get('start') == 'garage' or (isinstance(l.get('start'), str)):
            ref = next(x for x in levels if x['id'] == l['start'])
            l['startFrom'] = l['start']
            l['start'] = ref['solution']
        if not l.get('start'):
            l['start'] = g([('client', 0, 2)], [])
    unlock = {}
    prev = None
    for l in LEVELS:
        unlock[l['id']] = prev
        prev = l['id']
    for l in SIDE:
        unlock[l['id']] = 'async-work'
    for l in levels:
        l['after'] = unlock[l['id']]
    out = {'version': 1, 'concepts': CONCEPTS, 'levels': levels,
           'cast': {'marcus': 'CTO', 'priya': 'SRE', 'jo': 'Junior engineer', 'sam': 'Product'}}
    with open(OUT, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write('\n')
    print(f'wrote {len(levels)} levels to {os.path.relpath(OUT)}')


if __name__ == '__main__':
    main()
