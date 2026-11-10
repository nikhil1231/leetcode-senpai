# Content change list (2026-11-10)

A list of changes only; nothing here is implemented except where marked. Inputs: DDIA 2nd edition (from web summaries, not the book),
Xu *System Design Interview* Vol. 1 (the table of contents; chapter 4 was read in full) and Vol. 2 (public listings), the
`aasthas2022` roadmap (see `sde-roadmap-gap-notes.md`), and the lessons in `server/system_design_lessons` and
`server/tracks/content`.

**Confidence.** The DDIA 2e contents come from third-party summaries (a study-notes site and news posts; O'Reilly's page
returned 403), so treat them as a pointer, not a spec. Xu Vol. 2 chapters 1-7 and 9-13 are confirmed by retail listings; chapter 8
("Distributed Email Service") is from memory and the earlier dump, so check it against your copy.

## 1. Design examples: Xu Vol. 1 and Vol. 2 against your pages

Your design pages: links, chat, feed, crawler, notifications, ratelimiter, typeahead, video, kv, payments, rides, seats, jobs.

| Book / chapter | Status | What to do |
|---|---|---|
| V1 Rate limiter | Covered (`design-ratelimiter`, `rate-limiting`) | None |
| V1 Consistent hashing | Covered as a concept (`consistent-hashing`) | None |
| V1 Key-value store | Covered (`design-kv`) | None |
| V1 Unique ID generator | Covered as a concept (`id-generation`) | None |
| V1 URL shortener | Covered (`design-links`) | None |
| V1 Web crawler | Covered (`design-crawler`) | None |
| V1 Notification system | Covered (`design-notifications`) | None |
| V1 News feed | Covered (`design-feed`, `feed-fanout`) | None |
| V1 Chat system | Covered (`design-chat`) | None |
| V1 Search autocomplete | Covered (`design-typeahead`) | None |
| V1 YouTube | Covered (`design-video`) | None |
| **V1 Google Drive** | **Missing** | New `design-drive`: block-level chunking and dedup, delta sync, metadata vs block storage, conflict copies, notification of other devices, resumable upload |
| V1 Scale from zero, estimation, framework | Covered (`scaling`, `estimates`, `numbers`, `tradeoffs`) | Check that an interview-framework page exists (requirements, high-level design, deep dive, wrap-up, timing); if not, add a short one |
| V2 Proximity service | Partial (`geo-index`, `design-rides`) | Add `design-proximity`: static places, geohash vs quadtree, read-heavy, search radius expansion, update propagation |
| V2 Nearby friends | Partial (`geo-index`, `realtime-push`) | Add `design-nearby-friends`: pub/sub channel per user, location cache with TTL, fan-out cost, scaling the pub/sub layer |
| **V2 Google Maps** | **Missing** | New `design-maps`: map tiles and CDN, routing graph in hierarchical tiles, ETA and live traffic, location-update pipeline |
| **V2 Distributed message queue** | Concepts only (`queue-basics`, `event-streams`, `acknowledgements`, `dead-letters`) | New `design-queue`: broker internals (segment files, index, partitions), replication and ISR, producer batching, consumer groups, delivery semantics |
| **V2 Metrics monitoring and alerting** | Concept only (`observability`) | New `design-metrics`: collection (push vs pull), time-series storage, downsampling and retention, alert evaluation, cardinality |
| **V2 Ad click aggregation** | **Missing** (no hits for stream windowing) | New `design-ad-clicks`: stream aggregation, tumbling and sliding windows, late events and watermarks, exactly-once vs idempotent sinks, hot keys, reconciliation (Lambda vs Kappa) |
| V2 Hotel reservation | Mostly covered (`design-seats`, `concurrent-holds`) | Add a short hotel variant section: room types and date ranges, overbooking policy, idempotent booking; optional |
| **V2 Distributed email service** | **Missing** | New `design-email`: SMTP/IMAP flow, mailbox storage and search, spam and deliverability, attachments in object storage |
| V2 S3-like object storage | Concept only (`object-storage`) | Add `design-object-store` or deepen: metadata service vs data nodes, erasure coding vs replication, durability maths, versioning, garbage collection, multipart upload internals |
| **V2 Real-time gaming leaderboard** | **Missing** (one passing mention) | New `design-leaderboard`: sorted sets, ranking at scale, sharding by score range vs hash, top-k and "my rank", periodic reset |
| V2 Payment system | Covered (`design-payments`) | None |
| **V2 Digital wallet** | **Missing** (one passing mention in `transactions`) | New `design-wallet`: balance transfers across shards, 2PC vs TC/C vs saga, event sourcing and replay, reproducibility |
| **V2 Stock exchange** | **Missing** | New `design-exchange`: order book and matching engine, sequencer, single-threaded low-latency core, determinism and recovery, market data fan-out |

