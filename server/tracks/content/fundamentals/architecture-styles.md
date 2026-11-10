---
id: architecture-styles
category: architecture
skill: architecture
title: 'Architecture styles: from modular monoliths to CQRS'
minutes: 17
summary: Architecture is the set of decisions that are expensive to change. Start with a well-modularised monolith, organised by domain with hexagonal boundaries, and split out services when team or scaling needs justify the distributed-systems cost. Domain-driven design gives the vocabulary for where to cut (bounded contexts). Across services, a saga coordinates a business transaction by choreography (events) or orchestration (a coordinator). CQRS separates write and read models, often fed by events. The strangler fig replaces a legacy system piece by piece, and the twelve-factor rules keep services deployable anywhere.
objectives:
  - Compare layered, hexagonal, modular monolith and microservice structures, and when to split
  - Use DDD terms (bounded context, ubiquitous language, aggregate, anti-corruption layer) correctly
  - Choose between choreography and orchestration for a saga, and design compensations
  - Explain CQRS and event sourcing, and the costs they bring
  - Plan a strangler fig migration and recite the main twelve-factor rules
sources:
  - ['Martin Fowler, MonolithFirst', 'https://martinfowler.com/bliki/MonolithFirst.html']
  - ['Martin Fowler, StranglerFigApplication', 'https://martinfowler.com/bliki/StranglerFigApplication.html']
  - ['Martin Fowler, CQRS', 'https://martinfowler.com/bliki/CQRS.html']
  - ['Chris Richardson, microservices.io: Saga pattern', 'https://microservices.io/patterns/data/saga.html']
  - ['The Twelve-Factor App', 'https://12factor.net/']
  - ['Alistair Cockburn, Hexagonal architecture', 'https://alistair.cockburn.us/hexagonal-architecture/']
---

## Structuring one codebase

- **Layered** (presentation → application → domain → data access): familiar, and fine for CRUD. The trap is that every feature touches every layer, and the domain ends up depending on the database.
- **Hexagonal** (ports and adapters, or "clean" architecture): the domain sits in the middle and defines **ports** (interfaces such as `OrderRepository`, `PaymentGateway`); **adapters** implement them for Postgres, Stripe, HTTP or a test fake. Dependencies point inward, so business logic is testable without infrastructure and swapping a vendor touches one adapter. It's dependency inversion (see [low-level design](#/fundamentals/lesson/lld-design)) applied at the system level.
- **Modular monolith**: one deployable, divided into modules by business domain (billing, catalogue, shipping), each with its own internal model and a narrow public interface, ideally its own schema. You get most of the design benefits of services without network calls, distributed transactions or 40 deploy pipelines.

## When to split into services

Microservices buy **independent deployment and scaling per team**, and fault isolation. They cost network latency and failure modes, distributed data (no cross-service joins or transactions), versioned contracts, and a lot of platform work: service discovery, tracing, CI/CD per service, on-call per service. Good reasons to split: separate teams blocked on each other's releases, a component with very different scaling or reliability needs, or a hard isolation boundary (payments, PCI scope). Weak reasons: "it's modern", or splitting by technical layer (an "auth service", a "DB service") so every feature still needs every service.

Split along **domain boundaries**, so most changes touch one service. If a feature regularly needs coordinated deploys of three services, you've built a **distributed monolith**: the costs of both and the benefits of neither.

```sort
prompt: Microservice or keep it in the monolith (as a module)?
buckets: [Split into a service, Keep as a module]
items:
  - {text: 'Video transcoding: bursty, GPU-heavy, scales nothing like the web tier', bucket: 0, why: 'Very different resource and scaling profile.'}
  - {text: 'A 6-person startup''s user profile, settings and notifications', bucket: 1, why: 'One team, one release cadence: services add cost without benefit.'}
  - {text: 'Card payments, which must be isolated for PCI compliance', bucket: 0, why: 'A hard security and audit boundary.'}
  - {text: 'An "email formatting" helper used by every feature', bucket: 1, why: 'A library, not a service; a network hop buys nothing.'}
  - {text: 'Search, owned by a separate team shipping daily on its own schedule', bucket: 0, why: 'Independent team and deploy cadence.'}
```

