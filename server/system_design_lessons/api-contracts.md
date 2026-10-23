---
id: api-contracts
category: apis
skill: requirements
title: Design an API contract
minutes: 16
summary: An API is a promise other teams build on, so it outlives your implementation. A good contract makes success, failure and retries unambiguous; bounds every response; makes concurrent updates safe; and can evolve without breaking clients. Pick the protocol from who the clients are, not from fashion.
objectives:
  - Model resources and operations with correct methods, status codes and structured errors
  - Paginate with stable cursors and explain why offsets skip and repeat items
  - Prevent lost updates with optimistic concurrency (ETag and If-Match)
  - Choose between REST, gRPC and GraphQL, and evolve a contract without breaking clients
sources:
  - ['RFC 9110: HTTP Semantics (methods and status codes)', 'https://www.rfc-editor.org/rfc/rfc9110']
  - ['RFC 9457: Problem Details for HTTP APIs', 'https://www.rfc-editor.org/rfc/rfc9457']
  - ['Google API Improvement Proposals (AIP) — pagination', 'https://google.aip.dev/158']
---

> [!story] The paginated export that lost rows
> A finance team exported transactions through `GET /transactions?page=N&limit=100`. Every night a few hundred rows were missing and a few appeared twice. New transactions were inserted while the export paged through, shifting every row down by one offset per insert. Nothing in the API was "broken"; the contract — page by position in a changing list — simply couldn't promise a complete export.

## Resources, methods and what they promise

| Method | Meaning | Safe? | Idempotent? |
|---|---|---|---|
| `GET /orders/42` | Read | ✓ | ✓ |
| `POST /orders` | Create (server assigns ID) or run an action | ✗ | ✗ — unless you add an idempotency key |
| `PUT /orders/42` | Replace the whole resource | ✗ | ✓ — the same PUT twice leaves the same state |
| `PATCH /orders/42` | Partial update | ✗ | Not necessarily (`{"op":"increment"}` isn't) |
| `DELETE /orders/42` | Remove | ✗ | ✓ — a second delete still leaves it deleted (may return 404) |

**Safe** methods don't change state; caches and crawlers rely on that. **Idempotent** methods can be retried after a timeout without changing the outcome, so clients and proxies may retry them automatically.

> [!mistake] GET with side effects
> `GET /emails/123/send` will be called by link previews, crawlers, prefetchers and retrying proxies. Anything that changes state must not be a GET.

## Status codes and errors

Clients branch on status codes, so use them precisely:

```sort
prompt: Which status code fits each situation?
buckets: ['201 Created', '202 Accepted', '400 / 422', '401', '403', '404', '409', '412 Precondition Failed', '429']
items:
  - {text: 'POST /orders created order 991; the Location header points at it', bucket: 0, why: 'A resource now exists.'}
  - {text: 'POST /exports queued a job that will finish in a few minutes', bucket: 1, why: 'Accepted for processing, not done — return a job resource to poll.'}
  - {text: 'The request body has an invalid email field', bucket: 2, why: '400 for malformed requests, 422 for well-formed but semantically invalid ones. Either way, the client must change the request.'}
  - {text: 'No credentials, or an expired token', bucket: 3, why: 'Unauthenticated — the client should (re)authenticate.'}
  - {text: "Authenticated user tries to read another user's invoice", bucket: 4, why: "Authenticated but not allowed. (Many APIs return 404 to avoid confirming the resource exists.)"}
  - {text: 'Creating a username that already exists', bucket: 6, why: 'Conflicts with current state.'}
  - {text: 'PUT with If-Match: "v7", but the resource is now at v8', bucket: 7, why: "The client's precondition (it's still v7) failed: someone else changed it."}
  - {text: 'Client exceeded 100 requests/minute', bucket: 8, why: 'Too Many Requests, ideally with Retry-After.'}
  - {text: 'GET /orders/abc for an order ID that never existed', bucket: 5, why: 'Not Found.'}
```

Return errors in a consistent, machine-readable shape — RFC 9457 "problem details" is a good default:

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "https://api.shop.com/errors/invalid-field",
  "title": "Invalid field",
  "status": 422,
  "detail": "email must be a valid address",
  "errors": [{"field": "email", "code": "format"}],
  "request_id": "req_8f2c19"
}
```

A `request_id` in every response (and in your logs) makes support tickets traceable. A stable `type` or `code` lets clients branch without parsing English.

## Pagination: bound every list

An unbounded list endpoint is an outage waiting for a large customer. Every list needs a maximum page size, and a way to fetch the next page that's correct while data changes.

- **Offset pagination** (`?offset=200&limit=100`) addresses rows *by position*. Inserts before the offset shift rows, so pages repeat or skip items, and `OFFSET 1000000` makes the database walk and discard a million rows.
- **Cursor pagination** (`?after=eyJ0IjoiMjAyNi…`) addresses rows *by key*: "items after `(created_at, id)` = (T, 991)". It's stable under inserts, and an index makes each page a cheap range seek. The cursor is opaque to clients, so you can change its encoding.

Try both against a feed that changes while you page:

```sim
name: pagination
title: Offset versus cursor
challenges:
  - {text: 'Read page 1, publish new posts, then load the next page. Make the offset column show a duplicate.', metric: dupes, op: '>=', value: 1}