Counting the 25 design chapters (12 in V1, 13 in V2): 13 are covered by an existing design page (11 of V1, plus payments and hotel
reservation from V2). Seven have no page or concept at all (Drive, maps, ad clicks, email, leaderboard, wallet, exchange). Five more
are covered only as concepts or in part (proximity, nearby friends, queue, metrics, S3), so a full design page would be new.
That makes up to 11 new design pages, plus deepening `object-storage`. Each needs a `case` in
`server/system_design_content.py` and a knowledge-point file, as the existing 13 have.

## 2. DDIA (1st edition, all 12 chapters) against your lessons

**Method and honesty.** I extracted the whole 1st-edition text and went chapter by chapter. For each I compared the contents with the
matching lessons and read in full the sections where your lessons were thin or silent; sections your lessons already cover well I
skimmed or spot-checked, not read line by line. Chapters 10 and 12 were read selectively (batch joins, derived data and the ethics
chapters were not read in depth). All additions are paraphrased and cite the chapter.

### Done (uncommitted edits, all with a `Source: Kleppmann ... ch. N` line and a DDIA entry in `sources`)

| Chapter | Lesson edited | Added |
|---|---|---|
| 1 Reliable, scalable, maintainable | `service-quality` | latency vs response time, queueing and head-of-line blocking, can't average percentiles, fault vs failure, operator-error stat |
| 2 Data models | `data-models` | schema-on-read vs on-write, document locality limits, property graph model in more detail |
| 3 Storage and retrieval | `storage-engines`, `indexes` | Bitcask-style log+hash index, SSTable advantages, B-tree internals (branching factor, WAL need, latches, copy-on-write), LSM tail-latency and unthrottled-write risks, OLTP vs OLAP, star schema, column compression and sort order, materialised views and data cubes, heap vs clustered vs covering index |
| 4 Encoding and evolution | `event-streams`, `api-contracts` | JSON number/binary pitfalls, Protobuf/Thrift field tags, Avro writer/reader schemas, language-native serialisation risks, unknown-field loss on rewrite, request/response compatibility directions, RPC is not a local call |
| 5 Replication | `replication`, `consistency`, `outbox` | replication log formats, adding a follower, consistent-prefix reads, ID reuse on failover, multi-leader conflict handling and topologies, extra quorum edge cases, staleness monitoring, what "concurrent" means, version vectors, dual-write ordering race, CDC vs event sourcing, CQRS |
| 6 Partitioning | `partitioning` | hashing pitfalls and compound keys, proportional-to-nodes partitioning, pre-splitting, automatic vs manual rebalancing hazard, request routing |
| 7 Transactions | `transactions` | ACID critique, single- vs multi-object, retry traps, how read committed and snapshot isolation work (MVCC), read skew, isolation naming mess, serial execution vs 2PL vs SSI, phantoms and materialised conflicts |
| 8 Distributed systems trouble | `consensus`, `retry-identity` | monotonic vs time-of-day clocks, drift and NTP error figures, clock confidence intervals (TrueTime), LWW data loss, ambiguous timeouts and queueing, adaptive timeouts |
| 9 Consistency and consensus | `consensus`, `consistency` | Lamport timestamps, total order broadcast, 2PC with in-doubt blocking and when distributed transactions work, linearizability uses and cost |
| 11 Stream processing | `event-streams` | event vs processing time, window types, three join kinds, micro-batching vs checkpoints, effectively-once, idempotent sinks |
| 12 Future of data systems | `guarantees` | timeliness vs integrity |

### Large gaps left as notes (not added; each is a lesson-sized job)

1. **Time, clocks and ordering** as its own lesson (chapters 8-9): synchronous vs asynchronous vs partially synchronous system models,
   crash-stop vs crash-recovery vs Byzantine faults, safety vs liveness, hybrid logical clocks, causal consistency implementations.
   Only a compact section now sits inside `consensus`.
2. **Stream processing** as its own lesson (chapter 11): CDC internals, event-sourcing patterns, stream-table duality, joins and
   exactly-once in depth. Now a compact section in `event-streams`.
3. **Batch processing** (chapter 10): the Unix philosophy, MapReduce and its lineage, sort-merge vs broadcast-hash vs partitioned-hash
   joins and skew handling, immutable inputs and outputs, dataflow engines (Spark, Flink), graph processing (Pregel). No lesson covers it.
4. **Derived data and integration** (chapter 12): unbundling the database, Lambda and Kappa architectures, designing around dataflow,
   the end-to-end argument, enforcing uniqueness through a partitioned log, auditing and "trust but verify".