## Domain-driven design in five terms

- **Ubiquitous language**: the words domain experts use ("policy", "claim", "excess") appear unchanged in code, so conversations and code don't drift apart.
- **Bounded context**: a boundary within which a model and its language are consistent. "Customer" means something different to billing (a payer with a credit limit) and to support (a person with tickets). Each context keeps its own model, and they translate at the edges. Bounded contexts are the natural seams for modules or services.
- **Aggregate**: a cluster of objects changed together under one root that enforces invariants ("an order's lines must total its amount"). Transactions shouldn't span aggregates; reference other aggregates by ID.
- **Domain events**: facts the domain cares about (`OrderPlaced`, `PaymentFailed`), the glue between contexts.
- **Anti-corruption layer**: a translation layer in front of a legacy or third-party model so its concepts don't leak into yours. Essential during migrations.

## Sagas: choreography or orchestration

A business transaction across services (place order → reserve stock → charge card → book shipping) can't use one database transaction. A **saga** is a sequence of local transactions, each publishing an event or replying to a command, with a **compensating action** for each step that undoes it semantically (release stock, refund the charge) if a later step fails. Reliable publishing needs the outbox pattern (see [the outbox lesson](#/system-design/lesson/outbox)).

- **Choreography**: each service reacts to others' events. No central coordinator, loose coupling, easy to add a listener. But the flow exists nowhere in code; with more than a few steps it becomes hard to see, test and change, and cyclic dependencies creep in.
- **Orchestration**: a coordinator (a workflow engine such as Temporal or AWS Step Functions, or a state machine in the owning service) tells each service what to do and handles failures. The flow is explicit and testable, with one place for timeouts and compensation. The orchestrator must be made durable, and can become a god service if it absorbs domain logic.

```timeline
title: An orchestrated order saga
lanes: [Order saga, Inventory, Payments, Shipping]
state: {Stock: available, Card: 'not charged', Order: pending}
steps:
  - {lane: Order saga, to: Inventory, text: 'ReserveStock(order 7)', set: {Stock: 'reserved for 7'}}
  - {lane: Order saga, to: Payments, text: 'Charge(order 7, $40)', set: {Card: 'charged $40'}}
  - {lane: Order saga, to: Shipping, text: 'BookShipment(order 7) → fails: no courier for that address'}
  - {lane: Order saga, to: Payments, text: 'Compensate: Refund(order 7)', set: {Card: 'refunded'}}
  - {lane: Order saga, to: Inventory, text: 'Compensate: ReleaseStock(order 7)', set: {Stock: available, Order: 'cancelled, customer told why'}}
crashes:
  - after: 1
    label: orchestrator crashes after the charge
    verdict: safe
    text: If the saga's state is durable (a workflow engine or a saga table updated with each step), it resumes at "book shipment". Each step uses an idempotency key, so a retried charge isn't taken twice.
  - after: 3
    label: crash between refund and stock release
    verdict: stuck
    text: Stock stays reserved for a cancelled order unless the saga resumes and finishes compensating. Compensations must be retried until they succeed, and must be idempotent. A reservation with a timeout makes this self-healing.
```

```sort
prompt: Choreography or orchestration?
buckets: [Choreography (events), Orchestration (a coordinator)]
items:
  - {text: 'When a user signs up, three teams independently send a welcome email, create a CRM record and start a trial', bucket: 0, why: 'Independent reactions to one fact; no ordering or compensation.'}
  - {text: 'A loan application: credit check, then fraud check, then underwriting, with timeouts and manual review', bucket: 1, why: 'A long, ordered flow with failures and humans: make it explicit.'}
  - {text: 'An eight-step order fulfilment with refunds and stock release on failure', bucket: 1, why: 'Compensation logic in one place.'}
  - {text: 'Analytics, search indexing and cache invalidation all react to ProductUpdated', bucket: 0, why: 'Fan-out to listeners the producer needn''t know.'}
```

## CQRS and event sourcing

