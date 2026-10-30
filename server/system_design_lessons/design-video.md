---
id: design-video
category: casebook
skill: capacity
title: Design video upload and streaming
minutes: 20
summary: A YouTube-style platform is a media pipeline plus a delivery network. Uploads are huge and resumable, processing is a parallel DAG of retry-safe transcoding jobs producing many renditions, playback is adaptive-bitrate segments served almost entirely from CDN edges, and cost is dominated by egress and storage — so popularity decides where every byte lives.
objectives:
  - Size upload, storage and egress, and identify the dominant costs
  - Design resumable uploads and a parallel, idempotent transcoding pipeline
  - Explain adaptive bitrate streaming (HLS/DASH) and CDN delivery with an origin shield
  - Apply popularity-based storage tiering and count views robustly
sources:
  - ['Apple: HTTP Live Streaming (HLS) authoring specification', 'https://developer.apple.com/documentation/http-live-streaming/hls-authoring-specification-for-apple-devices']
  - ['Netflix tech blog: Rebuilding Netflix video processing pipeline with microservices', 'https://netflixtechblog.com/rebuilding-netflix-video-processing-pipeline-with-microservices-4e5e6310e359']
  - ['YouTube: Recommended upload encoding settings', 'https://support.google.com/youtube/answer/1722171']
case: video
---

## 1. Requirements

- Creators upload videos (up to several GB); viewers stream on phones, TVs and browsers.
- **500 hours of video uploaded per minute**; billions of views a day, heavily skewed to a small set of popular videos.
- Playback starts in **< 2 s** and adapts to bandwidth; a new video is watchable within **minutes**.
- Uploads survive network interruptions.
- View counts may lag, but mustn't be grossly inflated by bots or retries.

## 2. Estimates

```faded
title: Where the money goes
prompt: Fill in the estimates.
text: |
  Uploads: 500 hours/min × 1,440 min/day = [[#720000]] hours of video per day.

  Storage: if the original plus all renditions average ~3 GB per hour of video, that's about 2.2 PB of new storage per day. Over a year that's ~[[800 PB|8 PB|80 TB]], which is why storage tiering matters.

  Egress: 5B views/day × average 5 minutes watched × ~1.5 Mbps ≈ 5B × 300 s × 0.19 MB/s ≈ [[280 PB|2.8 PB|28 TB]] per day of streaming — the largest cost by far, served overwhelmingly from CDN edges.

  So the design priorities are [[CDN hit ratio and storage tiering|faster metadata queries|bigger app servers]].
explain: Video platforms are bandwidth and storage businesses. The application servers are a rounding error compared with bytes stored and bytes served.
```

## 3. Upload

```arch
title: Upload and processing pipeline
nodes:
  - {id: creator, label: Creator app, kind: client, x: 0, y: 1}
  - {id: api, label: Upload API, kind: service, x: 1, y: 1}
  - {id: raw, label: Raw uploads, kind: storage, x: 2, y: 0}
  - {id: meta, label: Video metadata DB, kind: db, x: 1, y: 2}
  - {id: orch, label: Workflow orchestrator, kind: service, x: 2, y: 1, note: 'DAG of jobs'}
  - {id: work, label: Transcode workers, kind: worker, x: 3, y: 1, note: 'GPU/CPU fleet'}
  - {id: out, label: Renditions + segments, kind: storage, x: 4, y: 1}
  - {id: cdn, label: CDN, kind: cdn, x: 4, y: 2}
edges:
  - [creator, api, 'start upload']
  - [creator, raw, 'multipart PUTs (presigned)']
  - [api, meta, 'video row: uploading']
  - [raw, orch, 'upload complete']
  - [orch, work, 'chunk tasks']
  - [work, out, 'write segments']
  - [orch, meta, 'status: ready']
  - [out, cdn, 'origin']
paths:
  - label: Upload and process
    steps:
      - [creator, api, 'Start: create the video row (uploading) and a multipart upload; return presigned part URLs']
      - [creator, raw, 'The app uploads 16 MB parts in parallel and retries failed parts individually, resuming after app restarts']
      - [raw, orch, 'Completion triggers the workflow: validate → split into GOP-aligned chunks → transcode each chunk × each rendition → stitch and segment → thumbnails → captions']
      - [orch, work, 'Hundreds of chunk tasks run in parallel, each idempotent (output key = video/rendition/chunk)']
      - [work, out, 'Write HLS/DASH segments and manifests']
      - [orch, meta, 'Mark ready once the first renditions exist (e.g. 360p and 720p); higher qualities follow']
```

