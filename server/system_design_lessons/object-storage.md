---
id: object-storage
category: storage
skill: operations
title: Files, object storage and metadata
minutes: 15
summary: Large bytes belong in object storage — cheap, very durable, effectively unlimited — while the facts you query (owner, status, size, which key holds the bytes) belong in a database. Clients upload and download directly with short-lived signed URLs, and because the bytes and the metadata live in two systems, every flow needs a plan for the crash in between.
objectives:
  - Explain object storage semantics (keys, immutable objects, durability, consistency, per-prefix throughput) and when to use it
  - Design direct-to-storage uploads and downloads with presigned URLs, keeping authorisation in your service
  - Coordinate metadata and bytes across two systems, with upload states and reconciliation of orphans
  - Use multipart uploads, lifecycle rules, storage classes and a CDN to control cost and performance
sources:
  - ['Amazon S3 User Guide: What is Amazon S3?', 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html']
  - ['Amazon S3: Presigned URLs', 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html']
  - ['Amazon S3: Optimising performance (request rates per prefix)', 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/optimizing-performance.html']
case: jobs
---

> [!story] The upload service that melted the API
> A photo app proxied every upload through its API servers: the phone sent bytes to the API, which streamed them to S3. A marketing push brought 40,000 simultaneous uploads of 5 MB photos. API instances ran out of memory buffering request bodies, connection slots filled with slow mobile uploads, and *every* endpoint — login, feed, checkout — timed out. Moving to presigned direct uploads took the bytes off the API entirely; the API's job became issuing permissions and recording metadata, a few milliseconds per upload.

## What object storage is (and isn't)

Object stores (Amazon S3, Google Cloud Storage, Azure Blob Storage, MinIO) store **objects**: a blob of bytes plus some metadata, addressed by a **key** in a **bucket**.

- **Flat namespace:** `photos/2026/03/abc.jpg` is one key; the slashes are a naming convention, not real directories.
- **Whole-object writes:** you replace objects rather than editing bytes in place; appends need a new object (or multipart composition).
- **Durability:** S3 is designed for 99.999999999% (eleven nines) durability by storing data redundantly across multiple availability zones.
- **Consistency:** S3 now provides strong read-after-write consistency for PUTs and DELETEs. Older documentation and some other stores are weaker.
- **Throughput scales by prefix:** S3 supports at least 3,500 writes and 5,500 reads per second **per prefix**, and scales out across many prefixes.
- **Latency:** tens of milliseconds to first byte — fine for files, far too slow to replace a database row lookup.

It's not a filesystem (no locking, no renames that are cheap) and not a database (no queries over contents). The database holds what you need to query.

```sort
prompt: Where does each piece of data belong?
buckets: [Object storage, Database]
items:
  - {text: 'The 8 MB original photo', bucket: 0, why: 'Large immutable bytes: cheap, durable, served via CDN.'}
  - {text: 'Who owns photo 991 and who it is shared with', bucket: 1, why: 'Queried and authorised on every request — relational data.'}
  - {text: 'Processing status: uploaded, thumbnailing, ready, failed', bucket: 1, why: 'Changing state that jobs and UIs query.'}
  - {text: 'Three resized thumbnails', bucket: 0, why: 'Derived bytes, stored as their own objects under predictable keys.'}
  - {text: 'The object key, size, content type and SHA-256 of each file', bucket: 1, why: 'Metadata that points at the bytes and lets you verify and query them.'}
  - {text: 'A nightly 40 GB database backup', bucket: 0, why: 'Archival bytes, ideal for lifecycle rules into cold storage classes.'}
```

## Direct uploads with presigned URLs

A **presigned URL** is a URL signed with your service's credentials that grants one specific operation (PUT this key, with this content type, up to this size) until a short expiry. The client talks to the object store directly; your API never touches the bytes.

```arch
title: Direct-to-storage upload
nodes:
  - {id: app, label: Mobile app, kind: client, x: 0, y: 1}
  - {id: api, label: Upload API, kind: service, x: 1, y: 1, note: 'authorise + sign'}
  - {id: db, label: Database, kind: db, x: 1, y: 2, note: 'photo rows'}
  - {id: s3, label: Object storage, kind: storage, x: 2, y: 1}
  - {id: worker, label: Thumbnailer, kind: worker, x: 2, y: 2}
  - {id: cdn, label: CDN, kind: cdn, x: 2, y: 0}
edges:
  - [app, api, 'POST /photos']
  - [api, db, 'INSERT pending']
  - [app, s3, 'PUT bytes (presigned)']
  - [s3, worker, 'object-created event']
  - [worker, db, 'status=ready']
  - [app, cdn, 'GET image']
  - [cdn, s3, 'origin']
paths:
  - label: Upload
    steps:
      - [app, api, 'POST /photos {size: 8 MB, type: image/jpeg}. The API checks the user may upload and that the size and type are allowed.']
      - [api, db, 'INSERT photo 991 (owner, key=u/17/991.jpg, status=pending, expected size)']
      - [app, api, 'Response: a presigned PUT URL for exactly that key, valid for 10 minutes, with the content type and length fixed']
      - [app, s3, 'The phone uploads the bytes directly. The API servers never see them.']
      - [s3, worker, 'The object-created notification triggers processing']
      - [worker, db, 'Verify size and type, write thumbnails, set status=ready (idempotent)']
  - label: Download
    steps:
      - [app, api, 'GET /photos/991 — the API checks the caller may view it and returns a short-lived signed CDN URL']
      - [app, cdn, 'The client fetches via the CDN; the edge verifies the signature']
      - [cdn, s3, 'Edge miss → fetch from the bucket (private; only the CDN may read it)']
```

> [!mistake] The signature is the authorisation
> Whoever holds a presigned URL can use it until it expires. Generating one *is* an authorisation decision: check ownership first, scope it to one key and operation, keep expiry short, and pin size and content type where the store supports it (S3's presigned POST policies can enforce a content-length range).

```bug
title: Review the upload endpoints
prompt: Which lines create a security or reliability problem?
lang: python
code: |
  @app.post("/photos/upload-url")
  def upload_url(user, filename):
      key = f"uploads/{filename}"
      return s3.presign_put(bucket="photos", key=key, expires_in=7 * 24 * 3600)

  @app.get("/photos/{photo_id}/download-url")
  def download_url(user, photo_id):
      photo = db.get_photo(photo_id)
      return s3.presign_get(bucket="photos", key=photo.key, expires_in=300)
bug: [3, 4, 8]
explain: |
  **Line 3** uses the client-supplied filename as the key: users overwrite each other's files (`uploads/avatar.png`), and the key isn't tied to an owner or a metadata row. Generate keys server-side (`u/{user_id}/{uuid}`) and record them. **Line 4** grants upload rights for a week with no size or type constraints — a leaked URL becomes free storage for anyone. Use minutes and constrain the upload. **Line 8** issues a download URL without checking that `user` may view this photo. Any user who guesses or enumerates IDs can read private photos.
fix: |
  @app.post("/photos")
  def create_upload(user, size, content_type):
      check_quota_and_type(user, size, content_type)
      photo = db.insert_photo(owner=user.id, key=f"u/{user.id}/{uuid4()}", status="pending", size=size)
      return {"photo_id": photo.id,
              "upload": s3.presign_post(key=photo.key, max_size=size, content_type=content_type, expires_in=600)}

  @app.get("/photos/{photo_id}/download-url")
  def download_url(user, photo_id):
      photo = db.get_photo(photo_id)
      if not can_view(user, photo):
          raise NotFound()
      return cdn.sign(photo.key, expires_in=300)
```

## Two systems, one crash window

Metadata commits in the database; bytes land in the object store. There's no transaction spanning both, so trace every crash point:

```timeline
title: Upload with a pending row
lanes: [Client, API, Database, Object store]
state: {Row: none, Object: none}
steps:
  - {lane: API, to: Database, text: 'INSERT photo 991 status=pending', set: {Row: '991 pending'}}
  - {lane: Client, to: Object store, text: 'PUT bytes via presigned URL', set: {Object: 'u/17/991.jpg'}}
  - {lane: Object store, to: API, text: 'object-created event → mark 991 uploaded'}
  - {lane: API, to: Database, text: 'UPDATE 991 status=ready', set: {Row: '991 ready'}}
crashes:
  - after: 0
    label: client gives up before uploading
    verdict: stuck
    text: A **pending row with no object**. A cleanup job deletes pending rows older than the URL expiry (plus a margin). The user just sees an upload that never finished.
  - after: 1
    label: event lost before the row is updated
    verdict: stuck
    text: The bytes exist but the row says pending. A **reconciler** lists recent objects (or checks pending rows with `HEAD` requests) and completes them. Events are a fast path, not the only path.
  - after: 3
    label: after ready
    verdict: safe
    text: Consistent. Later deletes should mark the row deleted first, then remove the object asynchronously (and keep versioning or a grace period for recovery).
```

Writing the row **first** (as pending) means you never have bytes you don't know about from the normal path. Orphans can still appear from aborted multipart uploads or bugs, so add a lifecycle rule that aborts incomplete multipart uploads after a day, and a periodic reconciliation between the bucket listing and the database.

## Big files, cost and lifecycle

- **Multipart upload** splits large files into parts (5 MB–5 GB each, up to 10,000 parts) uploaded in parallel and retried individually, then combined. It's required above 5 GB in S3 and better above about 100 MB.
- **Storage classes** trade retrieval latency and cost for storage price: standard → infrequent access → archive (minutes to hours to retrieve). **Lifecycle rules** move objects between them by age, and expire temporary files.
- **Put a CDN in front** for anything read frequently. It's cheaper per GB delivered than bucket egress, and much faster for users.
- **Spread keys** if you need very high request rates: per-prefix limits scale out across prefixes, so a design that writes everything under one hot prefix may need more distribution.

```calc
title: Plan a multipart upload
prompt: A user uploads a **12 GB** video. You use **64 MB** parts and upload **8 parts in parallel**, and each part takes about **4 seconds** on their connection. Roughly how many seconds does the upload take?
answer: 96
unit: s
tolerance: 1.15
steps: |
  12 GB ÷ 64 MB = 12,000 ÷ 64 ≈ 188 parts. With 8 in flight, that's ≈ 24 rounds × 4 s ≈ **94–96 s**. If one part fails, only that 64 MB is retried, not the whole 12 GB. The client records completed part numbers and ETags, so it can resume after a crash or network change.
```

```predict
prompt: Your app serves 50 TB/month of image downloads directly from an S3 bucket in one region. Users are worldwide. What's the single biggest improvement for cost and latency?
choices:
  - Move the images into the database
  - Put a CDN in front, with long cache lifetimes on immutable (versioned) image keys
  - Replicate the bucket to every region and pick one at random
  - Compress the database
answer: 1
reveal: |
  Images are immutable and read many times, so a CDN serves most requests from edges near users and cuts origin egress — usually the largest cost line. Versioned keys (a new key per edit) let you cache forever without invalidation. Cross-region replication helps disaster recovery, but the CDN is the delivery solution.
```

```interview
say: |
  "Bytes go to S3 and metadata goes to Postgres. Upload is direct: POST /photos checks quota and creates a pending row with a server-generated key, then returns a presigned POST valid for ten minutes and pinned to that key, size and type. The client uploads straight to S3; the object-created event triggers verification and thumbnails and flips the row to ready, idempotently. A reconciler handles lost events, and a cleanup job removes stale pending rows. Downloads are authorised by the API and served through a CDN with signed URLs. Lifecycle rules abort incomplete multipart uploads and move old originals to infrequent-access storage."
followups:
  - q: Why not upload through the API servers?
    a: It ties API capacity and memory to slow, large uploads, so one surge degrades every endpoint. Presigned direct uploads move the bytes to a system built for them, and the API only authorises and records.
  - q: What if the object-created event is lost?
    a: Treat events as a fast path. A reconciler checks pending rows (HEAD the object) or lists recent keys and completes processing, and the processing is idempotent.
  - q: How do you delete a user's files?
    a: Mark rows deleted first (so they disappear from the product immediately), then delete objects asynchronously, including derived files. Versioned buckets also need old versions handled, especially for legal deletion requirements.
weak: |
  "Store images in the database" or "upload to S3" with no authorisation, no metadata consistency plan, and the API proxying every byte.
strong: |
  Separates bytes from metadata, uses short-lived presigned URLs issued after authorisation, writes a pending row first and reconciles orphans, uses multipart for big files, a CDN for delivery and lifecycle rules for cost.
```

```recall
prompt: Explain how a presigned URL upload works and why issuing the URL is a security-critical step.
points:
  - The client asks the API for permission; the API authenticates, checks authorisation, quota, size and type, and decides the object key
  - The API signs a URL scoped to one operation and key with a short expiry (and size/type constraints where possible)
  - The client uploads directly to object storage, so the API never handles the bytes
  - Anyone holding the URL can use it until expiry, so generating it is the authorisation decision; afterwards metadata is updated, ideally from an event plus a reconciler
model: |
  The client asks the API to start an upload. The API checks who the user is, whether they may upload, their quota and the declared size and type, creates a pending metadata row, and picks a server-generated key. It then signs a URL that permits exactly one PUT (or POST) to that key, for a few minutes, with size and type pinned. The client sends the bytes straight to the object store. Because the URL is a bearer credential — anyone with it can use it — issuing it is the security check: get scope and expiry wrong and it leaks write access. When the object lands, an event (backed by a reconciler) marks the row uploaded and triggers processing.
```

```questions
- kind: check
  prompt: Why upload large files directly to object storage with presigned URLs rather than through the API servers?
  choices:
    - text: The API stops spending memory, bandwidth and connection slots on bytes; it only authorises and records metadata
      correct: true
    - text: Presigned URLs make uploads unauthenticated
      why: The API authenticates and authorises before signing. The URL carries that decision.
    - text: Object storage can't receive uploads any other way
      why: You can proxy uploads through your servers. It just scales badly.
    - text: It removes the need for metadata
      why: You still need rows recording owner, key and status.
  explanation: Direct uploads isolate the API from slow, large transfers. A surge of uploads can't take down login or checkout.
- kind: check
  type: multi
  prompt: Which make a presigned upload URL safer? Select all that apply.
  choices:
    - text: Check the user's permission and quota before signing
      correct: true
    - text: Generate the object key on the server, tied to the user and a metadata row
      correct: true
    - text: Expire it within minutes
      correct: true
    - text: Constrain content type and maximum size
      correct: true
    - text: Use the client-provided filename as the key
      why: Users can overwrite each other's objects, and the key isn't tied to your records.
  explanation: A presigned URL is a bearer credential. Scope it tightly, keep it short-lived, and make the authorisation decision before issuing it.
- kind: check
  prompt: A metadata row is written as pending, but the object-created event that should mark it ready is lost. What design handles this?
  choices:
    - text: A reconciler that checks pending rows against the bucket (or lists recent objects) and completes them idempotently
      correct: true
    - text: Nothing — events are always delivered
      why: Events can be delayed, duplicated or dropped. Treat them as a fast path.
    - text: Delete the object
      why: That throws away a successful upload.
    - text: Ask users to upload again
      why: That's a poor experience, and it's unnecessary because the bytes are already there.
  explanation: Crossing two systems needs a recovery path beyond the happy-path notification.
- kind: check
  type: numeric
  prompt: A 6 GB file is uploaded in 100 MB parts. How many parts are needed? (Use 1 GB = 1,000 MB.)
  answer: 60
  unit: parts
  tolerance: 0.02
  explanation: 6,000 ÷ 100 = 60 parts, each uploaded and retried independently, possibly in parallel.
- kind: fire
  prompt: Which data belongs in the database rather than the object store?
  choices:
    - text: Who owns each file and who it's shared with
      correct: true
    - text: The original video bytes
      why: Large bytes belong in object storage.
    - text: Generated thumbnails
      why: Those are bytes too, stored as objects.
    - text: Archived log files
      why: Archives are object-storage material, with lifecycle rules.
  explanation: Put what you query and authorise on in the database, and the bytes in object storage, linked by the object key.
- kind: fire
  prompt: A download endpoint returns a presigned GET URL for any photo ID without checking the caller. What's the vulnerability?
  choices:
    - text: Anyone can obtain read access to private photos by enumerating IDs (broken object-level authorisation)
      correct: true
    - text: The URL will expire too quickly
      why: Expiry isn't the problem. Handing out the URL at all is.
    - text: Presigned URLs leak AWS credentials
      why: They carry a signature, not your secret key.
    - text: Downloads will be slower
      why: Speed isn't the issue.
  explanation: Issuing a signed URL is authorisation. Check the caller's access to that specific object first.
- kind: fire
  prompt: Users worldwide repeatedly download immutable images from one regional bucket, and egress costs are high. What helps most?
  choices:
    - text: A CDN with long cache lifetimes on versioned keys
      correct: true
    - text: Moving images into the database
      why: That's slower and more expensive, and it doesn't reduce delivery distance.
    - text: Shorter object keys
      why: Key length doesn't affect egress.
    - text: Disabling bucket versioning
      why: That has nothing to do with delivery costs.
  explanation: Immutable, frequently read content is ideal for CDN caching, which cuts origin egress and latency.
- kind: fire
  level: advanced
  prompt: Incomplete multipart uploads from abandoned sessions are accumulating and costing money. What's the standard fix?
  choices:
    - text: A lifecycle rule that aborts incomplete multipart uploads after a set number of days
      correct: true
    - text: Disable multipart uploads
      why: You'd lose resumability and parallelism for large files.
    - text: Shorter object keys
      why: Unrelated.
    - text: Nothing — incomplete uploads are free
      why: Their stored parts are billed until aborted.
  explanation: Object stores bill for uploaded parts. Lifecycle rules clean up abandoned multipart uploads automatically.
- kind: fire
  type: multi
  prompt: Which statements about S3-style object storage are accurate today? Select all that apply.
  choices:
    - text: It's designed for extremely high durability by storing data redundantly across availability zones
      correct: true
    - text: Request-rate limits apply per prefix and scale out across prefixes
      correct: true
    - text: Objects are written whole rather than edited in place
      correct: true
    - text: It supports SQL queries over object metadata like a database
      why: Listing and tags are limited. Keep queryable metadata in a database.
    - text: First-byte latency is comparable to an in-memory cache
      why: It's tens of milliseconds — fine for files, not a cache replacement.
  explanation: Object storage is durable, scalable and cheap, but it's a file store with limited querying and modest latency.
```