takeaway: |
  The cursor column never repeats or skips, because "after (created_at, id)" names a position in the *data*, not in a list that moves. Note the `id` tie-breaker: two rows with the same timestamp still need a deterministic order, or a page boundary between them can drop one.
```

```sql
-- Cursor pagination for "newest first", with a unique tie-breaker.
-- Backed by an index on (owner_id, created_at DESC, id DESC).
SELECT id, created_at, total
FROM orders
WHERE owner_id = $1
  AND (created_at, id) < ($2, $3)      -- the decoded cursor
ORDER BY created_at DESC, id DESC
LIMIT 51;                              -- fetch one extra to know whether a next page exists
```

> [!senior] Cursors aren't snapshots
> Cursor pagination prevents skips and duplicates for items that existed when you started, but items inserted behind your cursor won't appear, and updated items may move. For a complete, consistent export, page over an immutable key range up to a fixed high-water mark, or run the export as an async job against a snapshot.

## Concurrent updates: don't lose the other person's edit

Two people edit the same document. Both read version 7, both save. Without care, the second save silently overwrites the first.

```timeline
title: Optimistic concurrency with ETags
lanes: [Alice, Bob, API, Database]
state: {Document: 'v7: title=Draft', 'Alice sees': '', 'Bob sees': ''}
steps:
  - {lane: Alice, to: API, text: 'GET /docs/9 → 200, ETag: "v7"', set: {'Alice sees': 'v7'}}
  - {lane: Bob, to: API, text: 'GET /docs/9 → 200, ETag: "v7"', set: {'Bob sees': 'v7'}}
  - {lane: Alice, to: API, text: 'PUT /docs/9, If-Match: "v7", title=Final'}
  - {lane: API, to: Database, text: "UPDATE docs SET title='Final', version=8 WHERE id=9 AND version=7 → 1 row", set: {Document: 'v8: title=Final'}}
  - {lane: Bob, to: API, text: 'PUT /docs/9, If-Match: "v7", body=…'}
  - {lane: API, to: Database, text: 'UPDATE … WHERE id=9 AND version=7 → 0 rows'}
  - {lane: API, to: Bob, text: '412 Precondition Failed — reload, merge, retry', set: {'Bob sees': 'conflict, must reload v8'}}
```

The version check and the write are **one** conditional `UPDATE`, so no race can slip between them. This is **optimistic** concurrency: cheap when conflicts are rare, which they usually are for human edits. (A read-then-write in application code would reintroduce the race.)

```predict
prompt: A mobile client sends `PATCH /cart/items/5 {"quantity_delta": +1}`, times out, and retries. What happens?
choices:
  - Nothing bad, because PATCH is idempotent
  - The quantity may be incremented twice, because this PATCH is not idempotent
  - The server rejects the retry automatically
  - HTTP deduplicates PATCH requests
answer: 1
reveal: |
  PATCH isn't idempotent by definition — it depends on the operation. "Add one" applied twice adds two. Either send the target state (`{"quantity": 3}`, which is idempotent), use `If-Match` so a stale retry fails, or include an idempotency key the server deduplicates on.
```

## REST, gRPC or GraphQL?

| | REST/JSON over HTTP | gRPC (Protobuf over HTTP/2) | GraphQL |
|---|---|---|---|
| Best for | Public APIs, browsers, third parties | Internal service-to-service, polyglot backends | Client-driven UIs with varied data needs |
| Strengths | Universal tooling, HTTP caching, easy to debug | Typed contracts, codegen, streaming, efficient encoding, deadlines | One round trip for nested data, clients pick fields |
| Costs | Over- and under-fetching, informal schemas (unless OpenAPI) | Not browser-native (needs gRPC-Web), less human-readable | Caching is harder, per-query cost control, N+1 resolvers |

A common split: GraphQL or REST at the edge for apps, gRPC between services.

## Evolving without breaking clients

- **Additive changes are safe:** new optional fields, new endpoints, new enum values *if clients ignore unknowns*.
- **Breaking changes need a new version:** removing or renaming fields, changing types or meaning, tightening validation.
- **Version** in the path (`/v2/orders`) or a header; support old versions for a published deprecation window; measure who still calls them.
- Write **tolerant readers**: ignore unknown fields, don't depend on field order.

```bug
title: API design review
prompt: Review this endpoint list for an orders API. Click the lines with a contract problem.
lang: text
code: |
  POST   /v1/orders                  -> 201 + Location, body includes order id
  GET    /v1/orders?offset=0&limit=1000000
  GET    /v1/orders/{id}             -> 200, or 404 if not found or not yours
  GET    /v1/orders/{id}/cancel      -> cancels the order
  PUT    /v1/orders/{id}             -> requires If-Match, 412 on version mismatch
  POST   /v1/orders/{id}/refunds     -> 200 {"status": "error", "message": "..."} on failure
