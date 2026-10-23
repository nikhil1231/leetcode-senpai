---
id: http-cdn
category: caching
skill: reads
title: HTTP caching and CDNs
minutes: 16
summary: HTTP caching is a contract written in response headers, honoured by browsers, proxies and CDNs you don't control. Get the headers and cache keys right and a CDN serves most of your traffic from a few milliseconds away; get them wrong and it serves one user's account page to another.
objectives:
  - Choose Cache-Control directives for static assets, HTML, public API responses and private data
  - Explain freshness versus revalidation, and how ETag / If-None-Match produces a 304
  - Design cache keys and Vary so variants are correct without destroying the hit ratio
  - Describe CDN tiers, request collapsing, purging by tag, and how private content is served from the edge
sources:
  - ['MDN: HTTP caching', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching']
  - ['RFC 9111: HTTP Caching', 'https://www.rfc-editor.org/rfc/rfc9111']
  - ['MDN: Cache-Control', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control']
case: links
---

> [!story] Christmas Day, 2015
> During a traffic surge, Steam changed its CDN caching configuration. For about an hour, store pages that included account details — names, addresses, partial card numbers, purchase history — were cached at the edge and served to whoever requested the same URL next. Roughly 34,000 users were affected. The pages were personalised, but nothing in the response told shared caches that. The CDN did exactly what it was told.

## Two questions every cache asks

For each response, any cache (browser, corporate proxy, CDN edge) needs answers to:

1. **May I store this, and may I share it between users?** (`no-store`, `private`, `public`)
2. **For how long can I serve it without asking the origin?** (`max-age`, `s-maxage`) — and after that, **how do I check it's still good?** (validators: `ETag`, `Last-Modified`)

A response that's within its freshness lifetime is served straight from the cache. Once stale, a cache *revalidates*: it asks the origin "has this changed?" and gets either a cheap **304 Not Modified** (keep using your copy) or a full **200** with new content.

```order
prompt: Put a conditional revalidation in order. The browser already has a copy of `/api/catalog` with `ETag: "v42"` and `Cache-Control: max-age=60`.
items:
  - The cached copy's 60 seconds of freshness run out
  - The browser sends GET /api/catalog with If-None-Match "v42"
  - The origin compares "v42" with the current representation's ETag
  - The origin replies 304 Not Modified with no body
  - The browser serves its stored copy and resets its freshness to another 60 seconds
explain: Revalidation still costs a round trip, but no body is transferred and the origin may avoid rendering the response. For large or expensive responses that saves both bandwidth and CPU.
```

## The directives you actually use

| Directive | What it means | Typical use |
|---|---|---|
| `max-age=N` | Fresh for N seconds, for any cache | Assets, public API responses |
| `s-maxage=N` | Overrides `max-age` for **shared** caches (CDNs, proxies) only | Short browser TTL, longer edge TTL you can purge |
| `public` | Shared caches may store it, even if the request had `Authorization` | Explicitly public content |
| `private` | Only the end user's browser may store it | Personalised pages, account data |
| `no-cache` | **May** be stored, but must be revalidated before every use | HTML that should always be current but benefit from 304s |
| `no-store` | Must not be stored anywhere | Secrets, banking pages, one-time tokens |
| `immutable` | Will never change during its freshness life; don't revalidate even on reload | Content-hashed assets |
| `stale-while-revalidate=N` | After expiry, serve stale for up to N s while refreshing in the background | Keep latency flat during refreshes |
| `stale-if-error=N` | Serve stale for up to N s if the origin errors | Resilience during origin outages |

> [!mistake] `no-cache` does not mean "don't cache"
> It means "store it, but check with the origin before using it". The directive that forbids storage is `no-store`. Mixing them up is the most common HTTP caching bug — in one direction you leak, in the other you lose all your 304s.

```predict
prompt: A response for `/settings` (personalised to the logged-in user) carries `Cache-Control: no-cache` and nothing else. A shared corporate proxy sits between users and your site. What can happen?
choices:
  - Nothing is stored anywhere, so it's safe
  - The proxy may store the response, but must revalidate it with the origin before serving it to anyone
  - The proxy will serve it to other users for up to 60 seconds
  - The browser refuses to render the page
answer: 1
reveal: |
  `no-cache` permits storage and requires revalidation. A correctly behaving proxy revalidates, and your origin decides per request — but you're relying on every intermediary behaving and on your origin varying the response per user during revalidation. For personalised data say what you mean: `Cache-Control: private` (only the browser), or `no-store` if it shouldn't be kept at all.
```

```sort
prompt: Pick the best header for each response.
buckets: ['public, max-age=31536000, immutable', 'no-cache (with an ETag)', 'private, max-age=60', 'no-store', 's-maxage=30, stale-while-revalidate=60']
items:
  - {text: '/static/app.3f9a1c.js — filename contains a content hash', bucket: 0, why: 'A new build gets a new filename, so this exact URL can never change. Cache forever, never revalidate.'}
  - {text: '/index.html — references the latest hashed bundles', bucket: 1, why: 'HTML must point at the current asset names, so revalidate every time; the ETag makes most checks a cheap 304.'}
  - {text: "/api/me — the signed-in user's profile", bucket: 2, why: 'Personal, so only the browser may store it; a short max-age saves repeat requests within a page session.'}
  - {text: '/api/payment-methods/reveal — returns a full card number', bucket: 3, why: 'Sensitive and single-use: nothing should keep a copy, including the browser disk cache.'}
  - {text: '/api/trending — same for everyone, refreshed every few seconds', bucket: 4, why: 'Public and hot: a short edge TTL plus stale-while-revalidate lets the CDN absorb the traffic with steady latency.'}
```

## Cache keys and `Vary`

A cache stores responses under a **cache key**, by default roughly *method + host + path + query string*. If anything else changes the response, the cache must know, or it will serve the wrong variant.

`Vary` tells caches which request headers are part of the key: `Vary: Accept-Encoding` keeps gzip and brotli versions apart. `Vary: Accept-Language` keeps translations apart.

> [!mistake] `Vary: Cookie`
> Every user has a different cookie string, so every user gets their own cache entry — the hit ratio collapses to roughly zero. If a response depends on one cookie value (say, `currency=EUR`), have the CDN **normalise** the key to just that value (most CDNs let you build a custom key), or move the variant into the URL.

Normalising keys raises hit ratio: strip tracking parameters (`utm_*`, `fbclid`), sort query parameters, and lowercase the host. A CDN that treats `?a=1&b=2` and `?b=2&a=1` as different objects stores two copies.

```bug
title: Review these response headers
prompt: This is the response for a logged-in user's dashboard, served through a CDN. Which lines cause a data leak or a broken cache?
lang: http
code: |
  HTTP/1.1 200 OK
  Content-Type: text/html; charset=utf-8
  Cache-Control: public, max-age=600
  Set-Cookie: session=8f2c...; HttpOnly; Secure
  Vary: Cookie
  ETag: "dash-91ab"
bug: [3, 5]
explain: |
  **Line 3** tells every shared cache it may store this *personalised* page for 10 minutes and serve it to anyone requesting the same URL — the Steam incident. **Line 5** (`Vary: Cookie`) is the usual "fix", but it gives every user a separate entry and destroys the hit ratio, and some CDNs ignore `Vary` on cookies entirely. A personalised page should be `private` (or `no-store`), and the cacheable parts should be split into separate public responses. (Many CDNs also refuse to cache responses that set cookies — don't rely on it.)
fix: |
  HTTP/1.1 200 OK
  Content-Type: text/html; charset=utf-8
  Cache-Control: private, no-cache
  Set-Cookie: session=8f2c...; HttpOnly; Secure
  ETag: "dash-91ab"
```

## Versioned assets: the release pattern

The cleanest way to get both "cache forever" and "users see the new release immediately":

1. Build assets with a **content hash in the filename**: `app.3f9a1c.js`. Serve them `public, max-age=31536000, immutable`.
2. Serve the HTML that references them with `no-cache` (and an ETag) or a very short max-age.
3. A deploy produces new filenames. The HTML revalidates, sees new references, and the browser fetches only the files that changed. Old files keep working for anyone mid-session.

Never "purge and hope" for assets: browsers you can't purge will keep old copies for their full max-age.

## How a CDN serves a request

```arch
title: Edge, shield and origin
nodes:
  - {id: user, label: User, kind: client, x: 0, y: 1}
  - {id: edge, label: Edge PoP, kind: cdn, x: 1, y: 1, note: '300+ cities'}
  - {id: shield, label: Origin shield, kind: cdn, x: 2, y: 1, note: 'one regional tier'}
  - {id: origin, label: Origin, kind: service, x: 3, y: 1, note: 'your servers'}
  - {id: store, label: Object storage, kind: storage, x: 3, y: 2}
edges:
  - [user, edge, 'TLS ~10 ms']
  - [edge, shield, 'miss']
  - [shield, origin, 'miss']
  - [origin, store, '']
paths:
  - label: Edge hit
    steps:
      - [user, edge, 'TLS terminates at a nearby PoP; the object is in the edge cache. ~10–30 ms total.']
  - label: Edge miss, shield hit
    steps:
      - [user, edge, 'The edge PoP does not have it (long tail, or recently purged).']
      - [edge, shield, 'The edge asks the shield instead of the origin. The shield is shared by all edges in a region, so it is far more likely to have the object.']
  - label: Full miss
    steps:
      - [user, edge, 'Edge miss']
      - [edge, shield, 'Shield miss — and 500 other edge requests for the same URL are collapsed into this one fetch']
      - [shield, origin, 'One request to the origin']
      - [origin, store, 'Origin reads the object; the response flows back and is cached at shield and edge']
```

Three CDN features matter in design discussions:

- **Tiered caching / origin shield.** Edges miss into a regional tier, not your origin. Without it, a purge or a new popular file triggers one origin fetch per PoP — hundreds at once.
- **Request collapsing.** Concurrent misses for the same object at a node are merged into a single upstream fetch. This is stampede protection you get for free — but only for cacheable responses.
- **Purge by tag (surrogate keys).** Tag responses (`Surrogate-Key: product-42 category-7`) and purge everything with a tag in one call, typically propagating in seconds. Far more precise than purging by URL or wildcards.

> [!numbers] Offload is the real win
> A 95% CDN hit ratio means your origin serves **1 in 20** requests. For a site pushing 20 Gbps of images and video, that's the difference between 20 Gbps and 1 Gbps of origin egress — usually the largest line on the bandwidth bill.

```calc
title: Origin bandwidth after the CDN
prompt: A photo service serves **12 Gbps** of image traffic at peak. With a CDN in front, the byte hit ratio is **96%**. How much bandwidth must the origin (object storage + image servers) serve, in **Mbps**?
answer: 480
unit: Mbps
tolerance: 1.05
steps: |
  Origin bytes = total × (1 − byte hit ratio) = 12,000 Mbps × 0.04 = **480 Mbps**. Note that *byte* hit ratio can differ a lot from *request* hit ratio: a few large, unpopular videos can have a low hit ratio and dominate origin bytes even when 99% of small requests hit.
```

## Dynamic and private content at the edge

CDNs aren't only for static files.

- **Micro-caching:** caching a hot, public API response for even 1–5 seconds (`s-maxage=2`) turns 10,000 requests/s on one URL into ~1 origin request every 2 s per tier, with request collapsing absorbing the rest.
- **stale-while-revalidate** keeps latency flat: users get the stale copy instantly while the edge refreshes it.
- **stale-if-error** keeps serving the last good copy for minutes if the origin is down — often the cheapest availability improvement you can make.
- **Private content** (paid videos, user uploads) is served from the edge with **signed URLs or signed cookies**: the origin authorises the user and issues a short-lived signature; the edge verifies the signature without calling the origin. Issuing the signature *is* the authorisation decision.

```faded
title: Header choices for a news site
prompt: Complete the caching plan.
text: |
  Article pages are the same for every anonymous reader and change rarely after publishing, but corrections must appear within a minute. We serve them with `Cache-Control: public, max-age=60, s-maxage=[[86400|60|0]]` and purge the article's tag on every edit, so the CDN can hold them for a day while browsers recheck every minute.

  The comment count widget is fetched by JavaScript from `/api/articles/42/comments/count`. It's public and hot, so we use a short edge TTL plus [[stale-while-revalidate|no-store|private]] so readers never wait on a refresh.

  Logged-in readers see a personalised header. Rather than make the whole page `private`, we load the header separately from `/api/me` with `Cache-Control: [[private, max-age=30|public, max-age=30|immutable]]`, keeping the article itself cacheable for everyone.

  Images are uploaded once and never edited; a new image gets a new URL. They get `max-age=31536000, [[immutable|no-cache|must-revalidate]]`.
explain: The recurring move is **separating the personal from the public** so the public part can be cached aggressively — and using purge (by tag) rather than short TTLs to make edits visible quickly.
```

```interview
say: |
  "Static assets get content-hashed names and `immutable` year-long caching; HTML is `no-cache` with ETags so deploys show up immediately and checks are cheap 304s. Public API responses that are hot get short `s-maxage` with `stale-while-revalidate`, so the CDN absorbs load with request collapsing. Anything personalised is `private` or loaded separately, so it never sits in a shared cache. Edits purge by surrogate key, and private media goes through the edge with short-lived signed URLs. With a ~95% hit ratio the origin sees a twentieth of the traffic."
followups:
  - q: What's the difference between no-cache and no-store?
    a: no-cache allows storing but requires revalidation before each use; no-store forbids storing anywhere. Use no-store for sensitive data, no-cache for content that must be current but benefits from 304s.
  - q: How do you make a change visible quickly if the CDN TTL is a day?
    a: Purge — ideally by surrogate key/tag so one call invalidates every URL that embeds the object — and keep browser max-age short via a separate s-maxage. For assets, change the URL instead.
  - q: How do you serve paid video from a CDN without making it public?
    a: The origin authenticates the user and issues a short-lived signed URL or cookie scoped to that content; the edge validates the signature locally. Keep expiry short, and treat signing as the authorisation check.
  - q: Why might your origin still get hammered with a 99% request hit ratio?
    a: Byte hit ratio may be much lower (large long-tail objects), a purge or deploy can cause a synchronised miss wave without tiered caching, uncacheable responses (cookies, Vary) bypass the cache, and request collapsing only works for cacheable objects.
weak: |
  "Put everything behind a CDN and set a long TTL." — No distinction between personal and public, no release story, no invalidation, and a real risk of leaking data.
strong: |
  Separates asset, HTML, public API and private responses with specific directives; explains purge-by-tag and versioned URLs; mentions shield/collapsing for miss storms; serves private media with signed URLs; quantifies offload.
```

```recall
prompt: Explain how content-hashed asset filenames let you cache JavaScript "forever" while users still get new releases immediately.
points:
  - Each build names files by a hash of their contents, so changed content gets a new URL
  - Those URLs can be cached with a very long max-age (and immutable) because the bytes at that URL never change
  - The HTML that references the assets is revalidated on every load (no-cache or very short TTL)
  - After a deploy the revalidated HTML points at the new filenames, so browsers fetch only changed files and old URLs keep working
model: |
  The build gives every asset a filename containing a hash of its contents — `app.3f9a1c.js`. A URL therefore always maps to exactly the same bytes, so we can serve it with `max-age=31536000, immutable` and never revalidate. The HTML page that references those files is served `no-cache` with an ETag, so each load checks it. After a deploy the HTML has new filenames, the browser fetches just the assets that changed, and anyone mid-session can still load the old files because their URLs haven't gone anywhere.
```

```questions
- kind: check
  prompt: What does `Cache-Control: no-cache` instruct a cache to do?
  choices:
    - text: It may store the response but must revalidate with the origin before each use
      correct: true
    - text: It must never store the response
      why: That's `no-store`. `no-cache` allows storage and requires revalidation.
    - text: Only the browser may store it, not shared caches
      why: That's `private`.
    - text: Serve it for up to 60 seconds, then fetch a new copy
      why: `no-cache` sets no freshness lifetime. Each use requires revalidation.
  explanation: "`no-cache` = store, but always check first (an ETag makes the check cheap). `no-store` = keep no copy at all. `private` = only the end user's cache."
- kind: check
  type: multi
  prompt: A logged-in user's dashboard is served through a CDN. Which header choices are safe for it? Select all that apply.
  choices:
    - text: "`Cache-Control: private, no-cache`"
      correct: true
    - text: "`Cache-Control: no-store`"
      correct: true
    - text: "`Cache-Control: public, max-age=600`"
      why: That allows shared caches to serve one user's dashboard to others for 10 minutes.
    - text: "`Cache-Control: s-maxage=60` with `Vary: Cookie`"
      why: It tells the CDN to store personalised pages, and relies on every intermediary honouring Vary on cookies. It's fragile, and it ruins the hit ratio even when it works.
  explanation: Personalised responses must never be stored in shared caches. `private` limits storage to the browser; `no-store` forbids it entirely. Cacheable public parts should be split out into separate responses.
- kind: check
  type: order
  prompt: Order the steps of a revalidation that ends in a 304.
  items:
    - The cached response's freshness lifetime expires
    - The client sends the request with If-None-Match set to the stored ETag
    - The origin sees the ETag still matches the current representation
    - The origin returns 304 Not Modified with no body
    - The client reuses its stored body and refreshes its freshness lifetime
  explanation: A validator turns "fetch it again" into "confirm it's unchanged". The round trip remains, but the body and often the server-side rendering are saved.
- kind: check
  type: numeric
  prompt: A video platform serves 40 Gbps at peak with an 85% byte hit ratio at the CDN. How much egress (in Gbps) does the origin serve?
  answer: 6
  unit: Gbps
  tolerance: 0.05
  explanation: 40 × (1 − 0.85) = 6 Gbps. Raising the byte hit ratio to 95% would cut that to 2 Gbps — this is why long-tail video often goes through an origin shield or a tiered cache.
- kind: fire
  prompt: Why is `Vary: Cookie` usually a bad way to cache pages that differ by currency?
  choices:
    - text: Every visitor's cookie string is unique, so each gets a separate cache entry and the hit ratio collapses
      correct: true
    - text: Browsers ignore Vary
      why: Browsers respect Vary. The problem is how fragmented the cache keys become in shared caches.
    - text: Cookies can't be sent to CDNs
      why: Cookies reach CDNs fine. That's exactly why the key gets fragmented.
    - text: Vary only works for compression headers
      why: Vary works with any request header. Cookie is just a terrible one to vary on.
  explanation: Vary on the whole Cookie header fragments the cache per user. Normalise the key to the one value that matters (e.g. currency) in the CDN, or put the variant in the URL.
- kind: fire
  prompt: A popular new file is published and requested from 300 edge locations at once. Which CDN feature prevents 300 simultaneous fetches from the origin?
  choices:
    - text: Tiered caching (an origin shield), combined with request collapsing
      correct: true
    - text: A longer max-age on the file
      why: Max-age doesn't matter before the first fetch. Every edge still misses once.
    - text: The immutable directive
      why: Immutable prevents revalidation of copies already held. It doesn't coordinate first fetches.
    - text: Signed URLs
      why: Signed URLs control access, not miss storms.
  explanation: Edges miss into a shared regional shield, which collapses concurrent misses into one origin request. Without a shield, each PoP fetches from the origin independently.
- kind: fire
  prompt: Corrections to news articles must appear within a minute, but you'd like the CDN to hold articles for a day. What's the cleanest approach?
  choices:
    - text: Long s-maxage at the edge, short max-age for browsers, and a purge by the article's surrogate key on every edit
      correct: true
    - text: Set max-age=60 everywhere
      why: That works but throws away most of the edge offload for content that rarely changes.
    - text: Use no-store so there is nothing to correct
      why: That makes every view hit the origin.
    - text: Change the article's URL on every correction
      why: That breaks links, search ranking and shares. Content-addressed URLs suit assets, not canonical pages.
  explanation: s-maxage lets shared caches hold content longer than browsers. A tag purge makes edits visible within seconds without shortening the TTL.
- kind: fire
  level: advanced
  prompt: Paid course videos must be served from the CDN, but only to enrolled users. How does that usually work?
  choices:
    - text: The origin checks enrolment and issues a short-lived signed URL or cookie; the edge verifies the signature without calling the origin
      correct: true
    - text: Make the video URLs long and random so they can't be guessed
      why: Unguessable URLs leak through sharing, logs and referrers, and they can't be revoked. Obscurity isn't authorisation.
    - text: Use Cache-Control private so the CDN won't serve them to others
      why: Then the CDN can't cache them at all, which defeats the point.
    - text: Have the edge call the origin to check enrolment on every video segment request
      why: That puts the origin back on the hot path for every segment.
  explanation: Signing moves the authorisation decision to the moment the URL is issued, and the edge validates it cryptographically. Keep lifetimes short and scope signatures to the specific content.
- kind: fire
  type: multi
  prompt: Which changes typically increase a CDN's hit ratio without serving incorrect content? Select all that apply.
  choices:
    - text: Strip tracking parameters such as utm_* from the cache key
      correct: true
    - text: Sort query parameters so equivalent URLs share one key
      correct: true
    - text: Add stale-while-revalidate so expired objects are served during refresh
      correct: true
    - text: Cache personalised pages publicly for a short time
      why: That serves one user's data to another. A short TTL just limits how long it happens for.
    - text: Add Vary on User-Agent
      why: That creates thousands of variants and lowers the hit ratio.
  explanation: Normalising the key merges equivalent requests, and stale-while-revalidate avoids misses during refreshes. Varying on high-cardinality headers fragments the cache; caching private data publicly leaks it.
```