**Parallelism:** transcoding a 2-hour video serially could take hours. Splitting it at keyframes into 10-second chunks and transcoding them in parallel cuts wall time to minutes. **Progressive availability:** publish low renditions first, so "watchable within minutes" holds even before 4K finishes.

```timeline
title: A transcode worker dies mid-chunk
lanes: [Orchestrator, Worker A, Worker B, Storage]
state: {'Chunk 37 (720p)': pending}
steps:
  - {lane: Orchestrator, to: Worker A, text: 'task: video 9/720p/chunk 37 (lease 5 min)', set: {'Chunk 37 (720p)': 'running on A'}}
  - {lane: Worker A, to: Storage, text: 'writing 9/720p/37.ts … worker crashes'}
  - {lane: Orchestrator, to: Orchestrator, text: 'lease expires → reschedule', set: {'Chunk 37 (720p)': pending}}
  - {lane: Orchestrator, to: Worker B, text: 'same task to worker B'}
  - {lane: Worker B, to: Storage, text: 'write 9/720p/37.ts (overwrites any partial file)', set: {'Chunk 37 (720p)': done}}
crashes:
  - after: 1
    label: worker dies writing output
    verdict: safe
    text: The deterministic output key means the retry overwrites the partial object, and the orchestrator only marks the chunk done when the task reports success. Only one 10-second chunk is redone, not the whole video.
```

## 4. Playback: adaptive bitrate

The video is encoded at several **renditions** (240p … 4K, at different bitrates) and cut into **segments** of 2–6 seconds. A **manifest** (HLS `.m3u8` or DASH `.mpd`) lists them. The player measures throughput and buffer level and picks the rendition for the *next* segment — stepping down on a slow train and back up on Wi-Fi.

```predict
prompt: A viewer presses play on a popular video. Where do the bytes come from?
choices:
  - The application servers stream the file from the database
  - The player fetches the manifest and then segments from a nearby CDN edge; on an edge miss, from an origin shield; only rarely from object storage
  - The creator's device
  - Peer-to-peer from other viewers by default
answer: 1
reveal: |
  Segments are just static files with immutable URLs, so they cache perfectly at CDN edges. Popular videos reach hit ratios near 100%. An origin shield collapses misses from many edges into one fetch. Application servers only handle metadata, authentication and signed URLs, never video bytes.
```

```sort
prompt: Which component handles each concern?
buckets: [Player (client), CDN, Application backend]
items:
  - {text: 'Switching from 1080p to 480p when bandwidth drops', bucket: 0, why: 'ABR logic runs in the player, segment by segment.'}
  - {text: 'Serving segment 312 of a viral video to a viewer in Lagos', bucket: 1, why: 'Static, immutable, hot — edge caches serve it.'}
  - {text: 'Checking the viewer may watch a members-only video and issuing a signed URL or cookie', bucket: 2, why: 'Authorisation decisions happen in the backend. The edge only verifies the signature.'}
  - {text: 'Remembering the playback position to resume later', bucket: 2, why: 'A small periodic write (or event) to a user-state store.'}
  - {text: 'Collapsing simultaneous misses for a newly uploaded video', bucket: 1, why: 'Request collapsing at the edge and origin shield.'}
```

## 5. Storage tiering and cost

Most videos are rarely watched after their first days; a few are watched constantly.

- **Hot:** popular renditions at the CDN and in standard object storage.
- **Warm or cold:** older, rarely viewed videos move to cheaper storage classes via lifecycle rules.
- **Fewer renditions for the long tail:** keep the original and a couple of common renditions; regenerate rare ones on demand (higher latency on first view), or never create 4K for videos with almost no views.
- **Codec choice:** newer codecs (VP9, AV1) cut bitrate significantly at the same quality, saving egress — worth the extra encoding compute for popular videos.

```calc
title: Savings from a better codec
prompt: Popular videos account for **200 PB/month** of egress at an average of **$0.005 per GB** (a large-volume CDN rate). Re-encoding them with a codec that's **30%** more efficient at the same quality saves how much per month, in **$ millions**?
answer: 0.3
unit: '$M / month'
tolerance: 1.05
steps: |
  200 PB = 200,000,000 GB. 30% of that is 60,000,000 GB × $0.005 = **$300,000 per month**. The extra encoding compute is spent once per video, while the egress saving recurs on every view — which is why platforms re-encode their most popular content with the most efficient codecs first.
```

## 6. View counting

View counts are a stream-processing problem, not a database `UPDATE`. Players send heartbeat or view events; a stream pipeline deduplicates (per session and video), filters bots (rate and pattern detection), applies a "counts as a view" rule (for example, 30 seconds watched), and aggregates into counters that update every few seconds or minutes. Popular videos never have a hot counter row.

