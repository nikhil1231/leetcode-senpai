---
id: design-crawler
category: casebook
skill: capacity
title: Design a web crawler
minutes: 20
summary: A crawler is a giant, never-ending batch job — a frontier of URLs to visit, thousands of fetchers that must be polite to every host, deduplication at billions of URLs and pages, and a revisit schedule that spends bandwidth where pages actually change. The architecture comes from two constraints. You must never hammer a single host, and you must never fetch the same thing twice by accident.
objectives:
  - Size a crawler's fetch rate, bandwidth, concurrency and storage
  - Design a URL frontier with prioritisation and per-host politeness queues (Mercator-style)
  - Deduplicate URLs with normalisation plus Bloom filters, and content with fingerprints
  - Schedule recrawls by change rate, defend against traps, and recover from crashes
sources:
  - ['Heydon & Najork, Mercator: A Scalable, Extensible Web Crawler', 'https://www.cs.cornell.edu/courses/cs685/2002fa/mercator.pdf']
  - ['RFC 9309: Robots Exclusion Protocol', 'https://www.rfc-editor.org/rfc/rfc9309']
  - ['Manku et al., Detecting Near-Duplicates for Web Crawling (SimHash at Google)', 'https://research.google/pubs/detecting-near-duplicates-for-web-crawling/']
case: crawler
---

## 1. Requirements

- Crawl HTML pages for a search index: fetch, store, extract links, discover new URLs.
- **1B pages per day** across hundreds of millions of hosts.
- **Politeness:** at most one request per host every few seconds (more for big sites that allow it), and respect `robots.txt`.
- Don't fetch the same URL repeatedly; detect duplicate and near-duplicate content.
- Refresh pages in proportion to how often they change and how important they are.
- Survive crashes without losing the frontier.

## 2. Estimates

```faded
title: Size the crawler
prompt: Fill in the numbers.
text: |
  1B pages/day ÷ 86,400 ≈ [[#11600]] fetches/s.

  Average page ~100 KB (HTML, compressed ~30 KB on the wire): 11,600 × 100 KB ≈ [[1.2 GB/s|12 MB/s|120 GB/s]] of page data to store, before compression.

  Each fetch takes ~1 s (DNS, connect, download, plus slow servers). By Little's Law, about [[#11600]] fetches are in flight at any moment — tens of thousands of concurrent connections across the fetcher fleet.

  Storage: 1B × 30 KB compressed ≈ [[30 TB|300 GB|3 PB]] per day of raw pages, into object storage in batched archive files.
explain: The rates are high but embarrassingly parallel. The constraints that shape the design are politeness and deduplication, not raw throughput.
```

## 3. The frontier: priority and politeness

```predict
prompt: The crawler uses one global FIFO queue of URLs, and 2,000 fetchers take the next URL. A popular news site contributes 50,000 queued URLs in a burst. What happens?
choices:
  - The news site's URLs are spread evenly over the day
  - Many fetchers hit the same site simultaneously, effectively DDoSing it — and the crawler gets blocked
  - The FIFO automatically enforces politeness
  - Nothing — 2,000 fetchers is small
answer: 1
reveal: |
  A FIFO has no idea which host a URL belongs to. Politeness needs per-host queues and a scheduler that hands a host to a fetcher only once its "next allowed time" has passed — the Mercator design.
```

**Mercator-style frontier:**

