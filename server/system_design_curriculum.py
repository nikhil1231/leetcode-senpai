"""Authored foundation course. IDs and v1 question semantics are immutable.

New semantics require a new question/version; historical attempts keep their contract.
The six assessment skills remain separate from the finer learning taxonomy.
"""
import hashlib
from copy import deepcopy

VERSION = 1
CATEGORIES = [
    ('foundations', 'Foundations', 'Start with a request, a promise, and a useful estimate.'),
    ('apis', 'APIs and application servers', 'Connect clients to dependable application behaviour.'),
    ('storage', 'Databases and storage', 'Choose how state is represented, found, and protected.'),
    ('caching', 'Caching and read paths', 'Make reads faster while respecting freshness.'),
    ('queues', 'Queues and background processing', 'Accept work durably and finish it despite failures.'),
    ('distributed', 'Distributed data and correctness', 'Reason about copies, partitions, and competing writers.'),
    ('reliability', 'Reliability and operations', 'Recognise overload, observe symptoms, and recover.'),
    ('designs', 'Putting designs together', 'Build a complete flow and explain every decision.'),
]
SOURCES = {
    'http': ('MDN: HTTP overview', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview'),
    'cache': ('MDN: HTTP caching', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching'),
    'sql': ('PostgreSQL: transaction isolation', 'https://www.postgresql.org/docs/current/transaction-iso.html'),
    'index': ('PostgreSQL: indexes', 'https://www.postgresql.org/docs/current/indexes.html'),
    'retry': ('AWS: retry-safe APIs', 'https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/'),
    'queue': ('RabbitMQ: acknowledgements and confirms', 'https://www.rabbitmq.com/docs/confirms'),
    'kafka': ('Apache Kafka: design', 'https://kafka.apache.org/43/design/design/'),
    'sre': ('Google SRE: monitoring distributed systems', 'https://sre.google/sre-book/monitoring-distributed-systems/'),
    'redis': ('Redis: keyspace and expiry', 'https://redis.io/docs/latest/develop/using-commands/keyspace/'),
    'object': ('Amazon S3: object storage overview', 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html'),
}
LESSONS = {}
QUESTIONS = {}


def q(prompt, answer, wrong1, wrong2, explanation):
    return (prompt, answer, wrong1, wrong2, explanation)


def add(key, category, skill, title, principle, worked, tradeoff, mistake, objectives, questions,
        source='http', diagram='', case=None):
    previous = next(reversed(LESSONS), None)
    ids = []
    for i, (prompt, correct, wrong1, wrong2, explanation) in enumerate(questions):
        qid = f'{key}-{"check" if i < 3 else "fire"}-{i % 3 + 1}-v1'
        shift = int(hashlib.sha256(qid.encode()).hexdigest()[:8], 16) % 3
        texts = [correct, wrong1, wrong2]
        texts = texts[shift:] + texts[:shift]
        choices = [{'id': f'c{n}', 'text': text} for n, text in enumerate(texts)]
        QUESTIONS[qid] = {'id': qid, 'version': VERSION, 'lesson_id': key, 'category': category,
                          'skill': skill, 'kind': 'quiz' if i < 3 else 'quickfire',
                          'difficulty': 'beginner' if i % 3 == 0 else 'standard',
                          'prompt': prompt, 'choices': choices,
                          'correct': next(c['id'] for c in choices if c['text'] == correct),
                          'explanation': explanation}
        ids.append(qid)
    LESSONS[key] = dict(id=key, version=VERSION, category=category, skill=skill, title=title,
                        minutes=6, principle=principle, worked=worked, tradeoff=tradeoff,
                        mistake=mistake, objectives=objectives, prerequisite=previous,
                        sources=[SOURCES[source]], diagram=diagram, case_id=case,
                        quiz_ids=ids[:3], quickfire_ids=ids[3:])


add('request-flow', 'foundations', 'requirements', 'Follow a request through a system',
    'A client asks for something, an application applies rules, and a store remembers state. Trace one operation before drawing a large architecture.',
    'Imagine saving a bookmark. Your browser sends a request to an API (the agreed interface). The server checks who you are, validates the URL, writes a bookmark to a database, then returns its ID. Reading it later is another request. A server process can restart; its memory is not automatically durable storage.',
    'Keeping the first design to one application and one database makes the flow easier to explain and operate. Add more pieces when a requirement gives them a job.',
    'A box labelled backend does not explain when data is saved or who is allowed to read it.',
    ['Identify client, application, and durable state', 'Trace a successful write and read', 'Locate authentication and ownership checks'], [
        q('Which part normally applies bookmark ownership rules?', 'The application before accessing user data', 'Only the browser colour scheme', 'The network cable', 'The server must enforce ownership; a client can send requests outside the intended UI.'),
        q('A bookmark exists only in application memory. What can a restart do?', 'Lose the bookmark', 'Automatically copy it to every database', 'Make it durable by assigning an ID', 'An identifier names data; it does not persist it.'),
        q('What is the most useful first architecture explanation?', 'Walk one save and one read through the components', 'List as many database products as possible', 'Start with global sharding before defining a request', 'A concrete flow exposes missing validation, storage, and response boundaries.'),
        q('A notes app adds a second API server. Where should shared saved notes live?', 'In a shared durable store with access controls', 'Only in the first server’s local variables', 'Only in the load balancer’s health check', 'Both servers need an authoritative place to retrieve saved state.'),
        q('A file API returns success before storing any durable bytes. What question should you ask?', 'What does success promise if the process crashes now?', 'Which icon should represent the database?', 'Can the URL be shorter?', 'The crash boundary reveals whether the response fulfils the advertised promise.'),
        q('A hidden button prevents a user from opening another account’s note in the UI. Is that sufficient?', 'No; the API must check access for the requested note', 'Yes; hidden buttons cannot be bypassed', 'Yes; authentication gives access to all notes', 'Authentication identifies the caller; authorization decides which records that caller may access.'),
    ], diagram='Browser -> Application API\nApplication API -> Database')

add('guarantees', 'foundations', 'requirements', 'Turn requirements into guarantees',
    'Separate features from the promises each operation makes. State correctness conditions, measurable targets, and what is out of scope.',
    'For seat booking, “users reserve seats” is a feature. “At most one confirmed reservation per seat” is a correctness condition. “Browsing may lag by ten seconds” is a freshness allowance. “Payments are out of scope” prevents an accidental expansion of the problem.',
    'Stricter guarantees often require more coordination. Ask what the product actually needs before paying that cost.',
    'Fast, scalable, and reliable are ambitions rather than testable requirements.',
    ['Name an invariant', 'Distinguish latency from correctness', 'Make assumptions explicit'], [
        q('Which statement is a correctness invariant?', 'At most one confirmed owner per seat', 'The service should be modern', 'Use many servers', 'An invariant must stay true across valid operations, including concurrent requests.'),
        q('An API promises durable acceptance, then returns 202 before work finishes. Is that necessarily wrong?', 'No, if acceptance is durable and status/failure can be observed', 'Yes, every 2xx means all background work finished', 'Yes, 202 requires a cache', 'The promise is acceptance, not immediate completion.'),
        q('The prompt does not specify traffic. What should you do?', 'State a reasonable estimate and ask or explain the assumption', 'Pretend a billion requests per second was specified', 'Ignore capacity entirely', 'Explicit assumptions let a reviewer judge the design against a clear workload.'),
        q('A chat product permits delayed message search but forbids cross-account access. Which can be relaxed for speed?', 'Search freshness within its stated allowance', 'Authorization checks', 'Both without telling users', 'An allowed delay is a product trade-off; unauthorized access violates the stated boundary.'),
        q('A requirements list says “respond quickly.” What makes it actionable?', 'A percentile latency target under a stated workload', 'A longer list of products', 'A larger diagram', 'A measurable target ties response time to load and the user experience.'),
        q('A reviewer asks for payment processing in a case explicitly excluding it. What is the best response?', 'Clarify the scope and discuss it as a possible extension', 'Quietly redesign everything around payment', 'Claim payment is always unnecessary', 'Keep the baseline contract clear; extensions can be explored separately.'),
    ], case='seats')

add('service-quality', 'foundations', 'capacity', 'Latency, throughput, and availability',
    'Latency is time per operation; throughput is completed operations per time unit; availability describes whether eligible requests receive the promised service.',
    'A cafe can finish 30 orders per minute while a particular customer waits five minutes. In an API, a p99 of 800 ms means 99% of the measured requests complete within 800 ms. The average can hide a slow tail. Define the measurement window and which requests count.',
    'Batching can increase throughput while making individual requests wait longer. Improving one measure does not guarantee the others improve.',
    'A fast average does not prove the slowest users have a good experience.',
    ['Separate latency and throughput', 'Interpret a percentile', 'Define a user-visible availability measure'], [
        q('Which is a throughput measure?', '800 completed requests per second', '80 milliseconds per request', '99.9% successful requests', 'Throughput counts completed work per unit time.'),
        q('An API has low average latency but a high p99. What does that suggest?', 'A slow tail that the average hides', 'Every request is equally fast', 'The database must be empty', 'Percentiles expose the experience of slower requests.'),
        q('A service accepts connections but returns errors for every valid request. Is it healthy for users?', 'No, connectivity alone does not establish useful availability', 'Yes, a listening port is enough', 'Yes, if CPU is low', 'Measure whether users obtain the promised result, not only whether a process exists.'),
        q('A batch waits one second to collect writes and improves total writes/second. What is the likely cost?', 'Extra waiting time for individual writes', 'Automatic stronger authorization', 'Guaranteed zero errors', 'Waiting to collect a batch can trade individual latency for efficiency.'),
        q('p99 latency fell while requests were being rejected at the edge. What else must you inspect?', 'Error/rejection rates and which requests enter the latency measure', 'Only successful latency', 'The number of source files', 'A success-only metric can look good while users are rejected.'),
        q('You report “99.9% available.” Which missing detail matters?', 'The time window and definition of a successful eligible request', 'The preferred editor', 'The number of diagram arrows', 'An availability number needs an explicit denominator and success contract.'),
    ], source='sre')

add('estimates', 'foundations', 'capacity', 'Estimate capacity to make a decision',
    'Write units, peak rates, data sizes, and headroom. An estimate is useful when it changes a design decision.',
    'At 20 requests/second with a 5 KB response, payload bandwidth is about 100 KB/second before protocol overhead. If 12 jobs arrive per second but only 10 finish, pending work grows by two per second. To drain 600 jobs in five minutes while 10/second still arrive, finish 12/second.',
    'Buying spare capacity costs money, but running exactly at peak leaves no room to drain a backlog or survive failures.',
    'Do not multiply daily traffic by seconds/day; first decide whether you are converting a rate or a total.',
    ['Estimate bandwidth and storage with units', 'Calculate backlog growth', 'Include recovery headroom'], [
        q('10 requests/second each return 2 KB. Approximate payload bandwidth?', '20 KB/second', '5 KB/second', '20 KB/day', 'Multiply the request rate by bytes per response; protocol overhead is additional.'),
        q('15 jobs/second arrive and 12 finish for 20 seconds. Backlog growth?', '60 jobs', '300 jobs', '3 jobs', 'The net growth rate is 3/second, multiplied by 20 seconds.'),
        q('10 jobs/second arrive, 600 wait, and you want to drain them in 300 seconds. Required completion rate?', '12 jobs/second', '10 jobs/second', '2 jobs/second', 'Two extra completions per second drain the backlog while ten handle new arrivals.'),
        q('Each worker handles 2 jobs/second; peak arrivals are 30/second. What do 15 workers provide?', 'Capacity matching arrivals, with no drain headroom', 'Enough capacity to drain any backlog immediately', 'Only 15 jobs/second', '15 × 2 = 30. Recovery and failures require additional capacity or reduced arrivals.'),
        q('A store receives 1,000 records/day at 1 KB each. Approximate raw growth over 30 days?', '30 MB in decimal units, before indexes and replicas', '30 GB before indexes', '1 KB total', '30,000 × 1 KB is about 30 MB. State overhead assumptions separately.'),
        q('Adding API servers leaves throughput unchanged while database CPU stays saturated. Best next step?', 'Investigate the database bottleneck and query workload', 'Keep adding API servers indefinitely', 'Remove all measurements', 'Capacity follows the limiting resource; scaling another tier may add load without increasing completions.'),
    ], source='sre')

add('api-contracts', 'apis', 'requirements', 'Design an API contract',
    'An API contract defines inputs, outputs, errors, identity, and what success means. Pagination splits a potentially large result into bounded pages.',
    'GET /bookmarks?cursor=... returns a page owned by the caller. POST /bookmarks validates a URL and returns an ID. Decide how errors are represented and what a retry means. A cursor can encode a position in a stable sort such as (created_at, id), rather than the number of rows to skip.',
    'Cursor pagination can handle a growing list better than large offsets, but does not automatically give a frozen snapshot across pages.',
    'An unguessable record ID does not replace an ownership check.',
    ['Specify success and error responses', 'Bound list responses', 'Define stable ordering and ownership'], [
        q('Why paginate a bookmark listing?', 'Bound response size and work per request', 'Make authorization unnecessary', 'Guarantee every page is a database snapshot', 'Bounded pages limit memory, transfer size, and query work.'),
        q('Two records share created_at. What makes cursor ordering deterministic?', 'Add a unique tie-breaker such as ID', 'Sort only by created_at and hope', 'Return all rows forever', 'A unique tie-breaker gives each record a defined position.'),
        q('A client knows another user’s bookmark ID. What must the API do?', 'Check ownership before returning it', 'Return it because IDs are hard to guess', 'Trust the referring web page', 'Authorization applies to each requested resource.'),
        q('A feed uses offset pagination while new posts are inserted at the front. What can happen?', 'Pages can skip or repeat entries as positions shift', 'The list becomes transactionally frozen', 'All inserts are prevented', 'Offsets describe positions in a changing list, not stable record boundaries.'),
        q('An export endpoint returns 202 and a job ID. What companion operation is useful?', 'A way to inspect job status and terminal failure', 'A guarantee the file is already downloaded', 'A public list of every user’s exports', 'Asynchronous acceptance needs an observable completion/failure path.'),
        q('A client sends an invalid URL. Which contract is clearer?', 'A documented validation error with no bookmark created', 'Success with silently corrupted data', 'An undocumented random response shape', 'Clients need predictable errors and a clear boundary around state changes.'),
    ])

add('stateless-balancing', 'apis', 'capacity', 'Stateless servers and load balancing',
    'A load balancer routes requests among application instances. Stateless application handling means necessary shared state is available outside any one process.',
    'If login sessions live only in server A’s memory, a request routed to B may appear logged out. Shared session storage or appropriately verified tokens can avoid that dependency. Health checks should remove failing instances, while deployment drains ongoing work safely.',
    'Shared state adds a dependency. Sticky routing can reduce movement but does not make local memory durable or protect it from a server crash.',
    'Stateless does not mean the whole product has no state; it means a particular application instance is replaceable.',
    ['Explain shared versus process-local state', 'Route across healthy instances', 'Recognise the limits of sticky sessions'], [
        q('What does a load balancer primarily do?', 'Distribute requests among eligible backends', 'Make every database write atomic', 'Persist all application variables', 'Routing is separate from persistence and database coordination.'),
        q('Sessions exist only on server A. Why might adding B break login?', 'B cannot see A’s process-local sessions', 'Two servers cannot serve HTTP', 'The database must be deleted', 'Shared state or verifiable client credentials are needed across instances.'),
        q('Does sticky routing protect a session when its server dies?', 'No, routing affinity does not preserve lost memory', 'Yes, affinity is a backup', 'Yes, if the browser retries often', 'Routing a user consistently is different from storing recoverable state.'),
        q('You double application servers, but every request waits on the same overloaded database. What follows?', 'Throughput may remain constrained by that database', 'Throughput must double', 'Every request becomes independent of storage', 'The shared bottleneck still limits the overall flow.'),
        q('An instance is being shut down. What helps avoid dropping ongoing requests?', 'Stop new routing and drain existing requests within a deadline', 'Kill it immediately without coordinating', 'Increase its cache TTL', 'Graceful draining allows inflight work to finish before termination.'),
        q('Which design best allows any healthy API server to resume a job status request?', 'Store job state in shared durable storage', 'Keep status only in a worker’s local variable', 'Put the status in a health check name', 'Replaceable servers retrieve shared authoritative state.'),
    ])

add('sync-async', 'apis', 'retries', 'Synchronous or asynchronous work?',
    'Synchronous work completes in the request path. Asynchronous work is accepted now and processed later, with a separate way to observe its result.',
    'A small profile read fits a direct response. A video conversion may take minutes: record a durable job, return its ID, then let workers update status and publish an output. A queue can smooth short bursts, but it also adds waiting and failure states.',
    'Asynchronous processing shortens the acceptance response but adds status tracking, retries, and eventual completion. It does not necessarily finish the work sooner.',
    'Returning 202 before any recoverable job exists can lose accepted work on a crash.',
    ['Choose a response boundary', 'Separate acceptance from completion', 'Expose job lifecycle states'], [
        q('Which task is a good candidate for asynchronous handling?', 'A multi-minute video conversion', 'Reading one small cached profile in milliseconds', 'Validating a required form field locally', 'Long-running work often needs a job lifecycle rather than an open request.'),
        q('An API accepts a job but a worker later fails permanently. What should users see?', 'An explicit terminal failure state', 'Success forever because acceptance succeeded', 'No status endpoint', 'Acceptance is not completion; terminal outcomes must remain observable.'),
        q('Does a queue guarantee lower completion latency?', 'No, queued work may wait before execution', 'Yes, every queued task finishes instantly', 'Yes, even under permanent overload', 'Queues decouple arrivals from execution; they can introduce waiting.'),
        q('A report API has a 10-second gateway timeout but reports take two minutes. Best contract?', 'Durable acceptance plus polling or notification of a job result', 'Promise a two-minute synchronous response through that gateway', 'Retry creation with a new job every second', 'The API boundary should fit infrastructure timeouts and avoid duplicate work.'),
        q('A worker is down for a minute. Which design can resume accepted work?', 'Persist pending jobs before acknowledging acceptance', 'Store pending jobs only on the API stack', 'Acknowledge and discard inputs immediately', 'Durable pending state survives the process failure and enables recovery.'),
        q('Users require an answer before they can choose their next action. What is a cost of moving it to a queue?', 'Clients must handle a pending state and later completion', 'The answer becomes immediately available', 'The operation no longer needs authorization', 'Decoupling changes the user contract as well as backend execution.'),
    ], source='queue', diagram='Client -> Job API\nJob API -> Durable job store\nWorker -> Durable job store')

add('retry-identity', 'apis', 'retries', 'Timeouts, retries, and idempotency',
    'A timeout means the caller did not observe a result in time. It does not prove the operation failed. Idempotency gives repeated attempts one logical effect.',
    'An order is committed but its response is lost. Retrying with the same user-scoped operation key can return the saved order instead of creating another. Store the key, request meaning, and result consistently with the effect. Reject reuse of a key with a different payload.',
    'Idempotency requires retained state and a retention policy. Define how late retries behave once a key expires.',
    'Generating a fresh key for every retry defeats deduplication.',
    ['Interpret an ambiguous timeout', 'Keep a stable operation key', 'Reject mismatched key reuse'], [
        q('A create request times out. What can the caller conclude?', 'The outcome is uncertain without checking', 'The server definitely made no change', 'The server definitely completed', 'A response can be lost before or after a committed effect.'),
        q('Which key should a retry of the same logical order use?', 'The original operation key', 'A newly generated key on every send', 'Another user’s key', 'Stable identity lets the server recognise repeated intent.'),
        q('The same key is reused with a different order payload. Best policy?', 'Reject the conflicting reuse', 'Silently change the previous order', 'Create another order while claiming deduplication', 'An operation key must refer to a consistent request meaning.'),
        q('A timeout follows a successful database commit. Why can a blind retry create two invoices?', 'The first effect may exist even though its response was lost', 'Timeouts undo all database commits', 'HTTP makes every POST exactly once', 'Transport failure and application commit are different boundaries.'),
        q('A service remembers request IDs separately after performing the effect. What must be examined?', 'A crash after the effect but before saving the ID', 'Only the length of the ID string', 'Whether a cache makes the ID attractive', 'Separate writes leave a failure window unless coordinated or reconciled.'),
        q('A deduplication key expires after one day. What must the API specify?', 'How retries after that window are handled', 'That keys never use storage', 'That every late retry is automatically safe', 'Idempotency guarantees have a scope and retention boundary.'),
    ], source='retry')

add('data-models', 'storage', 'requirements', 'Choose a data model from access patterns',
    'Start with the data relationships and queries. Relational, document, and key-value models offer different ways to represent and retrieve the same product state.',
    'A booking service needs users, seats, and reservations with constraints; relational tables can make those relationships explicit. A session lookup by token maps naturally to a key-value access pattern. A document may group fields read together. Every choice still needs ownership checks, durability, and a concurrency story.',
    'Denormalising can reduce read joins but repeats data, so updates may need to keep copies consistent. A product name alone does not tell you the correct schema.',
    'NoSQL does not mean no schema or unlimited scale.',
    ['List important queries before choosing storage', 'Recognise relationships and key lookups', 'Explain duplication costs'], [
        q('What should guide the initial data model?', 'Required queries, relationships, and guarantees', 'The newest product logo', 'Only the longest database name', 'Access patterns and correctness needs determine useful structure.'),
        q('Copying a user name into many feed records mainly adds which responsibility?', 'Keeping duplicated values consistent or accepting their staleness', 'Eliminating all update work', 'Making authorization automatic', 'Denormalisation moves some complexity from reads to writes and freshness policy.'),
        q('Does using a document database remove the need to understand data shape?', 'No, applications still depend on fields and validation', 'Yes, records can have no meaning', 'Yes, indexes become unnecessary', 'Flexible schemas do not remove application contracts or access patterns.'),
        q('An application only looks up sessions by opaque token. Which is a natural starting access pattern?', 'A key-value lookup with expiry and security controls', 'Scan every session for every request', 'A queue as the only session database', 'A direct token lookup fits the query; persistence and expiry still need a policy.'),
        q('An order must reference a valid customer and preserve relational constraints. Which is a defensible starting choice?', 'Relational tables with explicit keys and constraints', 'Any cache with no durable copy', 'A product chosen without reviewing queries', 'The relational model can represent these relationships directly, subject to a proper schema.'),
        q('A large document embeds an unbounded comment list. What should you investigate?', 'Document growth, update contention, and pagination needs', 'Only the comment font', 'Whether the list can grow without any limits', 'Grouping related data helps until size and concurrent update patterns make it costly.'),
    ], source='sql')

add('indexes', 'storage', 'capacity', 'Indexes and query access paths',
    'An index is an additional structure that helps locate rows for particular queries. It costs space and maintenance when data changes.',
    'For SELECT ... WHERE owner_id=? ORDER BY created_at,id LIMIT 20, an index beginning with owner_id and following that ordering can avoid scanning and sorting a user’s whole history. Verify with a query plan and realistic data. An index useful for one query may not help another.',
    'More indexes can accelerate reads while slowing writes and increasing storage. Choose them from the workload.',
    'An index does not automatically cover every filter or sort.',
    ['Connect an index to a query', 'Account for write and storage costs', 'Use measurements to validate a plan'], [
        q('What is a usual benefit of an appropriate index?', 'Finding matching records without a full table scan', 'Removing all write costs', 'Making stale replicas instantly current', 'An index provides a more selective access path for matching queries.'),
        q('What is a usual cost of adding an index?', 'Extra storage and write maintenance', 'Automatic loss of all transactions', 'Every query must become slower', 'The additional structure must be stored and updated.'),
        q('How should you verify that an index helps a production-like query?', 'Inspect its plan and measure with representative data', 'Assume every index helps equally', 'Count API source lines', 'Query plans and workload measurements show whether the intended path is used.'),
        q('A list filters by account and orders by creation time and ID. What should its index design consider?', 'The account filter and stable requested ordering', 'Only an unrelated status field', 'The UI theme', 'Leading equality conditions and ordering influence which access paths are useful.'),
        q('Writes slow after dozens of unused indexes are added. What is plausible?', 'Each write maintains unnecessary index structures', 'Indexes never participate in writes', 'The network must have disappeared', 'Review index usage and write overhead rather than adding more indiscriminately.'),
        q('A query returns half a huge table. Why might a scan still be reasonable?', 'An index is not always cheaper when most rows are needed', 'Databases never use indexes', 'Correct queries must read no rows', 'Selectivity and access cost influence the planner’s decision.'),
    ], source='index')

add('transactions', 'storage', 'concurrency', 'Transactions and constraints',
    'A transaction groups changes into a commit boundary. Constraints and suitable isolation help preserve rules when requests overlap.',
    'Moving credits from A to B requires a debit and credit to commit together. For a seat, a unique constraint can prevent duplicate confirmed ownership if the schema encodes that rule. A transaction around a read-then-write still needs the right locking, conditional update, or isolation for the race being prevented.',
    'Coordination may add contention and retries. Keep transactions bounded and handle conflicts explicitly.',
    'Putting statements between BEGIN and COMMIT does not automatically make every concurrent algorithm correct.',
    ['Identify an atomic commit boundary', 'Use constraints for invariants', 'Reason about overlapping transactions'], [
        q('A debit succeeds but its matching credit fails. What mechanism can group them?', 'One suitable database transaction', 'A longer browser timeout alone', 'Two unrelated unchecked writes', 'The transaction makes both changes commit together or roll back together.'),
        q('Can two ordinary reads inside separate transactions both see an available seat?', 'Yes, depending on isolation and locking', 'No, BEGIN prevents all other reads', 'No, transactions always use a global mutex', 'Transaction boundaries alone do not establish the required serialization.'),
        q('What should the application do with a transaction conflict?', 'Handle it using a bounded retry or explicit conflict result', 'Always claim success', 'Ignore the database response', 'Conflicts are part of the concurrency contract and must reach a safe outcome.'),
        q('Which is stronger protection for a unique reservation identifier?', 'An appropriate authoritative unique constraint', 'A prior check only in browser memory', 'A label saying unique', 'The store can enforce uniqueness across competing writers.'),
        q('A transaction sends an external email and later rolls back. What follows?', 'The database rollback may not undo the email', 'All external systems roll back automatically', 'The recipient cannot have received it', 'Database atomicity does not automatically include external side effects.'),
        q('A design uses SELECT then unconditional UPDATE to claim stock. What should you inspect?', 'How concurrent claims are coordinated at the write boundary', 'Only the order of diagram boxes', 'Whether the variable is named safe', 'The current predicate must remain valid when state changes.'),
    ], source='sql')

add('object-storage', 'storage', 'operations', 'Files, object storage, and metadata',
    'Object storage holds named byte objects. An application database often stores ownership, processing status, and the key used to find each object.',
    'A photo service can upload bytes to object storage and save a photo row containing owner, object key, size, and status. A short-lived signed upload URL delegates a bounded operation; it is not a replacement for checking who may request one. A crash between upload and metadata commit can leave an orphan object.',
    'Separating large bytes from queryable metadata suits many file workloads, but adds lifecycle and cross-system recovery work.',
    'A blob upload and a relational row insert are not automatically one transaction.',
    ['Separate file bytes from searchable metadata', 'Control delegated file access', 'Reconcile incomplete uploads'], [
        q('Where is a natural place for large video bytes?', 'Object storage, with metadata tracked separately as needed', 'Only an API process variable', 'A queue acknowledgement field', 'Object storage is intended for named byte objects; metadata queries may belong elsewhere.'),
        q('What should be checked before issuing a signed private-file download URL?', 'Whether the caller may access that file', 'Only the file extension', 'Whether the URL looks random', 'A signed URL delegates access, so issuing it is an authorization decision.'),
        q('A crash occurs after upload but before metadata creation. What might remain?', 'An orphan object needing reconciliation or cleanup', 'A guaranteed completed metadata transaction', 'No bytes because all storage shares one rollback', 'Cross-system steps need explicit recovery paths.'),
        q('An image changes but its public URL stays cacheable for a year. What can help publish the new version?', 'Use a new versioned object URL and update the reference', 'Assume every cache notices instantly', 'Remove ownership checks', 'Versioned names separate old immutable content from new content.'),
        q('A user uploads a file but never completes the workflow. What policy is useful?', 'Expire incomplete uploads after a defined grace period', 'Keep unlimited abandoned data forever without review', 'Delete all users’ files immediately', 'Lifecycle cleanup bounds the cost of abandoned work while allowing completion.'),
        q('The application DB is restored to yesterday but file objects are newer. What should recovery consider?', 'Consistency between restored metadata and retained objects', 'Only whether the HTTP port is open', 'That cross-store timestamps always match automatically', 'Recovery must restore a coherent product state across storage systems.'),
    ], source='object')

add('cache-aside', 'caching', 'reads', 'Cache-aside and cache misses',
    'A cache holds a reusable copy. With cache-aside, the application checks the cache, reads the source on a miss, and may populate the cache for later requests.',
    'A product lookup first checks Redis by product ID. On a miss, the API reads the database, fills the cache with an expiry, and responds. The database remains the source of truth. A cache hit reduces source work, but authorization and freshness rules still apply.',
    'Caching buys faster repeated reads at the cost of extra state, failure handling, and possible staleness. A low reuse rate may not justify it.',
    'A cache miss is an ordinary path, not proof the product does not exist.',
    ['Trace hit and miss paths', 'Identify the source of truth', 'Evaluate reuse and failure behaviour'], [
        q('In cache-aside, what usually happens on a cache miss?', 'Read the source and optionally populate the cache', 'Always return not found without checking storage', 'Delete the source record', 'A miss says only that this cache lacks the value.'),
        q('What is the source of truth in the described product cache?', 'The authoritative product database', 'Whichever cache responds fastest', 'The last browser to render the page', 'The cache is a copy with an explicit freshness policy.'),
        q('A cache is unavailable. Which fallback requires capacity planning?', 'Send reads to the source database', 'Assume source reads have zero cost', 'Return private data without checks', 'Fallback load can overwhelm a source sized only for cache misses.'),
        q('Redis reduces latency for frequently read product data. Which cost remains?', 'Expiry, invalidation, and cache failure behaviour', 'No data can ever be stale', 'Ownership checks disappear', 'An extra copy of state needs an explicit correctness and operational policy.'),
        q('Requests read a different large record each time, rarely reused. What should you check before caching?', 'Hit rate, memory cost, and added complexity', 'Only whether caching is fashionable', 'Whether TTL can make all reads free', 'Low reuse can leave the cache paying storage and network costs without enough hits.'),
        q('A private profile is cached only by profile ID. What must its read path still enforce?', 'Authorization for the current caller', 'Trust that every cache hit is public', 'Skip all server-side checks', 'Caching data does not change which users may access it.'),
    ], source='redis', diagram='API -> Cache\nAPI -> Database\nDatabase -> Cache')

add('cache-freshness', 'caching', 'reads', 'TTLs, invalidation, and stale refills',
    'A TTL (time to live) limits how long a cache entry is retained under its policy. Invalidation removes a copy, but concurrent work can still refill old data.',
    'Reader R fetches old value A. Writer W commits B and deletes the cached entry. R then stores A in the cache. Invalidation happened, yet stale state returned. Version-aware writes, coordination, or a carefully defined freshness policy can address this race.',
    'Short expiry reduces stale retention but increases misses. Immediate revocation may need authoritative validation rather than an ordinary cached read.',
    'A 60-second TTL alone does not prove a 60-second freshness bound across every refill and cache layer.',
    ['Explain TTL versus freshness', 'Trace a late refill race', 'Choose policies from allowed staleness'], [
        q('What does invalidating a cache entry do?', 'Remove that stored copy', 'Cancel every concurrent source read automatically', 'Undo the authoritative write', 'Deletion alone does not coordinate other reads already in progress.'),
        q('An old read fills a cache after a newer write invalidated it. What happened?', 'A stale refill race', 'Proof invalidation orders every operation', 'Automatic read-your-writes consistency', 'The refill must be considered as part of the update protocol.'),
        q('A disabled account must lose access immediately. Safest of these policies?', 'Validate the critical access decision against authoritative current state', 'Trust a day-old profile cache', 'Increase the cache TTL', 'Freshness requirements differ between display information and security decisions.'),
        q('A product description may lag a minute; stock must be correct at purchase. Which policy fits?', 'Cache descriptions; validate stock atomically at purchase', 'Use the same stale cache for the purchase decision', 'Assume all data needs identical freshness', 'A product can tolerate stale display data while protecting its critical state transition.'),
        q('An API cache expires in 30 seconds but a downstream CDN retains responses for an hour. What bounds visible staleness?', 'The complete read path and its cache policies', 'Only the API cache TTL', 'Only the database commit timestamp', 'A downstream copy can outlive an upstream one.'),
        q('Reducing TTL from one hour to one second usually changes what?', 'More cache misses and source load, with shorter retained copies', 'Guaranteed elimination of all races', 'No effect on database traffic', 'Expiry trades reuse against freshness and must be checked under load.'),
    ], source='cache')

add('http-cdn', 'caching', 'reads', 'CDNs and HTTP caching',
    'A CDN (content delivery network) serves cached content near users. HTTP cache directives control freshness, revalidation, and whether shared caches may reuse a response.',
    'Versioned public JavaScript can be cached for a long time. A private account response needs a policy that prevents another user receiving it from a shared cache. An ETag identifies a representation for conditional validation; a matching validation may avoid transferring the full body.',
    'Edge caching reduces distance and origin load, but requires correct cache keys and a clear update policy.',
    'A CDN is not an authorization layer, and private data must not become shared simply because its URL looks unique.',
    ['Distinguish private and shared caches', 'Choose keys and versioned assets', 'Explain conditional revalidation'], [
        q('What is a common CDN benefit?', 'Serving reusable public content closer to users', 'Making private responses safe to share automatically', 'Replacing all persistent storage', 'Edge locations can shorten delivery paths and reduce origin requests.'),
        q('Which response needs particular care in a shared cache?', 'A personalised account page', 'An immutable public logo', 'A public versioned script', 'Shared reuse of personalised data can leak one user’s content to another.'),
        q('What can an ETag support?', 'Conditional validation of a cached representation', 'Encrypting all database rows', 'Exactly-once queue effects', 'Validators help check whether a representation changed without always resending it.'),
        q('A CDN ignores the language query parameter in its cache key. What can happen?', 'A user can receive a cached response in the wrong language', 'The origin always runs for every request', 'All responses become uncachable', 'The cache key must include dimensions that change the representation.'),
        q('A public bundle changes while clients retain the old URL for months. A robust release pattern?', 'Publish a new content-versioned URL', 'Assume every browser immediately purges', 'Remove all cache headers and ownership checks', 'New names let clients fetch new bytes while old immutable assets remain reusable.'),
        q('Does Cache-Control: no-cache mean the response can never be stored?', 'No, it requires validation before reuse under its semantics', 'Yes, it always means no storage', 'Yes, it deletes all existing browser history', 'no-cache and no-store have different purposes; consult the directives for the intended policy.'),
    ], source='cache')

add('hot-keys', 'caching', 'capacity', 'Hot keys, stampedes, and cache failure',
    'A hot key receives disproportionate traffic. A stampede happens when many requests simultaneously miss and repeat the same expensive source work.',
    'A celebrity profile expires at noon. Thousands of callers miss together and hit the database. Per-key request coalescing can allow one refill while others wait. Expiry jitter spreads independent key expirations; it does not by itself coordinate every reader of the same key.',
    'Serving stale data during refill can protect latency if the product permits it. Waiting for fresh data may be necessary for stronger guarantees.',
    'More cache shards do not automatically spread one hot key across them.',
    ['Recognise skewed load', 'Prevent duplicate refills', 'Bound fallback load'], [
        q('What is a cache stampede?', 'Many misses trigger the same expensive refill concurrently', 'A guaranteed source data loss', 'A cache that never expires', 'Correlated misses can multiply source work.'),
        q('What does request coalescing help do?', 'Combine concurrent refills for the same key', 'Make all data permanently fresh', 'Increase duplicate source reads deliberately', 'One refill can serve waiting requests instead of repeating the same operation.'),
        q('A cache outage sends all reads to the database. What protects it?', 'Capacity planning plus bounded concurrency or load shedding', 'Unlimited retries with no delay', 'Assuming cache outages never occur', 'Fallback needs overload controls as well as a nominal path.'),
        q('One Redis key receives most requests. Why might adding hash shards not fix it?', 'That key still maps to one shard unless the design changes', 'Every key is automatically replicated for reads everywhere', 'Hashing eliminates skew by definition', 'Partitioning many keys does not automatically partition traffic to one key.'),
        q('What is the benefit of adding jitter to expirations of many keys?', 'Reduce simultaneous expiry across those keys', 'Guarantee one refill per key', 'Make all invalidations atomic', 'Jitter spreads timing; coalescing addresses duplicate work for one key.'),
        q('A seat confirmation path wants to serve stale-on-error data. Main concern?', 'Stale state cannot safely authorize the ownership transition', 'Every stale response is harmless', 'A CDN makes writes atomic', 'Stale browsing may be acceptable; correctness-critical transitions still need authoritative checks.'),
    ], source='redis')

add('queue-basics', 'queues', 'retries', 'Producers, consumers, and buffering',
    'A producer submits work; a consumer processes it. A queue separates their timing and can absorb bursts when later spare capacity is available.',
    'Image uploads arrive in a burst while workers resize them. The queue holds pending jobs and workers consume at a bounded rate. Track both depth and waiting age. If arrivals permanently exceed completions, pending work continues growing until a limit is reached.',
    'A work queue such as RabbitMQ can suit task dispatch. A retained log such as Kafka can suit replay by independent consumer groups. Choose from routing, replay, ordering, and operational requirements.',
    'A queue stores work; it does not create processing capacity.',
    ['Identify producer and consumer roles', 'Distinguish burst buffering from overload', 'Compare dispatch and replay needs'], [
        q('What does a queue directly provide during a short burst?', 'A buffer between arrivals and consumers', 'Unlimited processing power', 'Automatic correctness of every side effect', 'Buffering changes timing, not the amount of available compute.'),
        q('Arrivals exceed completion capacity forever. What happens without admission control?', 'Backlog grows until a resource limit is reached', 'Completion latency stays fixed forever', 'The queue manufactures workers', 'Sustained excess work needs more capacity, less work, or explicit rejection.'),
        q('What should accompany queue depth when judging user wait?', 'Age of pending work', 'Number of variable names', 'Only broker uptime', 'Depth alone lacks a time scale and may hide old stuck work.'),
        q('Independent analytics consumers must replay retained events. Which feature matters?', 'A retained log with independent consumption positions', 'Automatic deletion before any consumer can read', 'Only a browser cache', 'Replay and independent consumers are natural log requirements; retention must be configured.'),
        q('A team considers Kafka for five simple background tasks/day with no replay need. Best next step?', 'Compare its operational cost with a simpler durable job mechanism', 'Choose it because every queue must be Kafka', 'Skip durable acceptance entirely', 'Use the simplest mechanism that meets the contract and operational constraints.'),
        q('Workers can finish twice the normal arrival rate after a burst. Why is that useful?', 'Spare capacity can drain buffered work', 'Backlog can never form', 'Messages cannot be duplicated', 'Drain rate is completions minus continuing arrivals.'),
    ], source='kafka')

add('acknowledgements', 'queues', 'retries', 'Delivery semantics and acknowledgements',
    'Acknowledgement tells a broker a delivery was handled. A crash around that boundary can cause loss or redelivery, depending on the protocol.',
    'A worker saves an output then crashes before acknowledging. The broker can redeliver, so the output operation must tolerate repetition. A publisher confirm concerns acceptance by the broker; it does not say the consumer finished. Durable queues, message persistence, and replication policies also affect the promise.',
    'Acknowledging early risks losing unfinished work. Acknowledging after an effect permits redelivery and requires retry-safe effects.',
    'At-least-once delivery is not exactly-once external side effects.',
    ['Place acknowledgement after recoverable work', 'Distinguish broker acceptance from completion', 'Handle duplicate delivery'], [
        q('A worker crashes after its effect but before ack. What can happen?', 'The message is redelivered and the effect may repeat', 'The broker proves the effect never happened', 'Every external system rolls back', 'Delivery and side effects cross different failure boundaries.'),
        q('A publisher confirm establishes what?', 'Broker-side acceptance under the configured guarantees', 'Every consumer finished the business operation', 'Every email recipient read the message', 'Publisher confirms and consumer acknowledgements cover different boundaries.'),
        q('Why can acknowledging before durable processing be risky?', 'A crash can lose unfinished work the broker considers handled', 'It guarantees exactly-once processing', 'It preserves all local memory', 'Ack should match a recoverable completion boundary.'),
        q('A payment worker receives the same event twice. Which is needed?', 'A stable operation identity and retry-safe payment boundary', 'A new payment ID on every redelivery', 'Trust that duplicate delivery means duplicate intent', 'Deduplication must apply to the business effect, with provider cooperation if needed.'),
        q('A queue advertises at-least-once delivery. What must consumers expect?', 'Possible duplicate deliveries', 'No duplicate effects without application logic', 'All deliveries arrive in global order', 'Delivery guarantees do not remove consumer idempotency responsibilities.'),
        q('A worker publishes a file then records completion in another store. What should the design trace?', 'Crashes between publication, status update, and acknowledgement', 'Only the happy path', 'Only the file extension', 'Each boundary may leave durable partial state that recovery must reconcile.'),
    ], source='queue')

add('dead-letters', 'queues', 'operations', 'Retry policies and dead-letter handling',
    'Retry transient failures with bounds and delay. Persistent failures need an observable terminal outcome and a safe way to inspect or reprocess them.',
    'A converter retries a temporary network failure with exponential backoff and jitter. A malformed document is unlikely to improve after thousands of identical attempts. After a limit, record failure and move or flag the work for inspection. Replaying it still needs the original operation identity.',
    'More retries can rescue transient faults but consume resources and increase latency. Dead-letter storage needs ownership, retention, monitoring, and a replay procedure.',
    'A dead-letter queue does not fix a message; it makes failed work manageable.',
    ['Separate transient and permanent failures', 'Bound retries and spread their timing', 'Plan visibility and replay'], [
        q('Which failure is least likely to improve through unchanged retries?', 'A structurally invalid document', 'A brief network interruption', 'A temporary service restart', 'Deterministic invalid input needs correction or an explicit failure outcome.'),
        q('Why add jitter to retry delays?', 'Avoid synchronised retry bursts from many clients', 'Guarantee the next attempt succeeds', 'Remove the need for attempt limits', 'Timing variation reduces correlated load spikes.'),
        q('A job reaches its retry limit. What should happen?', 'Record visible failure and retain enough context for safe recovery', 'Disappear silently', 'Report successful conversion anyway', 'Terminal failures need a user and operator path.'),
        q('Thousands of workers retry immediately while a dependency is failing. What risk grows?', 'A retry storm worsens the overload', 'Capacity automatically becomes infinite', 'The original failure is guaranteed to clear', 'Retries add load to the very dependency that may be unable to cope.'),
        q('A dead-lettered job is replayed. Which ID should usually be preserved?', 'Its logical operation identity', 'A new identity that bypasses all duplicate protection', 'Another account’s identity', 'Replay may repeat effects that partially succeeded previously.'),
        q('A dead-letter queue accumulates silently for weeks. What is missing?', 'Monitoring, ownership, retention, and a recovery process', 'Only a more fashionable broker', 'A promise that every job succeeded', 'Failure storage helps only when someone can detect and safely act on it.'),
    ], source='queue')

add('outbox', 'queues', 'retries', 'Durable jobs and the transactional outbox',
    'If accepting a job requires a database write and a separate publish, trace the gap between them. An outbox records the intent to publish inside the same database transaction as the job.',
    'The API commits a job row and an outbox row together, then acknowledges acceptance. A relay publishes pending outbox rows and records progress. If it crashes after publish but before marking sent, it may publish again. Consumers still need duplicate-safe processing. Polling a durable jobs table can also be a simpler valid design.',
    'An outbox closes the lost-intent gap but adds relay operation, cleanup, and potential duplicate delivery.',
    'An outbox does not turn every external effect into an exactly-once operation.',
    ['Find the database/publish crash window', 'Commit durable intent atomically', 'Make relay retries safe'], [
        q('What problem does a transactional outbox address?', 'Losing publish intent between a DB commit and a separate enqueue', 'Every possible consumer bug', 'All cross-region latency', 'The durable intent is committed with the business change.'),
        q('The relay publishes then crashes before marking sent. What can follow?', 'A duplicate publish on retry', 'Proof the publish never happened', 'Automatic rollback of the broker', 'The relay’s progress record and broker acceptance remain separate boundaries.'),
        q('Can polling a durable jobs table be valid for modest workloads?', 'Yes, with suitable claiming, recovery, and capacity behaviour', 'No, every job needs a separate broker', 'Only if jobs are never persisted', 'A broker is one mechanism, not a universal requirement.'),
        q('An API commits a job, fails to enqueue, and returns success. What must ensure recovery?', 'Durable publish intent or another recoverable pending-work mechanism', 'Only the browser’s loading spinner', 'An assumption that enqueue never fails', 'Accepted work must remain discoverable after that failure.'),
        q('An outbox transaction commits but the HTTP response is lost. What helps a client retry safely?', 'A stable request identity tied to the job transaction', 'Always create another job', 'Erase the outbox', 'Acceptance idempotency and publish recovery solve related but distinct failure windows.'),
        q('A relay has been down for an hour while jobs are accepted. Which signal matters?', 'Age and volume of unpublished durable intent', 'Only API response latency', 'Only broker connection count', 'Fast acceptance can hide delayed publication and growing user wait.'),
    ], source='retry', diagram='API -> Job + outbox transaction\nOutbox relay -> Broker\nBroker -> Worker')

add('replication', 'distributed', 'reads', 'Replication and read freshness',
    'Replication keeps copies of data on different nodes. Copies may lag, and failover safety depends on which writes were acknowledged and replicated.',
    'A user updates their name on the leader and immediately reads from an asynchronous replica that has not applied the write. They see the old name. Routing that user’s next read to a sufficiently current source can provide read-your-writes behaviour. Replication helps availability, but accidental deletions may also replicate.',
    'Waiting for more replicas can strengthen some durability guarantees while adding latency and reducing availability during failures.',
    'A replica is not automatically a backup, nor is every replica read current.',
    ['Explain replication lag', 'Trace read-your-writes behaviour', 'Separate replicas from recoverable history'], [
        q('Why can a replica return an old value just after an update?', 'It has not yet applied the write', 'Replicas cannot store data', 'The client must be unauthenticated', 'Asynchronous replication permits a delay between copies.'),
        q('What can help a user read their own recent write?', 'Read from a source known to have applied that write', 'Always choose the most lagged replica', 'Increase unrelated cache retention', 'The read must observe a replication position at least as recent as the write.'),
        q('Why is replication alone insufficient as a backup strategy?', 'Mistakes such as deletion can propagate to replicas', 'Replicas never receive writes', 'Backups and replicas are identical by definition', 'Recovery may require retained history independent of current copies.'),
        q('A leader acknowledges a write before replication and then dies. What must failover policy consider?', 'Whether the promoted replica contains the acknowledged write', 'Only the new server’s name', 'That acknowledgement always means every replica persisted it', 'The acknowledgement contract determines which losses are possible.'),
        q('A product allows ten-second-old browse results but current purchase decisions. How can replicas fit?', 'Use permitted lag for browsing and authoritative validation for purchase', 'Use any lagged replica for both', 'Delete the primary after every read', 'Different paths may need different freshness and coordination.'),
        q('A network link to replicas slows. What is one cost of waiting synchronously for them?', 'Higher write latency or failed availability while they are unreachable', 'Guaranteed lower latency', 'No change to any failure behaviour', 'Coordinating with remote copies changes response time and failure dependencies.'),
    ], source='sql')

add('partitioning', 'distributed', 'capacity', 'Partitioning and shard keys',
    'Partitioning divides data across storage units. A shard key determines where a record lives and which queries can stay local.',
    'Sharding orders by customer ID can make one customer’s order history local. A query across all customers may need to visit every shard. One unusually large customer can still overload a shard. Moving keys later needs a migration plan that preserves routing and correctness.',
    'More partitions can spread aggregate load, but add routing, rebalancing, and cross-partition coordination costs.',
    'Hashing many keys does not guarantee balanced traffic when a few keys dominate.',
    ['Choose keys from queries and distribution', 'Recognise hot partitions', 'Plan cross-shard operations'], [
        q('What does a shard key determine?', 'Which partition owns a record', 'Which users can bypass authentication', 'Whether every read is instantly consistent', 'Routing maps the key to a partition.'),
        q('Orders are sharded by customer ID. Which query is naturally local?', 'One customer’s order history', 'All customers’ orders without additional coordination', 'An arbitrary global total for free', 'Using the partition key can avoid scatter across shards.'),
        q('One customer produces most traffic. What risk remains with customer-ID sharding?', 'A hot customer can overload its partition', 'All customers must have equal traffic', 'Hashing prevents any skew', 'Balanced key counts do not imply balanced request rates.'),
        q('A transfer updates accounts on two shards. What extra question arises?', 'How to coordinate or recover the cross-shard change', 'Only which shard name is shorter', 'Whether writes no longer need atomicity', 'Operations crossing partitions need an explicit consistency protocol.'),
        q('A monotonically increasing key routes all new writes to one range partition. Likely concern?', 'A hotspot on the newest range', 'Perfect write spreading by definition', 'No need to monitor throughput', 'Range keys can concentrate recent writes depending on partition management.'),
        q('You need to change the shard key on live data. What belongs in the plan?', 'Data migration, routing transition, verification, and rollback', 'Only redraw the diagram', 'Delete all ownership information', 'Repartitioning changes data placement while reads and writes may continue.'),
    ])

add('consistency', 'distributed', 'requirements', 'Consistency and network partitions',
    'A network partition prevents some nodes from communicating. Decide whether an operation can wait or fail rather than return a result that breaks its consistency promise.',
    'Two disconnected regions cannot each independently sell the same final seat while guaranteeing one owner without coordination or a preallocated ownership scheme. Browsing can often show an older view, while confirmation requires a current authoritative decision. Eventual consistency describes convergence under its assumptions; it does not guarantee a particular maximum delay.',
    'Different operations can choose different failure behaviour. State the guarantee and partition scenario rather than attaching one vague label to the whole product.',
    'CAP is not a rule to casually choose any two features during normal operation.',
    ['Describe a concrete partition', 'Choose per-operation failure behaviour', 'Distinguish eventual from bounded staleness'], [
        q('What is a network partition?', 'Some nodes cannot communicate despite possibly still running', 'A database index', 'An application theme change', 'A partition is a communication failure, not necessarily a process crash.'),
        q('Can two disconnected regions both sell the same unallocated last seat while guaranteeing one owner?', 'Not by independent unchecked local acceptance', 'Yes, simply retry twice', 'Yes, a cache TTL guarantees it', 'The shared invariant needs coordination or a scheme that avoids overlapping ownership.'),
        q('Does eventual consistency specify a universal ten-second freshness bound?', 'No, a bound needs an additional explicit guarantee', 'Yes, always ten seconds', 'Yes, always immediate', 'Convergence and a measured bounded delay are different promises.'),
        q('During a partition, a strict authoritative booking check cannot reach its authority. Safe behaviour?', 'Wait or fail the confirmation rather than invent ownership', 'Confirm from an arbitrarily stale browsing cache', 'Give both callers the final seat', 'Protect the invariant at the cost defined by the operation’s availability policy.'),
        q('A recommendation feed can tolerate older suggestions. What is a reasonable partition policy?', 'Serve an allowed stale view with clearly bounded product semantics', 'Claim every suggestion is current without evidence', 'Disable authorization across all endpoints', 'Read availability can be prioritised where stale results are acceptable.'),
        q('A design says “the system is CP.” What makes the explanation more useful?', 'Name the operation, invariant, partition, and resulting response', 'Repeat the acronym louder', 'Remove the workload assumptions', 'Concrete behaviour exposes what consistency and availability mean for users.'),
    ])

add('concurrent-holds', 'distributed', 'concurrency', 'Concurrent updates, holds, and expiry',
    'Check the current state and change it atomically at the authority. A hold is temporary ownership whose expiry and confirmation must use a defined clock and transition rule.',
    'Two servers read a free seat. Only one conditional update should change it to held. Confirmation must check the hold identity, owner, eligible state, and deadline in the same coordinated transition. A delayed cleanup worker should not determine whether an expired hold is valid.',
    'Locks, conditional writes, and transactions can all be valid when their scope and failure behaviour match the invariant.',
    'A mutex in one process cannot coordinate requests executing on another server.',
    ['Write the atomic claim predicate', 'Validate owner and expiry at confirmation', 'Separate expiry correctness from cleanup'], [
        q('Two servers both read “available.” What prevents both claiming success?', 'An authoritative conditional transition or suitable transaction', 'Independent process-local mutexes alone', 'Longer cache retention', 'All writers must coordinate the check and update against current state.'),
        q('Which conditions belong in a hold confirmation?', 'Current hold ID, owner, eligible state, and unexpired deadline', 'Only a browser’s old seat label', 'Only that the seat existed last week', 'The transition must validate the current entitlement to confirm.'),
        q('Cleanup of expired holds is delayed. Must those holds still be confirmable?', 'No, confirmation should validate the deadline itself', 'Yes, until cleanup runs', 'Yes, if the user refreshes quickly', 'Correctness cannot rely only on timely background deletion.'),
        q('A hold expires as its owner confirms. What makes the result well-defined?', 'An atomic transition using a stated authoritative time policy', 'A clock chosen independently by each browser', 'A cached countdown as the only check', 'The system needs an ordering rule for expiry and confirmation.'),
        q('A confirmed reservation response is lost. What should a retry with the same operation identity do?', 'Return the existing logical confirmation', 'Create another reservation', 'Claim the operation definitely failed', 'Retry-safe identity preserves the result across an ambiguous response.'),
        q('A design adds a distributed lock. What still needs an explanation?', 'Lock scope, expiry/failure handling, and authority-side correctness', 'Only the lock product’s logo', 'Nothing; all races vanish automatically', 'Lock leases and failure modes can leave stale owners unless the write boundary protects the invariant.'),
    ], source='sql', case='seats')

add('scaling', 'reliability', 'capacity', 'Find the bottleneck before scaling',
    'Scale the resource that limits useful completed work. Vertical scaling adds resources to a node; horizontal scaling adds nodes and requires a distribution strategy.',
    'If requests wait on slow database queries, adding API replicas can increase pressure without increasing throughput. Measure query latency, connection saturation, CPU, and queueing. An index or bounded connection pool may be a better first step than sharding.',
    'Larger nodes can be simpler but have finite capacity. More nodes add distribution and failure-management work.',
    'High CPU is not the only bottleneck; a low-CPU service can be waiting on a saturated dependency.',
    ['Locate a limiting resource', 'Compare vertical and horizontal scaling', 'Measure before and after a change'], [
        q('What is horizontal scaling?', 'Adding cooperating instances or nodes', 'Only adding RAM to one node', 'Changing a variable name', 'Horizontal scaling distributes work across more nodes.'),
        q('API CPU is low but requests wait on database connections. Likely bottleneck?', 'The database path or connection capacity', 'Always the frontend font', 'Definitely insufficient API CPU', 'Waiting time can dominate even when application CPU is idle.'),
        q('How should you judge a scaling change?', 'Measure useful throughput, latency, errors, and resource load', 'Only count added servers', 'Assume cost proves improvement', 'The change must improve the user-visible workload without shifting failures elsewhere.'),
        q('A costly query scans millions of rows for one account. A sensible first investigation?', 'Query plan, indexes, and returned data size', 'Immediate global microservice decomposition', 'Remove all performance measurements', 'Reduce avoidable work before multiplying the same expensive path.'),
        q('More workers overwhelm database writes. What happened?', 'The bottleneck moved or was exposed downstream', 'Workers no longer use the database', 'Every layer scales independently without limits', 'An end-to-end flow has linked resource constraints.'),
        q('A single larger database meets the workload with headroom. Is sharding mandatory?', 'No, justify added complexity against actual requirements', 'Yes, all databases must be sharded', 'Yes, otherwise indexes do not work', 'A simpler adequate design can be easier to operate and evolve.'),
    ], source='sre')

add('overload', 'reliability', 'operations', 'Overload, backpressure, and rate limits',
    'Backpressure slows producers when consumers cannot keep up. Admission control rejects or defers work before it exhausts shared resources.',
    'A thumbnail service limits concurrent conversions and uses a bounded queue. When full, it rejects new work with a documented retry policy rather than consuming all memory. Per-account rate limits can protect fairness, but a distributed limit needs a clear scope and consistency policy.',
    'Rejecting some work can preserve useful service for the rest. Buffering too much can turn overload into long, misleading waits.',
    'An unbounded queue merely moves the resource limit to memory, disk, or user patience.',
    ['Bound in-flight and queued work', 'Protect fair access', 'Explain rejected-request behaviour'], [
        q('What is backpressure meant to communicate?', 'Consumers cannot keep up, so producers must slow or defer', 'Every producer should retry instantly', 'All queues have infinite capacity', 'Flow control limits growth when processing falls behind.'),
        q('Why bound a work queue?', 'Prevent unlimited resource use and excessive waiting', 'Guarantee no job can fail', 'Avoid recording terminal states', 'A bound makes overload an explicit contract instead of an eventual crash.'),
        q('One tenant monopolises capacity. Which control can improve fairness?', 'A per-tenant quota or rate limit with a defined scope', 'Unlimited retries for that tenant', 'Disable all ownership checks', 'Scope controls prevent one caller consuming the entire shared budget.'),
        q('A system returns 429 with a retry policy. What should a client avoid?', 'Immediate unbounded retries', 'Respecting a stated delay', 'Limiting attempts', 'Aggressive retries can amplify the overload the limit is trying to contain.'),
        q('A queue has hours of pending work but the API still says “ready soon.” What needs correction?', 'Admission and user-visible latency expectations', 'Only the icon colour', 'Nothing because acceptance is always instant', 'Fast acceptance can conceal unacceptable completion delay.'),
        q('Each of ten API servers independently allows 100 requests/second per user. What must you clarify?', 'Whether the intended limit is per instance or global', 'That the global limit is automatically 100', 'That limits eliminate every overload', 'Local counters can multiply the effective allowance across instances.'),
    ], source='sre')

add('observability', 'reliability', 'operations', 'Metrics, logs, traces, and actionable alerts',
    'Metrics summarise measurements; logs record events; traces connect steps across a request. Start from a user symptom and work toward its cause.',
    'A conversion service records completion latency and oldest pending age. A job ID links API logs to worker events. An alert about rising failed conversions should identify the affected flow and a response action. Avoid exposing sensitive document content in routine logs.',
    'More telemetry adds cost and noise. Keep dimensions bounded and distinguish diagnosis data from signals that should wake an operator.',
    'A green broker connection check does not prove users’ jobs are completing.',
    ['Select user-visible health signals', 'Correlate a request across components', 'Write an actionable alert'], [
        q('Workers stop progressing but the queue accepts messages. Which signal exposes waiting?', 'Age of the oldest pending job', 'Number of source files', 'Only successful broker TCP connections', 'Pending age measures the delay experienced by unfinished work.'),
        q('What helps correlate an API submission with worker logs?', 'A shared request or job identifier', 'Random unrelated log names', 'Removing timestamps everywhere', 'A stable correlation ID follows the same logical operation through components.'),
        q('Which alert is most actionable?', 'Conversion failures exceed the budget, with an owner and runbook', 'A random counter changed by one', 'Every individual successful request', 'An alert should represent a meaningful symptom and a possible response.'),
        q('A dashboard shows only mean latency. What could it miss?', 'A slow tail affecting a minority of users', 'All request timestamps by definition', 'Whether the code contains comments', 'Averages can hide painful outliers; inspect percentiles and errors.'),
        q('Putting every user ID into metric labels can create what problem?', 'Unbounded cardinality and telemetry cost', 'Guaranteed stronger access controls', 'Zero storage use', 'Large numbers of label combinations create many distinct time series.'),
        q('A trace shows most time in a downstream call. What should you investigate next?', 'That dependency’s latency, saturation, and timeout behaviour', 'Only redraw the upstream box', 'Assume upstream CPU is always responsible', 'Tracing helps locate where the observed request spent its time.'),
    ], source='sre')

add('recovery', 'reliability', 'operations', 'Recovery, backups, and graceful degradation',
    'Recovery needs a defined acceptable loss window and restoration time. A backup is useful only if a coherent restore can actually be performed.',
    'A booking database is backed up hourly. If the business permits at most five minutes of lost changes, hourly backups alone do not meet that target. Test recovery with logs or other retained history as appropriate. During an outage, browsing may remain available from a permitted stale source while confirmations stop safely.',
    'More frequent recovery points and faster restoration cost resources and operational effort. Degradation should preserve critical guarantees.',
    'Having a backup file is not evidence that the full application can be restored within its target.',
    ['Define recovery point and recovery time objectives', 'Test coherent restoration', 'Choose safe degraded behaviour'], [
        q('What does a recovery point objective describe?', 'The acceptable amount of lost data measured in time', 'Only server startup duration', 'The preferred backup filename', 'RPO bounds how far restored data may fall behind the failure point.'),
        q('What does a recovery time objective describe?', 'The target time to restore service', 'The maximum size of a request body', 'The cache hit ratio', 'RTO concerns how long recovery takes.'),
        q('What validates a backup strategy most directly?', 'A tested restore against stated recovery objectives', 'Only the existence of a backup cron entry', 'Only a successful application health ping', 'Restoration exercises expose missing data, dependencies, and timing problems.'),
        q('An hourly snapshot is the only recovery mechanism. Can it promise at most five minutes of lost writes?', 'Not on that mechanism alone', 'Yes, an hour is always five minutes', 'Yes, if the snapshot has a short name', 'The gap between recovery points can exceed the allowed loss window.'),
        q('Authoritative booking state is unavailable. Which degradation preserves ownership correctness?', 'Allow permitted stale browsing while pausing confirmation', 'Confirm every cached seat as available', 'Disable all authentication', 'Degrade optional reads without inventing authoritative writes.'),
        q('A database restores but workers replay old events. What must be checked?', 'Replay safety and consistency with restored state', 'Only whether workers have new hostnames', 'That replay can never repeat an effect', 'Recovery can revisit operations whose effects survived elsewhere.'),
    ], source='sre')

add('design-links', 'designs', 'reads', 'Build a read-heavy link service',
    'Connect the contract, schema, and complete read/write flows before optimising. A useful architecture explains a normal request and a failing one.',
    'Store code, owner, destination, enabled state, and version. Create only after validating ownership and choosing a collision-safe code. Resolve via a justified read path, returning no redirect for disabled or missing links. The existing case permits changes to propagate within 60 seconds, so every cache layer must respect that contract.',
    'A cache may reduce repeated lookup work, but introduces refill and freshness obligations. Sharding should follow a capacity argument.',
    'A short URL service is not complete if the design never explains updates, disables, collisions, or durable creation.',
    ['Trace create and resolve', 'Bound freshness across all copies', 'Justify optional components'], [
        q('What should happen for a disabled link?', 'No redirect', 'Always use the old destination', 'Create a new destination silently', 'The stated link contract must hold on every resolution path.'),
        q('Which field is important for authorizing link updates?', 'The link owner identity', 'Only the length of the code', 'Only the cache server address', 'The update must validate that the authenticated user owns the resource.'),
        q('Why is a cache optional in a baseline design?', 'Its need depends on workload and measured source capacity', 'Caches are always incorrect', 'A cache is mandatory for every database', 'Choose components from a concrete load and latency argument.'),
        q('Two generated link codes collide. What does creation need?', 'An authoritative uniqueness check and safe retry strategy', 'Overwriting the existing user’s link', 'Returning both destinations randomly', 'Code generation needs a collision-handling boundary at the source of truth.'),
        q('A disabled link still redirects from a CDN hours later. Which contract was overlooked?', 'Freshness across the complete resolution path', 'Only worker count', 'Only API write throughput', 'Downstream caches participate in user-visible freshness.'),
        q('All traffic is modest and one indexed DB meets the target. Best evolution plan?', 'Start simple and state measured triggers for a cache or sharding', 'Add global shards immediately without a reason', 'Ignore growth forever', 'A defensible design can be simple today and explicit about future limits.'),
    ], source='cache', case='links', diagram='Visitor -> Resolve API\nResolve API -> Optional cache\nResolve API -> Link database\nOwner -> Create/update API\nCreate/update API -> Link database')

add('design-jobs', 'designs', 'retries', 'Build reliable asynchronous processing',
    'Follow the job from durable acceptance to an observable terminal state. Each crash boundary needs a replay or reconciliation path.',
    'A user submits a stored document with a request ID. Save one logical job and recoverable processing intent, return its ID, then let workers claim and process it. Publish output safely under the job identity, record completion, and acknowledge. Status reads must enforce ownership. Repeated requests with changed payloads must be rejected.',
    'A queue helps decouple processing, but a durable database polling design can be simpler at modest traffic. Either needs bounded retries and visible failures.',
    'Fifteen workers at two jobs/second only match thirty arrivals/second; they provide no backlog-drain headroom.',
    ['Define acceptance and execution boundaries', 'Make output publication retry-safe', 'Track capacity and visible failure'], [
        q('What should a successful submission guarantee in this case?', 'The accepted job will not be silently lost', 'The conversion already finished in all cases', 'No worker can ever crash', 'Acceptance must persist recoverable work before responding.'),
        q('What protects status retrieval for a private document job?', 'Authorization against the job owner', 'Only knowing a job ID', 'A green queue status light', 'Job IDs identify records; they do not grant access.'),
        q('A conversion fails persistently. Which result belongs in the lifecycle?', 'A visible terminal failure with diagnostic context', 'Pending forever with no explanation', 'A successful empty output by default', 'The user and operator need to know the work reached an unsuccessful terminal state.'),
        q('Output was created before a worker crash. What should retry do?', 'Reuse or safely reconcile the logical job’s output', 'Create unlimited unrelated outputs', 'Assume the first effect was rolled back', 'Retry-safe publication must handle partial durable success.'),
        q('Job save commits but enqueue fails. What closes the lost-work gap?', 'An outbox or durable pending-job recovery path', 'Only a longer client loading animation', 'A faster cache for completed jobs', 'The accepted intent must survive and be discoverable for execution.'),
        q('Oldest pending age rises while broker uptime is perfect. Where should attention go?', 'Worker progress, failures, capacity, and publication delays', 'Only the broker connection ping', 'Only the UI title', 'Healthy transport does not establish useful completion throughput.'),
    ], source='queue', case='jobs')

add('design-seats', 'designs', 'concurrency', 'Build reservations without double booking',
    'Separate possibly stale browsing from authoritative ownership changes. State the exact predicates for hold and confirmation.',
    'Browsing may show a ten-second-old availability view. Holding a seat uses an atomic transition at the authority. Confirmation validates the current hold, its owner, expiry, and eligible state together. A stable confirmation identity returns the same result after a lost response. Payment is outside the existing case contract.',
    'Strict ownership transitions may wait or fail when authority cannot be reached. Relaxing browse freshness does not relax the reservation invariant.',
    'Reading “free” and later writing an owner unconditionally is a race, even when each server has a local lock.',
    ['Distinguish browse and commit guarantees', 'Trace two competing claims', 'Define retry and expiry outcomes'], [
        q('Can a stale browse result safely decide the final seat owner?', 'No, the state transition needs authoritative validation', 'Yes, if the page loaded quickly', 'Yes, because browsing is allowed to lag', 'A display allowance does not authorize a correctness-critical write.'),
        q('Two valid hold attempts race for one seat. What is the intended outcome?', 'At most one successful owner transition', 'Both succeed and decide later', 'Always prefer the nearest browser', 'The atomic claim preserves the one-owner rule.'),
        q('Why is payment excluded from this baseline design?', 'The fixed case contract explicitly leaves it out', 'Payments are impossible in all systems', 'Every reservation automatically charges money', 'Keep scope clear while explaining the required local confirmation transition.'),
        q('The hold owner clicks confirm after its deadline but before cleanup. What should happen?', 'Reject the expired hold at the confirmation boundary', 'Accept because cleanup has not deleted it', 'Trust the browser countdown alone', 'Expiry must be validated during the authoritative state change.'),
        q('A user retries a completed confirmation after losing its response. What should be returned?', 'The existing logical confirmation result', 'A second seat ownership record', 'A random new owner', 'Retry identity preserves the completed outcome.'),
        q('A reservation service uses only an in-memory lock per API process. Which scenario breaks it?', 'Competing requests handled by different servers', 'Two labels in one diagram', 'A different screen resolution', 'Independent locks do not coordinate shared authoritative state.'),
    ], source='sql', case='seats')

add('tradeoffs', 'designs', 'operations', 'Explain decisions and evolve a simple design',
    'For each decision, state the requirement it serves, its cost, and the condition that would make you reconsider it.',
    '“I chose one relational database because the workload fits, relationships need constraints, and the team can operate it. I would investigate read replicas when measured read load reaches our headroom threshold; I would then specify which reads may lag.” This explains more than listing technologies.',
    'A simpler system can reduce operational burden, while a more distributed system may meet a real availability or scale requirement. Compare against the actual contract.',
    'A named technology is not itself an explanation of a data flow, guarantee, or recovery plan.',
    ['Connect each component to a requirement', 'Explain cost and alternatives', 'State evidence-based evolution triggers'], [
        q('Which decision explanation is most useful?', 'Choice, relevant requirement, cost, and reconsideration trigger', 'Only a product name', 'Only “it scales”', 'A reviewable trade-off describes what is gained, what is paid, and under what assumptions.'),
        q('What should justify introducing microservices?', 'A concrete organisational or technical requirement and its costs', 'The assumption that more services are always better', 'A desire to avoid all failure handling', 'Distribution adds coordination and operation costs; explain the benefit.'),
        q('What should trigger a scaling evolution?', 'Measured limits or a changed requirement', 'Only the size of the architecture diagram', 'A random calendar date with no workload change', 'Evolution is easier to justify when tied to evidence and explicit goals.'),
        q('A reviewer proposes a different database that meets the same contract. Best response?', 'Compare access patterns, guarantees, operational cost, and trade-offs', 'Reject it because only one canonical diagram exists', 'Assume the newest database wins', 'Several architectures can be defensible under the same workload.'),
        q('You remove a queue because direct processing meets latency and reliability needs. What must still be explained?', 'The complete synchronous flow and its failure/timeout behaviour', 'Nothing, fewer boxes imply perfection', 'Only the deleted queue’s name', 'Simplifying removes a component, not the underlying product guarantees.'),
        q('What makes an interview design coherent?', 'A complete normal flow plus concrete failures, recovery, and justified choices', 'A list of every tool the candidate knows', 'An unexplained diagram with many arrows', 'Reasoning connects requirements to behaviour and makes assumptions reviewable.'),
    ], source='sre')

# Compatibility with the six original focused lessons and assessment repair links.
LEGACY_LESSONS = {'requirements': 'guarantees', 'reads': 'cache-freshness',
                  'capacity': 'estimates', 'retries': 'retry-identity',
                  'concurrency': 'concurrent-holds', 'operations': 'observability'}


def public_question(key, order=None):
    item = deepcopy(QUESTIONS[key])
    item.pop('correct')
    item.pop('explanation')
    if order:
        by_id = {c['id']: c for c in item['choices']}
        item['choices'] = [by_id[k] for k in order]
    return item


def public_lesson(key):
    item = deepcopy(LESSONS[key])
    item['questions'] = [public_question(k) for k in item['quiz_ids']]
    keys = list(LESSONS)
    index = keys.index(key)
    item['next_id'] = keys[index + 1] if index + 1 < len(keys) else None
    return item