```bug
title: Playback endpoint
prompt: Which lines will not scale or are wrong?
lang: python
code: |
  @app.get("/watch/{video_id}/stream")
  def stream(video_id, user):
      path = storage.get_path(video_id, quality="1080p")
      db.execute("UPDATE videos SET views = views + 1 WHERE id = %s", video_id)
      return FileResponse(path)
bug: [3, 4, 5]
explain: |
  **Line 3** picks a fixed 1080p file — no adaptive bitrate, so slow connections buffer and fast ones waste nothing but gain nothing. Return a manifest of renditions instead. **Line 4** increments a counter row on every request: a hot row for viral videos, counting retries and bots as views. Emit view events to a stream and aggregate with deduplication. **Line 5** streams video bytes through the application server, which is impossible at this egress scale. Return signed CDN URLs for the manifest and let the CDN serve the segments.
fix: |
  @app.get("/watch/{video_id}")
  def watch(video_id, user):
      check_can_view(user, video_id)
      events.publish("PlaybackStarted", video_id=video_id, session=user.session_id)
      return {"manifest": cdn.sign(f"videos/{video_id}/master.m3u8", expires_in=3600)}
```

```interview
ask: How would you design a large-scale video upload and streaming platform, covering upload, processing, playback, operating costs and view counting?
say: |
  "Bytes never touch app servers. Creators upload with resumable presigned multipart uploads to object storage; completion triggers a workflow that splits the video at keyframes and transcodes chunks in parallel into an ABR ladder, writing HLS segments under deterministic keys so retries are idempotent. Low renditions publish first, so it's watchable in minutes. Playback fetches a signed master manifest, and the player picks renditions per segment from CDN edges, with an origin shield collapsing misses. Egress (~280 PB/day) and storage (~800 PB/year) dominate cost, so popular videos get efficient codecs, and the long tail drops to cold storage with fewer renditions. Views are streamed events, deduplicated and bot-filtered, aggregated into counters."
followups:
  - q: How do you make uploads resumable?
    a: Multipart upload with independent parts; the client records completed parts and their ETags, so after a crash or network change it uploads only the missing parts and then completes.
  - q: How do you make a new viral video not stampede the origin?
    a: Immutable segment URLs, an origin shield, request collapsing, and pre-warming popular uploads (such as big creators' premieres) to edges.
  - q: How do you count views fairly?
    a: Asynchronous events with session-level dedupe, minimum watch time, bot filtering, and periodic aggregation — never an UPDATE per request.
weak: |
  Streams files from app servers, a single transcode per video, a fixed resolution, and a views counter column incremented on each request.
strong: |
  Resumable uploads, a parallel idempotent transcode DAG with progressive availability, ABR over a CDN with a shield, a cost-driven storage and codec strategy, and stream-processed view counting.
```

```recall
prompt: Explain what happens between a creator finishing an upload and a viewer streaming the video in adaptive quality.
points:
  - The completed multipart upload in object storage triggers a processing workflow (validation, chunking at keyframes)
  - Chunks are transcoded in parallel into multiple renditions, as idempotent tasks with deterministic output keys and retries on failure
  - Outputs are segmented (HLS/DASH) with manifests; lower renditions are published first so the video is watchable quickly
  - The player fetches a signed manifest and segments from CDN edges (origin shield on misses), switching renditions per segment as bandwidth changes
model: |
  When the last upload part lands in object storage, the orchestrator starts a workflow: validate the file, split it at keyframes into chunks, then fan out transcoding tasks — every chunk times every rendition — across the worker fleet. Each task writes to a deterministic key, so a crashed worker's task is simply retried. Results are segmented into short HLS/DASH segments with a master manifest listing the renditions, and the lowest renditions are published first. A viewer's player requests the signed manifest, then fetches segments from a nearby CDN edge — or via the origin shield on a miss — choosing the next segment's quality from its measured throughput and buffer.
```

```bug
style: critique
title: A candidate's video platform
prompt: The candidate describes upload and playback for a YouTube-style service. Which claims would you push back on?
lang: text
code: |
  Clients upload directly to object storage with presigned, resumable multipart uploads.
  The API server streams each upload through itself so it can validate the bytes.
  Transcoding splits the video into segments processed in parallel, each retry-safe.
  Playback uses HLS/DASH with several renditions so the player adapts to bandwidth.
  Popular videos are served from a CDN; the long tail can come from origin storage.
  The view count is a single row incremented on every play.
bug: [2, 6]
explain: |
  **Line 2:** streaming multi-gigabyte uploads through API servers saturates their network and memory. Line 1's direct presigned upload is the right path; validate after upload with a processing job. **Line 6:** one row incremented per play is a hot spot for popular videos. Count plays as events and aggregate asynchronously into sharded counters, accepting a few seconds of lag.
```