**CQRS** (command query responsibility segregation) uses different models for writing and reading. Commands go to a write model shaped around invariants (normalised, transactional); queries read from one or more **read models** shaped for the screens that use them (denormalised views, a search index, a cache), updated from the write side's events or change data capture. It earns its keep when reads and writes have very different shapes or loads; the cost is **eventual consistency** between them (a user saves and doesn't see the change for a moment, unless you read your own writes from the write side) and more moving parts.

**Event sourcing** stores the sequence of events (`Deposited 50`, `Withdrew 20`) as the source of truth, and derives current state by replaying them (with periodic snapshots). It gives a perfect audit trail, time travel ("what was the balance on 3 March?") and new read models built by replaying history. It costs schema evolution of events forever, replay time, and a harder mental model. It pairs naturally with CQRS, but either can be used alone. Ledgers, bookings and anything audit-heavy are the good fits; a CRUD settings page is not.

## The strangler fig

Big-bang rewrites of legacy systems fail famously: years without shipping, then a cutover that finds everything the old system did implicitly. The **strangler fig** (Fowler, after a vine that grows around a tree until it replaces it) migrates incrementally:

1. Put a **routing facade** (proxy, API gateway) in front of the legacy system.
2. Build one capability in the new system, behind an **anti-corruption layer** that translates to the old model.
3. Route that slice of traffic to the new system, ideally shadowing first and comparing results.
4. Repeat, slice by slice. Data migration usually needs a period of syncing both ways (change data capture).
5. Retire the legacy system when nothing routes to it.

```arch
title: Strangling a legacy order system
nodes:
  - {id: client, label: Clients, kind: client, x: 0, y: 1}
  - {id: gw, label: 'Routing facade', kind: lb, x: 1, y: 1, note: 'routes by path'}
  - {id: legacy, label: 'Legacy monolith', kind: service, x: 2, y: 2}
  - {id: legacydb, label: 'Legacy DB', kind: db, x: 3, y: 2}
  - {id: acl, label: 'Anti-corruption layer', kind: service, x: 2, y: 0}
  - {id: new, label: 'New orders service', kind: service, x: 3, y: 0}
  - {id: newdb, label: 'Orders DB', kind: db, x: 4, y: 0}
edges:
  - [client, gw, 'all traffic']
  - [gw, legacy, '/invoices, /reports, …']
  - [gw, new, '/orders']
  - [new, newdb]
  - [legacy, legacydb]
  - [new, acl, 'needs customer data']
  - [acl, legacy, 'translated calls']
caption: Only /orders has moved. The facade decides per route; the anti-corruption layer keeps the legacy model out of the new service. Each slice can be rolled back by flipping its route.
```

## The twelve-factor rules

Heroku's 2011 checklist for services that deploy cleanly anywhere. The ones interviewers ask about:

- **Config in the environment**, not in code: the same build runs in every environment.
- **Backing services as attached resources**: the database is a URL; swap it without code changes.
- **Build, release, run** are separate stages; a release is an immutable build plus config.
- **Stateless processes**: no sticky local state; sessions and files go to backing services, so any instance can serve any request and instances can be killed.
- **Port binding**: the service exports HTTP itself rather than being injected into a server.
- **Disposability**: fast start-up and graceful shutdown on SIGTERM.
- **Dev/prod parity**, and **logs as event streams** to stdout, collected by the platform.

```sort
prompt: Which twelve-factor rule does each practice break?
buckets: [Config in the environment, Stateless processes, Logs as event streams, Disposability]
items:
  - {text: 'The database password is in settings_prod.py, committed to git', bucket: 0}
  - {text: 'Uploaded avatars are saved to the instance''s local disk', bucket: 1, why: 'Another instance can''t serve them, and they vanish on redeploy.'}
  - {text: 'The app writes rotating log files to /var/log/app/', bucket: 2, why: 'Write to stdout and let the platform route it.'}
  - {text: 'The service takes four minutes to start and ignores SIGTERM', bucket: 3, why: 'Slow scaling and dropped requests on every deploy.'}
  - {text: 'User sessions are kept in an in-process dictionary', bucket: 1, why: 'Use Redis or signed cookies.'}
```