1. **Front queues by priority:** URLs are scored (importance, such as link-based rank or domain authority; freshness need) and placed into priority queues.
2. **Back queues by host:** a router moves URLs into per-host queues, each assigned to one fetcher thread.
3. **A heap of host "next allowed fetch" times:** a fetcher takes the host whose time has come, fetches one URL, and puts the host back with `now + crawl_delay` (from robots.txt or a default, adapted to the server's response time).

```arch
title: Crawler architecture
nodes:
  - {id: seeds, label: Seeds + discovered URLs, kind: client, x: 0, y: 1}
  - {id: dedupe, label: URL seen-filter, kind: cache, x: 1, y: 1, note: 'Bloom + store'}
  - {id: front, label: Frontier, kind: queue, x: 2, y: 1, note: 'priority → per-host'}
  - {id: fetch, label: Fetchers, kind: worker, x: 3, y: 1, note: 'partitioned by host'}
  - {id: dns, label: DNS / robots cache, kind: cache, x: 3, y: 0}
  - {id: web, label: The web, kind: external, x: 4, y: 1}
  - {id: store, label: Page store, kind: storage, x: 3, y: 2, note: 'WARC files'}
  - {id: parse, label: Parser + content dedupe, kind: worker, x: 2, y: 2}
edges:
  - [seeds, dedupe, 'new URL?']
  - [dedupe, front, 'unseen']
  - [front, fetch, 'host ready']
  - [fetch, dns, 'resolve / robots']
  - [fetch, web, 'GET']
  - [fetch, store, 'raw page']
  - [store, parse, 'extract']
  - [parse, seeds, 'outlinks']
paths:
  - label: One page
    steps:
      - [seeds, dedupe, 'A discovered URL is normalised and checked against the seen-filter']
      - [dedupe, front, 'Unseen → scored and queued in the frontier (front queue by priority, then the host''s back queue)']
      - [front, fetch, 'When example.com''s next-allowed time arrives, its fetcher takes one URL']
      - [fetch, dns, 'DNS and robots.txt come from caches (refreshed periodically); a disallowed path is skipped']
      - [fetch, web, 'Fetch with timeouts and a size limit; adapt the host''s delay to its response time and errors']
      - [fetch, store, 'Append the raw response to a batched archive file in object storage']
      - [parse, seeds, 'Extract links, compute a content fingerprint, and send outlinks back for dedupe and scoring']
```

**Partition by host:** hash the host to a crawler node, so each host's politeness state lives in exactly one place, and connection reuse, DNS and robots caching work per host.

## 4. Deduplication

**URLs:** normalise first (lowercase scheme and host, remove default ports and fragments, sort or strip tracking query parameters, resolve relative paths), then check a **seen set**. At tens of billions of URLs, an exact set is huge, so a **Bloom filter** answers "definitely new" in memory, backed by a durable store for exact checks when the filter says "maybe seen".

```sim
name: bloom
title: The URL seen-filter
challenges:
  - {text: 'Store at least 20 URLs with a false-positive rate below 1% by choosing bits and hash count', metric: fpr, op: '<', value: 1, and: [{metric: n, op: '>=', value: 20}]}
takeaway: |
  A false positive here means "we think we've seen this URL, but we haven't", so the URL is skipped. A small false-positive rate trades a few missed pages for enormous memory savings. False negatives can't happen, so you never refetch a URL by mistake. At 10 bits per URL, 20B URLs fit in about 25 GB.
```

**Content:** different URLs often serve identical or near-identical pages (mirrors, session IDs in URLs, printer-friendly versions). An exact hash catches identical bodies; **SimHash**-style fingerprints catch near-duplicates (pages differing only in ads or timestamps) by comparing fingerprints within a small Hamming distance. Duplicate pages aren't re-indexed, and their hosts' URL patterns can be down-prioritised.

## 5. Freshness and traps

```sort
prompt: How should the crawler treat each case?
buckets: [Recrawl often, Recrawl rarely, Stop or limit crawling]
items:
  - {text: 'A news homepage whose content changes every few minutes', bucket: 0, why: 'High change rate and importance: revisit frequently (minutes to hours).'}
  - {text: 'A 2009 blog post that has never changed in 50 fetches', bucket: 1, why: 'The estimated change rate is near zero, so revisit after weeks or months.'}
  - {text: 'A calendar page generating /2026/11, /2026/12, … forever', bucket: 2, why: 'A crawler trap. Infinite URL spaces need depth limits, per-host page budgets and pattern detection.'}
  - {text: 'URLs that differ only by a session ID parameter', bucket: 2, why: 'Normalise the parameter away, or detect the duplicate content and collapse the URLs.'}
  - {text: 'A site returning 503 and slow responses', bucket: 2, why: 'Back off: increase that host''s delay and retry later, rather than hammering a struggling server.'}
```

Change-rate estimation: keep the history of whether a page changed on each visit (using its content fingerprint), estimate a change frequency, and schedule the next visit so that important, fast-changing pages are fresh while static ones cost little.

## 6. Robustness

```bug
title: A fetcher loop
prompt: Which lines make this crawler impolite or wasteful?
lang: python
code: |
  while True:
      url = frontier.pop()                       # global FIFO
      html = requests.get(url).text              # no timeout, no robots check
      store.save(url, html)
      for link in extract_links(html):
          frontier.push(link)                    # no normalisation or seen check
bug: [2, 3, 6]
explain: |
  **Line 2:** a global FIFO ignores hosts, so many fetchers can hit the same site at once. Pop by host from per-host queues gated by next-allowed time. **Line 3** has no timeout (one slow server stalls the thread indefinitely), no size limit, and no robots.txt check, which is impolite and risks being blocked. **Line 6** pushes every link raw, so the same URL in different forms, already-crawled URLs and trap URLs flood the frontier. Normalise, check the seen-filter, and apply depth and per-host budgets.
```

- **Checkpoint the frontier** (it lives in a durable, partitioned store, with in-memory heads) so a crash resumes rather than restarting.
- **Fetch timeouts and size limits**; per-host error backoff.
- **DNS caching**, because resolution is a hidden bottleneck at 11k fetches/s.

```calc
title: Politeness caps throughput per host
prompt: A big site allows **1 request every 2 seconds**. Its sitemap lists **3 million** pages you want to recrawl. How many **days** does a full recrawl of that site take?
answer: 69
unit: days
tolerance: 1.03
steps: |
  1 page per 2 s = 43,200 pages/day. 3,000,000 ÷ 43,200 ≈ **69 days**. Politeness, not fetcher capacity, bounds per-site freshness, so prioritisation within a site (recrawl changed and important pages, using sitemaps' `lastmod`) matters as much as global scale.
```

```interview
ask: How would you design a web crawler that fetches one billion pages per day?
say: |
  "1B pages a day is about 12k fetches/s and ~12k concurrent connections. URLs are normalised and checked against a Bloom-filter seen-set backed by a store, then enter a Mercator-style frontier — priority front queues feeding per-host back queues, with a heap of next-allowed times enforcing a delay per host from robots.txt and server health. Hosts hash to crawler nodes, so politeness state, DNS and robots caches are local. Fetchers have timeouts and size limits and write raw pages to WARC batches in object storage; parsers extract links and compute SimHash fingerprints for near-duplicate detection. Recrawl intervals follow each page's estimated change rate and importance, traps are bounded by depth and per-host budgets, and the frontier is checkpointed."
followups:
  - q: How do you enforce politeness across thousands of fetchers?
    a: Partition by host so one node owns each host's queue and next-allowed time; fetchers only take hosts whose time has come.
  - q: How do you check whether a URL is new at 20 billion URLs?
    a: Normalise it, check a Bloom filter in memory (definitely new versus maybe seen), and confirm "maybe" against a persistent store. Accept a tiny false-positive rate.
  - q: How do you decide when to recrawl a page?
    a: Estimate its change frequency from the history of content fingerprints across visits, weight by importance, and schedule within the host's politeness budget.
weak: |
  A global queue, fetch everything as fast as possible, a hash set in memory for seen URLs, and no notion of politeness, traps or recrawl.
strong: |
  Sizes the crawl, designs a per-host politeness frontier, partitions by host, deduplicates URLs and content at scale, schedules by change rate, defends against traps, and checkpoints for recovery.
```

```recall
prompt: Explain how a crawler's frontier enforces politeness while still prioritising important pages.
points:
  - URLs are first placed in priority (front) queues according to importance and freshness needs
  - A router moves them into per-host (back) queues so each host's URLs are grouped
  - A heap or scheduler tracks each host's next allowed fetch time based on robots.txt delays and server health
  - Fetchers only take a URL from a host whose time has arrived, then reschedule the host; hosts are partitioned across nodes so this state lives in one place
model: |
  Discovered URLs are scored and dropped into priority front queues, so important and stale pages get selected first. A router then distributes them into per-host back queues, one host per queue. A heap orders hosts by their next allowed fetch time — set from robots.txt crawl delays, defaults, and how quickly the server is responding. A fetcher pops the host whose time has come, fetches one URL from its queue, and pushes the host back with a new time. Because hosts are hashed to crawler nodes, each host's queue and timing live on exactly one machine, so no two fetchers can ever hammer the same site.
```

```bug
style: critique
title: A candidate's web crawler
prompt: The candidate designs a crawler fetching a billion pages a month. Which claims would you push back on?
lang: text
code: |
  The frontier is a single global priority queue; fetchers pop the highest-priority URL next.
  Seen URLs are tracked in a Bloom filter, with occasional false positives meaning a few pages are skipped.
  robots.txt is fetched and cached per host, and obeyed.
  Near-duplicate pages are detected with SimHash so mirrors aren't stored many times.
  URLs are normalised before the seen check (lowercase host, remove fragments, sort query parameters).
  Each fetcher retries a failing host immediately until it responds.
bug: [1, 6]
explain: |
  **Line 1:** a single priority queue lets many fetchers hit the same high-priority host at once. Politeness needs per-host queues with a minimum delay, with priority chosen across hosts. **Line 6:** immediate retries hammer a struggling host and trap fetchers. Back off per host, cap attempts, and move on.
```

```questions
- kind: check
  type: numeric
  prompt: A crawler must fetch 2B pages per day. What's the average fetch rate, in thousands per second?
  answer: 23.1
  unit: k fetches/s
  tolerance: 0.15
  explanation: 2,000,000,000 ÷ 86,400 ≈ 23,100 fetches/s. The 10⁵ shortcut gives 20,000/s, which is close enough.
- kind: check
  prompt: Why is a single global FIFO frontier unsuitable?
  choices:
    - text: It ignores hosts, so many fetchers can hit the same site at once and violate politeness
      correct: true
    - text: FIFOs can't hold billions of URLs
      why: Capacity can be solved. The problem is per-host scheduling.
    - text: It fetches pages in the wrong language
      why: Unrelated.
    - text: FIFOs are too slow
      why: Speed isn't the issue.
  explanation: Politeness requires per-host queues with timed access.
- kind: check
  type: multi
  prompt: Which belong in URL normalisation before deduplication? Select all that apply.
  choices:
    - text: Lowercasing the scheme and host
      correct: true
    - text: Removing fragments (#section)
      correct: true
    - text: Removing default ports and resolving relative paths
      correct: true
    - text: Stripping known tracking or session parameters
      correct: true
    - text: Lowercasing the entire path
      why: Paths can be case-sensitive on many servers.
  explanation: Canonical forms collapse equivalent URLs, so the seen-set catches them.
- kind: check
  prompt: What does a Bloom filter false positive mean for a crawler's seen-set?
  choices:
    - text: An unseen URL is wrongly treated as seen and skipped
      correct: true
    - text: A seen URL is fetched again
      why: That would be a false negative, which Bloom filters never produce.
    - text: The filter crashes
      why: False positives are normal behaviour.
    - text: The page is stored twice
      why: The URL is skipped, not stored.
  explanation: A small false-positive rate costs a few missed pages and saves enormous amounts of memory.
- kind: fire
  type: numeric
  prompt: A site allows 1 request per second, and you want to recrawl its 864,000 pages. How many days does a full pass take?
  answer: 10
  unit: days
  tolerance: 0.01
  explanation: 86,400 pages/day, so 864,000 ÷ 86,400 = 10 days. Prioritise within sites, using sitemaps and change rates.
- kind: fire
  prompt: How do you detect near-duplicate pages, such as the same article with different ads?
  choices:
    - text: Similarity-preserving fingerprints (e.g. SimHash) compared within a small Hamming distance
      correct: true
    - text: An exact MD5 of the HTML
      why: Any small difference changes the hash completely.
    - text: Comparing URLs
      why: Duplicates often live at different URLs.
    - text: Page size
      why: Far too coarse.
  explanation: SimHash maps similar content to similar fingerprints, so near-duplicates are cheap to find.
- kind: fire
  prompt: A site generates infinite calendar URLs. What protects the crawler?
  choices:
    - text: Depth limits, per-host page budgets, and URL-pattern detection
      correct: true
    - text: More fetchers
      why: They'd just crawl the trap faster.
    - text: A larger Bloom filter
      why: Every trap URL is new, so a bigger filter doesn't help.
    - text: Ignoring robots.txt
      why: That's impolite and doesn't stop traps.
  explanation: Bound how much any single host or pattern can consume.
- kind: fire
  level: advanced
  prompt: Why partition the crawl by hash of the host rather than by hash of the URL?
  choices:
    - text: Each host's politeness state, connection reuse and DNS/robots caches then live on exactly one node
      correct: true
    - text: Hosts have fewer characters than URLs
      why: Irrelevant.
    - text: It spreads a single host across many nodes for speed
      why: That's the opposite of polite.
    - text: URL hashing isn't deterministic
      why: It is. The issue is coordinating per-host limits.
  explanation: Partitioning by host makes politeness a local decision instead of a distributed coordination problem.
- kind: fire
  type: order
  prompt: Order a URL's journey through the crawler.
  items:
    - Normalise the discovered URL and check the seen-filter
    - Score it and place it in a priority queue, then the host's back queue
    - Fetch when the host's next-allowed time arrives (respecting robots.txt)
    - Store the raw page and extract links
    - Fingerprint the content for duplicate detection and schedule a recrawl
  explanation: Dedupe early, schedule politely, store raw, then derive links and freshness from content.
```
