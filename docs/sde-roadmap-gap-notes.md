# Gap notes: aasthas2022/SDE-Interview-and-Prep-Roadmap

Source: https://github.com/aasthas2022/SDE-Interview-and-Prep-Roadmap (cloned 2026-11-10, 1 commit).
Compared against this project's lessons (`server/system_design_lessons`, `server/tracks/content/{ai,fundamentals,practical}`,
`server/knowledge_base/points`) by keyword and by reading the lesson lists. Notes only; nothing was imported.

## What the repo actually is

- A 699-topic **checklist** (README, 15 domains, P0/P1/P2 priorities). About 31 topics (4.4%) have written content.
  The rest are bare titles, so the **taxonomy** is the useful part.
- Written content: 10 "Agent Fundamentals" guides (~26 KB each), Microservices (54 KB), REST (32 KB), Git/GitHub/GitOps (18 KB),
  a database guide plus ACID / constraints / normalisation / joins / DDL / DCL pages (each 2-4 KB), Arrays, Linked List,
  Two-pointer, Sliding-window, and the PDFs of Xu's *System Design Interview* and Kleppmann's *DDIA* (copyrighted; don't copy).
- Quality: the agent guides are one template (mental model, vocabulary, "Q1 what is X / Q2 example of X / Q3 what goes wrong /
  Q4 how to test X" x 10 sections). That is generic AI text, far less specific than this project's lessons. Treat it as a topic
  list, not as source material. Per the repo's own conventions, anything adopted should be re-grounded, not pasted.

## Topics this project does not cover

Checked with keyword counts across the lessons and knowledge points (0 hits unless noted).

**Databases and SQL fundamentals** (project has Postgres internals, transactions, indexes, storage engines, but no SQL-basics course)
- Joins (inner/left/right/full/cross), normalisation 1NF-BCNF and when to denormalise, SQL categories DDL/DML/DQL/DCL/TCL,
  constraints (PK/FK/unique/check/default), `GRANT`/`REVOKE`, window functions, materialised views, bitmap indexes.
- The repo's `relational-db-overview.md` has a NULL / three-valued-logic section and the logical order of SELECT processing.
  Those are the stronger interview staples among these.

**Security** (no web/auth security lesson; only AI guardrails and a PR-review exercise touch it)
- AuthN vs AuthZ, JWT (claims, signature validation, key rotation), OAuth 2.0 code + PKCE, OIDC, SAML/SSO, MFA, passkeys/WebAuthn,
  RBAC vs ABAC, workload identity.
- OWASP Top 10 web items: XSS/CSP, CSRF, SSRF, CORS, SQL injection, BOLA/IDOR, file-upload validation, request smuggling.
- Crypto: envelope encryption, KMS, password hashing (Argon2/bcrypt), HMAC, AEAD, TLS/mTLS/cert rotation
  (TLS handshake and mTLS are touched in `networking-stack`; the rest is missing).
- Threat modelling (STRIDE), supply chain (SBOM, SAST/DAST/SCA), zero trust, tamper-evident audit logs.
- Note: `../sys_des_full_dump/data/internals` has csrf, xss and oauth entries (with matching widgets); this project has none.

**Operating systems** (only Linux processes/memory/files and some deadlock notes in Java concurrency and Postgres)
- Scheduling (EDF, fair share, WFQ), page replacement (LRU/FIFO/Clock/Optimal), demand paging, buddy allocation, mmap,
  file systems (journaling ext3/ext4, NFS/SMB, HDFS/Ceph), mutex/semaphore/monitor theory, deadlock detection and prevention.

**Low-level / object-oriented design** (the repo has the domain but no content; this project has none either)
- SOLID, DRY/KISS/YAGNI, Law of Demeter, GoF patterns (creational/structural/behavioural), UML (class, sequence, state),
  classic LLD prompts. Zero "design pattern" hits in the project.

**Software architecture styles**
- CQRS (0 hits), strangler fig (0), 12-factor (0), choreography vs orchestration (0), layered architecture (0), SOA vs microservices,
  service registry/discovery, sidecar and service mesh (1-2 passing mentions), event sourcing (2 mentions), HATEOAS / Richardson
  maturity model (0), contract testing (0), DDD bounded contexts (0).
- Saga, circuit breaker, API gateway, canary and blue-green *are* covered.

**Testing and reliability**
- Testing pyramid vs trophy, mocks/stubs/fakes/spies, property-based and fuzz testing, Testcontainers, consumer-driven
  contract tests, load vs stress vs spike vs soak, chaos engineering and game days (one mention in `recovery.md`),
  blameless postmortem structure (mentioned, not taught). SLO/burn rate, tracing and RED/USE are covered.

**Agentic AI** (project has agents, MCP, RAG, evals, guardrails, prompting, plus five AI system design cases)
- Missing: multi-agent systems (supervisor/worker, handoffs, arbitration, typed inter-agent messages, when not to add agents),
  framework orchestration (LangGraph state graphs/reducers/checkpoints/interrupts, LangChain, LangSmith, AutoGen/CrewAI),
  durable execution and resume-after-restart, autonomy levels and "minimum sufficient autonomy",
  reflection/self-critique and its limits (0 hits), memory taxonomy (working / episodic / semantic / user preferences;
  0 hits for "long-term memory" and "episodic"), memory ageing/deletion/conflict resolution, tenant-scoped memory,
  stop conditions and turn budgets as a standalone topic.
- Partly covered: ReAct, HITL approvals, checkpointing, context compaction, LLM-as-judge, caching, MCP.
- The repo's extra system-design prompts worth borrowing as drills: CSV/Excel validation agent, job-search agent,
  incident-response assistant with read-only diagnostics, multi-agent research workflow. (This project already has research,
  review, support, extraction and inference-platform cases.)

**Cloud** (project has `aws-core`, `kubernetes`, `cicd-iac`)
- Lambda cold starts and concurrency, SQS standard vs FIFO / EventBridge / SNS filters / Kinesis vs Kafka,
  DynamoDB hot partitions and GSIs, EBS vs EFS vs S3, security groups vs NACLs, VPC peering/transit gateways,
  reserved vs spot, cost allocation and tagging, Terraform state/locking/drift, Docker multi-stage builds and image scanning.
  Check `aws-core.md` before adding: several of these may be partly present.

**Programming-language concepts** (project has Python runtime and Java concurrency)
- GC algorithms (mark-sweep, generational, reference counting; only incidental mentions), type systems (nominal vs structural,
  strong vs weak), closures / higher-order functions, tail recursion, exceptions vs error codes, paradigms comparison, regexes,
  async primitives (callbacks, futures, promises; coroutines are covered in Python/asyncio).

**Data structures and algorithms**
- The project is problem-led (NeetCode 150, skills and templates), not topic-led, so these have no concept lessons:
  classic sorts (bucket/radix/Tim, etc.), string algorithms (KMP, Rabin-Karp, Z, Aho-Corasick, Manacher, suffix array/tree),
  skip lists, cuckoo / Robin Hood hashing, count-min sketch (Bloom filter is covered), Karatsuba/Strassen/FFT, Huffman coding,
  Prim/Kruskal MST, interpolation/exponential/ternary search. Mostly P2 even in the source; low value for this project.

**Tooling**
- Git internals and workflows (rebase vs merge, GitOps). Nothing in the project.

## What looks worth acting on (my read, for Nikhil to decide)

1. Security fundamentals (authN/Z, OAuth/JWT, OWASP web items): the largest gap that interviews actually probe, and the repo's
   own taxonomy marks it P0.
2. SQL fundamentals (joins, NULL logic, window functions, normalisation): small, high-frequency, and a natural prerequisite
   for `indexes` / `transactions`.
3. Multi-agent systems, agent memory, and durable orchestration: a natural extension of the existing agents/MCP/evals track.
4. LLD / design patterns: only if you expect that round; none exists today.
5. Skip the rest (OS theory, language trivia, niche algorithms) unless a target role asks.

## Caveats

- Nothing here was fact-checked; the source is AI-generated and some of its guides are boilerplate.
- Keyword counts are a rough screen, so a topic with a hit may still be thin and one with zero hits may be covered under
  other words. Spot-check before writing a lesson.