Contract tests between services (consumers publish what they rely on, providers verify it in CI) are covered in [testing strategy](#/fundamentals/lesson/testing-strategy).

```questions
- kind: check
  prompt: A team splits its app into 12 microservices. Every feature now needs changes to four services deployed together in a fixed order. What have they built?
  choices:
    - text: A distributed monolith - service boundaries that don't match domain boundaries
      correct: true
    - text: A well-factored microservice system, because each service is small
      why: Small isn't the goal; independent change is.
    - text: An event-driven architecture
      why: Nothing here is about events.
    - text: A strangler fig migration
      why: That replaces a legacy system incrementally.
  explanation: Split by bounded context so most changes touch one service.
- kind: check
  prompt: When does orchestration beat choreography for a saga?
  choices:
    - text: For long, ordered flows with timeouts and compensations you want explicit and testable
      correct: true
    - text: When many independent teams just want to react to the same event in their own way
      why: That's choreography's sweet spot.
    - text: Whenever you want looser coupling between services
      why: Choreography is the more loosely coupled option.
    - text: Only when all services share a database
      why: Sagas exist because they don't.
  explanation: The flow lives in the orchestrator rather than being spread across listeners.
- kind: check
  prompt: What is the main cost CQRS introduces?
  choices:
    - text: Read models lag behind writes, so you must handle eventual consistency
      correct: true
    - text: Writes can no longer be transactional, because two models are updated
      why: The write model is usually transactional.
    - text: It requires event sourcing
      why: CQRS works without event sourcing.
    - text: Queries become slower
      why: Read models usually make queries faster.
  explanation: Design for read-your-own-writes where users expect it.
- kind: check
  prompt: In a saga, what is a compensating action?
  choices:
    - text: A step that semantically undoes an earlier one, such as refunding a charge
      correct: true
    - text: A distributed database rollback across every service in the saga
      why: There's no cross-service rollback; that's why sagas exist.
    - text: A retry of the failed step
      why: Retries are separate; compensation undoes earlier steps.
  explanation: Compensations must be idempotent and retried until they succeed.
- kind: fire
  prompt: In DDD, what is a bounded context?
  choices:
    - text: A boundary within which one model and its language are consistent
      correct: true
    - text: A database schema owned by exactly one service
      why: It may map to one, but it's a modelling boundary.
    - text: A network security perimeter around a group of services
      why: Not the meaning.
  explanation: "Customer" can mean different things in billing and support.
- kind: fire
  prompt: Which pattern migrates a legacy system slice by slice behind a routing facade?
  choices:
    - text: Strangler fig
      correct: true
    - text: Big-bang rewrite
      why: That replaces it all at once.
    - text: Blue-green deployment
      why: That swaps whole versions of one system.
  explanation: Each slice can be rolled back by flipping its route.
- kind: fire
  prompt: Where should a twelve-factor app keep its configuration?
  choices:
    - text: In environment variables
      correct: true
    - text: In a config file per environment in the repository
      why: Config differs per deploy; code doesn't.
    - text: Compiled into the binary
      why: Then each environment needs its own build.
  explanation: One build, many environments.
- kind: fire
  prompt: What is event sourcing?
  choices:
    - text: Keeping the sequence of events as the source of truth and replaying it to get state
      correct: true
    - text: Publishing an event to a broker after each database write commits
      why: That's event notification; the database is still the truth.
    - text: Reading events from Kafka into a cache that serves the read side
      why: That's building a read model.
  explanation: Audit and time travel come free; schema evolution of events doesn't.
- kind: fire
  prompt: What does an anti-corruption layer do?
  choices:
    - text: Translates a legacy or external model into yours so its concepts don't leak in
      correct: true
    - text: Validates and sanitises all incoming requests to block SQL injection attempts
      why: Different meaning of "corruption".
    - text: Checksums data at rest so silent corruption is caught early
      why: Not this pattern.
  explanation: Essential when strangling a legacy system.
```