bug: [2, 4, 6]
explain: |
  **Line 2:** no enforced maximum page size, and offset pagination on a growing list — clients can request a million rows, and pages shift under inserts. Cap `limit` and use cursors. **Line 4:** a state-changing GET will be triggered by crawlers, link previews and retries. Make it `POST /orders/{id}/cancellation`. **Line 6:** returning 200 with an error body defeats every client, proxy and monitoring tool that branches on status codes. Use a 4xx/5xx with problem details. (Line 3 deliberately returns 404 for "not yours" to avoid leaking existence — that's a reasonable choice.)
```

```interview
say: |
  "Resources are orders and their line items. Create is `POST /orders` with an `Idempotency-Key` header, returning 201 and the order. Reads are GETs; lists are cursor-paginated by `(created_at, id)` with a max page size of 100. Updates are PUTs guarded by `If-Match` on a version, so concurrent edits get a 412 instead of a lost update. Errors use problem-details JSON with a stable code and a request ID. Internally the services talk gRPC with deadlines. Changes are additive within v1; anything breaking goes to v2 with a deprecation window."
followups:
  - q: Why cursor rather than offset pagination?
    a: Offsets address positions in a moving list, so inserts cause skips and duplicates, and deep offsets scan discarded rows. Cursors address keys, are stable under inserts, and become index range seeks.
  - q: How do you stop two users overwriting each other's edits?
    a: Optimistic concurrency. The response carries a version (ETag); updates send `If-Match`; the server applies a conditional update and returns 412 if the version moved. Clients reload and merge.
  - q: When would you pick GraphQL?
    a: When many client screens need different shapes of nested data and round trips matter, for instance on mobile. You then take on query cost limits, caching at the field or persisted-query level, and batching to avoid N+1 resolver calls.
weak: |
  Lists endpoints with verbs in the paths, returns 200 for everything, unbounded lists with offsets, no story for concurrent edits, retries or versioning.
strong: |
  Correct methods and status codes, structured errors with request IDs, bounded cursor pagination with a tie-breaker, optimistic concurrency, idempotent creates, a protocol choice justified by client type, and an evolution policy.
```

```recall
prompt: Explain why offset pagination can skip or duplicate items while a client pages through a list, and how a cursor fixes it.
points:
  - Offsets identify rows by their position in the current ordering
  - Inserts or deletes before the offset shift positions between page requests
  - So an insert at the top makes the next page repeat an item, and a delete makes it skip one
  - A cursor encodes the last item's sort key (e.g. created_at plus a unique id) and asks for items after it, which isn't affected by shifts
model: |
  With `OFFSET 20 LIMIT 10` the database returns whatever currently sits at positions 21–30. If two new items are inserted at the top between page 2 and page 3, everything shifts down by two, so page 3 starts with two items the client already saw. A deletion shifts things up and an item is skipped. A cursor instead says "give me items whose (created_at, id) is less than (T, 991)" — the last item I saw. That names a place in the data, not in the list, so inserts and deletes elsewhere can't shift it, and with an index it's a cheap range seek. The unique id breaks ties between equal timestamps.
```

```questions
- kind: check
  type: multi
  prompt: Which methods are idempotent by definition in HTTP? Select all that apply.
  choices:
    - text: GET
      correct: true
    - text: PUT
      correct: true
    - text: DELETE
      correct: true
    - text: POST
      why: Two identical POSTs can create two resources. Idempotency keys exist to fix exactly this.
    - text: PATCH
      why: PATCH can be idempotent (set a field) or not (increment a field). HTTP doesn't guarantee either.
  explanation: Idempotent means repeating the request leaves the same server state. That's what makes automatic retries safe. POST and PATCH need extra mechanisms (idempotency keys, preconditions) to be retry-safe.
- kind: check
  prompt: Two users edit the same record. What contract prevents the second save from silently overwriting the first?
  choices:
    - text: Return a version (ETag); updates send If-Match; the server does a conditional update and returns 412 if the version changed
      correct: true
    - text: Use PUT instead of POST
      why: PUT is idempotent, but it still overwrites whatever is there. It doesn't detect concurrent edits.
    - text: Have the client read the record again just before saving
      why: Another write can still land between the read and the save.
    - text: Return 200 for every save
      why: That hides the conflict.
  explanation: Optimistic concurrency makes the version check and the write one atomic operation, and turns a lost update into a visible conflict the client can resolve.
- kind: check
  prompt: A feed uses `?offset=40&limit=20`, and new posts arrive at the top while a user pages. What will they see?
  choices:
    - text: Some posts repeated on the next page, because positions shift down as posts are inserted above
      correct: true
    - text: A consistent snapshot of the feed
      why: Offsets read the list as it is now, which keeps changing.
    - text: An error once the list changes
      why: Nothing detects the change. The results are just quietly wrong.
    - text: Only new posts
      why: The offset still points into the older part of the list.
  explanation: Offsets address positions. Cursors address keys (`created_at`, `id`) and stay stable under inserts.
- kind: check
  type: order
  prompt: Order these API changes from safest to most breaking, for existing clients that ignore unknown fields.
  items:
    - Add a new optional response field
    - Add a new endpoint
    - Make a previously optional request field required
    - Rename an existing response field
  explanation: Additions that clients can ignore are safe. Tightening request validation breaks clients that omit the field. Renaming removes the old field, which breaks everything that reads it — that one needs a new version or a long dual-write period.
- kind: fire
  prompt: Why is `GET /emails/{id}/send` a dangerous endpoint?
  choices:
    - text: GET must be safe; crawlers, link previews, prefetchers and retrying proxies may call it and send emails
      correct: true
    - text: GET requests can't carry an ID in the path
      why: They can. The problem is the side effect.
    - text: GET responses are always cached forever
      why: Caching depends on headers. The bigger problem is that intermediaries assume GETs are safe to call.
    - text: GET is slower than POST
      why: Performance has nothing to do with it.
  explanation: Infrastructure assumes GET has no side effects. State changes belong in POST/PUT/PATCH/DELETE, often modelled as creating an action resource.
- kind: fire
  prompt: Which response best communicates "you sent too many requests"?
  choices:
    - text: 429 Too Many Requests with a Retry-After header
      correct: true
    - text: 500 Internal Server Error
      why: That blames the server and invites immediate retries.
    - text: 200 with {"error":"rate limited"}
      why: Clients and monitoring branch on status, so this hides the condition.
    - text: 403 Forbidden
      why: 403 means "not allowed at all", not "slow down".
  explanation: 429 plus Retry-After tells well-behaved clients exactly when to come back, which prevents retry storms.
- kind: fire
  prompt: A cursor-paginated list orders by `created_at` only. What bug can occur?
  choices:
    - text: Rows sharing a created_at value can be skipped or repeated at page boundaries
      correct: true
    - text: The list becomes unordered
      why: The ordering is fine for distinct timestamps. Ties are the problem.
    - text: Cursors stop working after 100 pages
      why: There's no such limit.
    - text: Pagination becomes offset-based
      why: It's still cursor-based, just ambiguous for ties.
  explanation: The cursor must identify a unique position. Add a unique tie-breaker such as id, order by both, and index both.
- kind: fire
  level: advanced
  prompt: Internal services in Go, Java and Python call each other at high volume with strict latency budgets. Which interface fits best?
  choices:
    - text: gRPC with Protobuf — typed contracts and codegen across languages, efficient encoding, built-in deadlines
      correct: true
    - text: GraphQL, because clients pick their fields
      why: GraphQL suits varied UI data needs. For service-to-service RPC it adds a query layer without the main benefits.
    - text: REST with free-form JSON and no schema
      why: It works, but loses typed contracts and adds parsing overhead at high volume.
    - text: Shared database tables
      why: That couples services through storage, with no contract or ownership.
  explanation: gRPC's strengths — schemas, codegen, HTTP/2 multiplexing, deadline propagation — fit internal polyglot RPC. REST remains a good default for public APIs.
- kind: fire
  type: multi
  prompt: Which belong in a well-designed error response? Select all that apply.
  choices:
    - text: An accurate 4xx or 5xx status code
      correct: true
    - text: A stable, machine-readable error type or code
      correct: true
    - text: A human-readable detail message
      correct: true
    - text: A request ID that matches the server logs
      correct: true
    - text: The full server stack trace
      why: That leaks internals and helps attackers. Keep it in your logs, keyed by the request ID.
  explanation: Clients branch on status and code, humans read the detail, and support traces the request ID. Internals stay internal.
```