```questions
- kind: check
  prompt: Why are videos split into short segments in multiple renditions?
  choices:
    - text: So the player can switch quality between segments as bandwidth changes, and segments cache well on CDNs
      correct: true
    - text: To reduce storage
      why: Multiple renditions increase storage.
    - text: Because browsers can't play long files
      why: They can, but without adaptation.
    - text: To make uploads faster
      why: Segmentation happens after upload.
  explanation: Adaptive bitrate streaming needs per-segment choices, and static segments are ideal for edge caching.
- kind: check
  type: numeric
  prompt: 500 hours of video are uploaded per minute. How many hours arrive per day, in thousands?
  answer: 720
  unit: thousand hours/day
  tolerance: 0.01
  explanation: 500 × 1,440 minutes = 720,000 hours per day.
- kind: check
  type: multi
  prompt: Which make the transcoding pipeline robust and fast? Select all that apply.
  choices:
    - text: Splitting videos at keyframes into chunks transcoded in parallel
      correct: true
    - text: Idempotent tasks with deterministic output keys and leases
      correct: true
    - text: Publishing low renditions before high ones
      correct: true
    - text: One long-running process per video that must succeed end to end
      why: A failure late in the job loses hours of work, and there's no parallelism.
  explanation: Small, parallel, retryable units plus progressive availability.
- kind: check
  prompt: What dominates the cost of a large video platform?
  choices:
    - text: Egress bandwidth and storage
      correct: true
    - text: Metadata database queries
      why: That's tiny by comparison.
    - text: Application server CPU
      why: App servers handle only control-plane requests.
    - text: DNS lookups
      why: Negligible.
  explanation: That's why CDN hit ratio, codecs and storage tiering are the main levers.
- kind: fire
  prompt: A creator's 4 GB upload fails at 70% on a mobile network. What should happen?
  choices:
    - text: The client resumes the multipart upload, sending only the parts not yet completed
      correct: true
    - text: Restart the upload from zero
      why: That wastes 2.8 GB and may never finish on a bad connection.
    - text: The server waits for the connection to return
      why: Mobile connections change. Resume needs independent parts.
    - text: Upload through the API servers instead
      why: That makes it worse.
  explanation: Multipart uploads are resumable by design.
- kind: fire
  prompt: Why should view counts be computed from an event stream rather than an UPDATE per request?
  choices:
    - text: Popular videos would create hot counter rows, and retries and bots would inflate counts; streams allow dedupe and filtering
      correct: true
    - text: UPDATE statements can't increment
      why: They can. Hot rows and fraud are the problem.
    - text: Streams are always exact
      why: They're eventually consistent. Correctness comes from dedupe rules.
    - text: To hide counts from creators
      why: Counts are shown, just slightly delayed.
  explanation: Aggregate asynchronously with deduplication and anti-abuse filters.
- kind: fire
  prompt: How do long-tail videos reduce storage cost?
  choices:
    - text: Lifecycle rules move them to colder storage, and rarely watched renditions are dropped or generated on demand
      correct: true
    - text: Delete them after a week
      why: Creators expect their videos to stay up.
    - text: Store them in the metadata database
      why: That's far more expensive.
    - text: Keep every rendition on the CDN forever
      why: CDNs evict unpopular content anyway.
  explanation: Popularity-aware tiering puts expensive storage only where views justify it.
- kind: fire
  level: advanced
  prompt: A famous creator's premiere will draw millions of viewers at the same minute. What prevents an origin stampede?
  choices:
    - text: Pre-warming edges with the first segments, an origin shield, and request collapsing for concurrent misses
      correct: true
    - text: Larger app servers
      why: App servers don't serve video bytes.
    - text: Lowering the segment length to 1 second
      why: That increases request counts.
    - text: Disabling adaptive bitrate
      why: Unrelated to origin load.
  explanation: Miss storms are handled in the CDN tier — pre-positioning, shielding and collapsing.
- kind: fire
  type: order
  prompt: Order the stages from upload to playback.
  items:
    - Resumable multipart upload to object storage
    - Workflow triggered — validate and split into chunks
    - Parallel transcode into renditions and segment
    - Publish manifests (low renditions first) and mark the video ready
    - Player fetches the manifest and segments from the CDN
  explanation: Bytes flow client → storage → workers → storage → CDN, and never through application servers.
```