5. **Encoding and schema evolution** as its own lesson (chapter 4): what is now a table inside `event-streams` deserves a page,
   including dataflow through databases, services and message brokers, and actors.
6. **Data models, query languages and graphs** (chapter 2): declarative vs imperative queries, MapReduce querying, Cypher, SPARQL and
   Datalog, graph traversal examples. Only a paragraph exists.
7. **Ethics and privacy** (chapter 12, "Doing the Right Thing"; a full chapter in the 2nd edition): predictive analytics, tracking,
   consent, data as a liability. Not in any lesson.
8. **Operability, simplicity and evolvability** (chapter 1) and **single-node vs distributed** trade-offs: a short "why not distribute?" lesson.
9. **Knowledge points.** The 17 lessons edited this session (see section 4) now have stale knowledge-point files (the stored
   `source_hash` no longer matches). They need regenerating in-session, not through OpenRouter.

### 2nd edition (2026), from web summaries only; I have not seen the book
- 14 chapters, a Kleppmann and Riccomini co-authorship. Trade-offs and non-functional requirements open the book; streaming gets two
  chapters; ethics gets a full chapter.
- "Partitioning" is now **"Sharding"**: your `partitioning` lesson should at least mention the term, ideally retitle. Not done.
- New or expanded: vector embeddings and vector indexes, GraphQL, CQRS and event sourcing, **durable execution**, formal methods,
  and cloud-native architecture (object storage as database storage, separation of storage and compute, serverless).
  Candidate edits: link `embeddings` from the data lessons, add a durable-execution section (also relevant to the AI agents track),
  and add a cloud-native section to `storage-engines`. Not done because I can't verify details.
- Examples modernised to Kafka, Flink, Spark, Snowflake, DynamoDB. Some 1st-edition facts I used are dated (for example ZooKeeper as
  the default coordination service); I wrote them with Raft-based alternatives where relevant.

## 3. Fundamentals section: what is there and what to add

Current course (`server/tracks/courses.py`): 4 categories and 9 lessons of about 12 KB each (system-design lessons are about 20 KB):
Languages (`java-concurrency`, `python-runtime`), Linux and networking (`linux-processes`, `networking-stack`), Databases
(`postgres-internals`), Cloud and delivery (`kubernetes`, `aws-core`, `cicd-iac`, `home-lab`).

Proposed additions, in priority order, each as a lesson in the existing format (story, activities, questions, sources):

1. **Security (new category).** AuthN vs AuthZ, sessions and cookies (SameSite, HttpOnly), JWT, OAuth 2.0 with PKCE and OIDC,
   OWASP web risks (XSS/CSP, CSRF, SSRF, injection, broken object-level authorization), password hashing, TLS and envelope encryption.
   Probably two to three lessons. Largest gap and a P0 in the roadmap repo.
2. **SQL fundamentals (extend "Databases in depth").** Joins, NULL logic and the logical order of a SELECT, normalisation and when to
   denormalise, constraints, window functions, query plans. A prerequisite for `indexes` and `transactions`.
3. **Operating systems (extend "Linux and networking").** Scheduling, virtual memory and paging, deadlock and synchronisation
   primitives, file systems and journaling. `linux-processes` covers practice; theory is missing.
4. **Design and architecture (new category).** SOLID and design patterns, class and sequence diagrams, a few classic LLD prompts;
   architecture styles (layered, event-driven, CQRS, sagas, strangler, 12-factor, service mesh).
5. **Testing and reliability (new category).** Testing pyramid, mocks vs fakes, contract and property-based tests, load vs soak tests,
   chaos engineering, blameless postmortems.
6. **Languages (extend).** Garbage collection algorithms, type systems, closures, error-handling models, async primitives.
7. **Tooling.** Git internals and workflows (rebase vs merge, bisect, reflog).
8. **Agents (AI track, not Fundamentals).** Multi-agent patterns, memory types, durable orchestration, reflection and autonomy levels.

Also worth deciding: the two optional "Under the hood" AI categories and `home-lab` show the course already mixes core and
nice-to-have material; the new categories above would make the core/optional split worth marking.

## 4. Edited this session (all uncommitted)
Fact fixes: `numbers` (NVLink), `rate-limiting` (header standard), `object-storage` (erasure coding).
DDIA additions: `service-quality`, `data-models`, `storage-engines`, `indexes`, `event-streams`, `api-contracts`, `replication`,
`consistency`, `outbox`, `partitioning`, `transactions`, `consensus`, `retry-identity`, `guarantees`.
Their knowledge-point files are stale (hash mismatch) and need regenerating in-session. Full test suite passes (1253).
