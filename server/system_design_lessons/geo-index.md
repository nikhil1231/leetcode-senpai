---
id: geo-index
category: specialised
skill: reads
title: Geospatial indexing and proximity search
minutes: 15
summary: '"Find drivers near me" can''t use an ordinary index — latitude and longitude are two dimensions, and nearness isn''t a range on either one. Geospatial systems map the plane onto cells (geohash, quadtrees, S2, H3) or trees of rectangles (R-trees) so a proximity query becomes a few cell lookups plus an exact distance filter. Moving objects add a second problem: millions of location updates a second.'
objectives:
  - Explain why two separate B-tree indexes on latitude and longitude perform poorly for proximity
  - Use geohashes, quadtrees, S2 or H3 cells to turn proximity into prefix or cell lookups, including the edge problem
  - Choose between cell-based indexes and R-trees (PostGIS), and adapt to uneven density
  - Design a location service for moving objects with high update rates
sources:
  - ['Uber engineering: H3 — Uber’s hexagonal hierarchical spatial index', 'https://www.uber.com/blog/h3/']
  - ['S2 Geometry library', 'http://s2geometry.io/']
  - ['Redis: Geospatial indexes', 'https://redis.io/docs/latest/develop/data-types/geospatial/']
---

> [!story] Nearby, but across the line
> A food-delivery prototype stored each restaurant's 5-character geohash and answered "restaurants near me" with `WHERE geohash = <my cell>`. Users standing on a street corner saw no restaurants at all — while a pizza place 60 metres away sat just across the cell boundary, with a completely different hash. Geohash cells are adjacent in space but not always in their strings. The fix was to search the user's cell plus its eight neighbours, then filter by true distance.

## Why lat/lng indexes struggle

With separate indexes on `lat` and `lng`, the database can find everything in a latitude band *or* a longitude band, but "near (51.50, -0.12)" is the intersection of two huge bands — scanning far more rows than it returns. A composite `(lat, lng)` index helps only along latitude. You need an index that understands two dimensions.

## Cells: turning 2D into 1D

**Geohash** recursively halves the world, alternating longitude and latitude, and encodes the path in base-32 characters. Each extra character subdivides a cell into 32 smaller ones; a shared prefix means "inside the same cell".

| Characters | Cell size (approximately, mid-latitudes) |
|---|---|
| 4 | 39 km × 20 km |
| 5 | 4.9 km × 4.9 km |
| 6 | 1.2 km × 0.6 km |
| 7 | 153 m × 153 m |
| 8 | 38 m × 19 m |

A proximity search then becomes: pick a precision whose cells are about the search radius, look up the home cell **and its 8 neighbours** (`WHERE geohash LIKE 'gcpvj%'` uses an ordinary B-tree prefix scan), and filter candidates by exact distance.

```sim
name: geohash
title: Geohash cells and their neighbours
challenges:
  - {text: 'Find the precision whose cells are roughly 1 km across (good for "within 1 km")', metric: precision, op: '==', value: 6}
takeaway: |
  Click near a cell edge and notice that points a few metres apart can have very different hashes. That's why you always query the 3×3 block of cells, then apply a true distance filter. And because the prefix is just a string, the index is an ordinary B-tree (or a Redis sorted set, which is how Redis GEO commands work).
```

Other cell systems fix geohash's quirks:

- **Quadtrees** split a cell into four only where there's lots of data, so dense city centres get small cells and empty oceans stay as one — good for skewed density.
- **S2** (Google) projects the sphere onto a cube and uses a Hilbert curve, so cells stay similar in size worldwide and nearby cells usually have nearby IDs. Used by Google Maps and many databases.
- **H3** (Uber) uses hexagons at 16 resolutions. Every neighbour of a hexagon is the same distance away, which makes rings, "k cells out" queries, and aggregating demand per area cleaner.

## R-trees and spatial databases

An **R-tree** groups nearby shapes into bounding rectangles, recursively, like a B-tree for rectangles. It handles points, lines and polygons ("which delivery zone contains this address?", "which roads intersect this area?"). PostGIS implements it with GiST indexes:

```sql
CREATE INDEX ON restaurants USING GIST (location);

-- Restaurants within 1.5 km, nearest first.
SELECT id, name, ST_Distance(location, ST_MakePoint($lng, $lat)::geography) AS metres
FROM restaurants
WHERE ST_DWithin(location, ST_MakePoint($lng, $lat)::geography, 1500)
ORDER BY location <-> ST_MakePoint($lng, $lat)::geography
LIMIT 20;
```

```sort
prompt: Which approach fits best?
buckets: [Geohash / S2 / H3 cells, R-tree (PostGIS GiST), In-memory grid of moving objects]
items:
  - {text: 'Is this address inside any of our 3,000 irregular delivery-zone polygons?', bucket: 1, why: 'Point-in-polygon over complex shapes is what R-trees and PostGIS excel at.'}
  - {text: 'Nearest 10 available drivers, whose positions change every 4 seconds', bucket: 2, why: 'Extremely high update rates suit an in-memory index keyed by cell, rebuilt continuously from location updates.'}
  - {text: 'Aggregate ride demand per neighbourhood-sized area for surge pricing', bucket: 0, why: "Bucketing events into uniform cells (H3 hexagons, in Uber's case) makes per-area aggregation simple."}
  - {text: 'Shard a global points-of-interest table so nearby places live together', bucket: 0, why: 'Cell IDs (S2 or geohash prefixes) make good, locality-preserving shard keys.'}
```

## Moving objects: the update problem

Static places change rarely. Drivers, couriers and scooters move constantly, and their locations are **ephemeral**: a position from 30 seconds ago is useless.

```calc
title: Location update rate
prompt: **800,000** drivers are online at peak, and each app sends its location every **4 seconds**. How many location updates per second must the system ingest?
answer: 200000
unit: updates/s
tolerance: 1.02
steps: |
  800,000 ÷ 4 = **200,000 updates/s**. Writing each to a disk-based database with a spatial index would be expensive and pointless — the data is overwritten seconds later. Instead, keep the latest position per driver in memory (sharded by city or cell), index it by cell for "nearby" queries, and stream positions to a log (Kafka) for durable analytics and trip records.
```

```arch
title: A location service for drivers
nodes:
  - {id: app, label: Driver app, kind: client, x: 0, y: 1}
  - {id: gw, label: Location gateway, kind: service, x: 1, y: 1}
  - {id: kafka, label: Location stream, kind: stream, x: 2, y: 2, note: 'durable, for analytics'}
  - {id: idx, label: In-memory geo index, kind: cache, x: 2, y: 0, note: 'sharded by city/cell'}
  - {id: match, label: Matching service, kind: service, x: 3, y: 0}
  - {id: rider, label: Rider app, kind: client, x: 3, y: 1}
edges:
  - [app, gw, 'every 4 s']
  - [gw, idx, 'upsert driver → cell']
  - [gw, kafka, 'append']
  - [rider, match, 'request ride']
  - [match, idx, 'drivers in cell + neighbours']
paths:
  - label: Location update
    steps:
      - [app, gw, 'The driver app sends (driver_id, lat, lng, ts) over a persistent connection']
      - [gw, idx, 'Compute the cell (H3 or geohash) and move the driver to it if the cell changed; store the latest position with a TTL so stale drivers vanish']
      - [gw, kafka, 'Also append to a log for trip history and analytics — not on the hot query path']
  - label: Find nearby drivers
    steps:
      - [rider, match, 'A rider requests a pickup at (lat, lng)']
      - [match, idx, 'Look up the rider''s cell plus a ring of neighbours, expanding rings until enough candidates are found; filter by distance, ETA and availability']
```

> [!senior] Density is never uniform
> Midtown Manhattan at 6 p.m. and rural Montana differ by orders of magnitude. Fixed-precision cells give hot shards in dense cities and nearly empty ones elsewhere. Use adaptive structures (quadtrees, or a coarser cell level in sparse areas), shard by city or region with hot cities split further, and expand search rings adaptively until enough candidates are found instead of using a fixed radius.

```predict
prompt: A "drivers near me" query searches only the geohash cell containing the rider, at precision 6 (~1.2 km × 0.6 km). The rider stands 20 m from a cell edge. What goes wrong?
choices:
  - Nothing — precision 6 cells are large enough
  - Drivers just across the edge (possibly closer than most drivers in the home cell) are missed; you must include the neighbouring cells, then filter by distance
  - The query returns drivers from the whole city
  - Geohash cells overlap, so the driver appears twice
answer: 1
reveal: |
  Cells are hard partitions. Points metres apart can fall in different cells, with different prefixes. Query the home cell plus its 8 neighbours (or an H3 ring), then sort by exact distance. Choosing a precision where one cell is at least the search radius keeps it to a 3×3 block.
```

```interview
ask: How would you design geospatial indexing and proximity search for a ride-hailing platform with static places, delivery zones and 200,000 driver-location updates per second?
say: |
  "Static places live in Postgres with PostGIS and a GiST index — ST_DWithin plus KNN ordering — and that also handles delivery-zone polygons. Moving drivers are different: 200k updates a second of ephemeral data. Each update goes to an in-memory geo index keyed by H3 cell, sharded by city, with a TTL so stale drivers drop out, and is also appended to Kafka for history. Matching looks up the rider's cell and expanding rings until it has enough candidates, then ranks by ETA. Dense cities get finer cells and more shards."
followups:
  - q: Why not geohash prefix queries for everything?
    a: They're simple and work well on ordinary indexes, but cells vary in size with latitude, neighbours can have unrelated prefixes, and polygons need R-trees. S2 and H3 give more uniform cells and better neighbour handling.
  - q: How do you handle the cell-edge problem?
    a: Always search the home cell and its neighbours (a ring), then filter by true distance. Pick a resolution whose cells are about the search radius.
  - q: Where do you store driver locations?
    a: The latest position in memory (Redis GEO or a custom grid service), sharded by region, with TTL expiry. History goes to a log or column store, not to the query index.
weak: |
  "Store lat/lng in the database with indexes and compute distances." Scans huge bands, ignores update rates and density.
strong: |
  Explains why 2D needs cells or R-trees, handles cell edges with neighbour rings and exact filtering, picks PostGIS for polygons and an in-memory cell index for moving objects, and plans for skewed density.
```

```recall
prompt: Explain how you would answer "find restaurants within 1 km of me" using geohashes, including how you avoid missing results near cell edges.
points:
  - Choose a geohash precision whose cells are about the search radius (precision 6 is about 1.2 km × 0.6 km)
  - Compute the user's cell and its 8 neighbouring cells
  - Query restaurants whose stored geohash starts with any of those 9 prefixes (prefix range scans on an ordinary index)
  - Filter the candidates by exact distance (and sort by it), because cells are squares and nearby points can fall in neighbouring cells
model: |
  Store each restaurant's geohash alongside its coordinates. For a 1 km search, pick a precision whose cells are about that size — 6 characters. Compute the user's geohash at that precision, then its eight neighbours, and fetch restaurants whose hash starts with any of those nine prefixes; each is a prefix range scan on a B-tree. Searching only the home cell would miss places a few metres away across an edge, because neighbouring cells can have very different strings. Finally compute the true distance for each candidate, drop those over 1 km, and sort by distance.
```

```questions
- kind: check
  prompt: Why are separate B-tree indexes on latitude and longitude poor for "nearby" queries?
  choices:
    - text: Each index finds a whole band of latitude or longitude, and their intersection scans far more rows than are nearby
      correct: true
    - text: B-trees can't store decimal numbers
      why: They can.
    - text: Latitude and longitude are always unindexed
      why: You can index them; it just doesn't help much.
    - text: Distance can't be computed in SQL
      why: It can. The problem is finding candidates efficiently.
  explanation: Proximity is a 2D question. Cells or R-trees index both dimensions together.
- kind: check
  prompt: What's the main pitfall of searching only the user's own geohash cell?
  choices:
    - text: Nearby points just across a cell boundary have different prefixes and are missed
      correct: true
    - text: The query is too slow
      why: It's fast — and incomplete.
    - text: Geohash cells overlap
      why: They partition space without overlap.
    - text: It returns too many results
      why: It returns too few near edges.
  explanation: Query the cell and its neighbours, then filter by exact distance.
- kind: check
  type: numeric
  prompt: 1.5 million couriers each send a location update every 5 seconds. How many updates per second is that?
  answer: 300000
  unit: updates/s
  tolerance: 0.01
  explanation: 1,500,000 ÷ 5 = 300,000/s. Keep the latest positions in memory and stream history to a log.
- kind: check
  type: multi
  prompt: Which are advantages of H3 hexagonal cells? Select all that apply.
  choices:
    - text: Every neighbour is the same distance away, which simplifies rings and k-distance queries
      correct: true
    - text: A hierarchy of resolutions for aggregating at different scales
      correct: true
    - text: Convenient for bucketing events (like ride requests) per area
      correct: true
    - text: Exact point-in-polygon tests for arbitrary shapes
      why: Polygon containment is R-tree or PostGIS territory. Cells only approximate shapes.
  explanation: Hexagons give uniform adjacency, which is useful for spatial aggregation and neighbourhood queries.
- kind: fire
  prompt: Which tool best answers "which of 3,000 irregular delivery zones contains this address?"
  choices:
    - text: A spatial database with an R-tree index (e.g. PostGIS with GiST)
      correct: true
    - text: A geohash prefix query
      why: Cells approximate polygons and need an exact containment check anyway.
    - text: A Redis sorted set
      why: Redis GEO handles points and radius queries, not polygons.
    - text: A full-text search index
      why: Text indexes don't handle geometry.
  explanation: R-trees index arbitrary shapes by bounding rectangles and support exact containment and intersection queries.
- kind: fire
  prompt: Why shouldn't driver locations (updated every few seconds) be written to the same disk-based spatial table used for restaurants?
  choices:
    - text: The update rate is enormous and each value is obsolete within seconds, so an in-memory index with TTLs fits far better
      correct: true
    - text: Disk-based databases can't store coordinates
      why: They can.
    - text: Drivers don't need indexing
      why: They do, for nearby queries — but in memory.
    - text: PostGIS doesn't support updates
      why: It supports them, but not at this rate economically.
  explanation: Match the store to the data's lifecycle — ephemeral, high-churn positions belong in memory, with history streamed elsewhere.
- kind: fire
  prompt: Fixed-precision cells cause some shards to be overloaded in dense city centres. What helps?
  choices:
    - text: Adaptive cells (quadtrees or finer levels where dense) and sharding hot cities further
      correct: true
    - text: Larger cells everywhere
      why: That makes the dense cells even denser.
    - text: Removing the geo index
      why: Then every query scans everything.
    - text: Querying fewer neighbours
      why: That misses results without fixing the load.
  explanation: Density varies by orders of magnitude, so spatial partitioning has to adapt to it.
- kind: fire
  level: advanced
  prompt: A matching service needs at least 10 candidate drivers, but density varies hugely. What search strategy works best?
  choices:
    - text: Search the rider's cell, then expand to neighbouring rings until enough candidates are found or a maximum radius is hit
      correct: true
    - text: Always search a fixed 500 m radius
      why: In rural areas that finds no one; in a city centre it returns far too many.
    - text: Search the whole city every time
      why: That's expensive and slow at scale.
    - text: Pick 10 random drivers
      why: They might be miles away.
  explanation: Expanding rings adapt to density automatically, using cheap cell lookups.
- kind: fire
  type: multi
  prompt: Which statements about geohash are true? Select all that apply.
  choices:
    - text: Longer geohashes represent smaller cells
      correct: true
    - text: Points sharing a prefix lie in the same cell at that precision
      correct: true
    - text: Prefix queries can use an ordinary B-tree index
      correct: true
    - text: Physically adjacent points always share a long prefix
      why: Points across a cell boundary can have very different hashes.
  explanation: Geohash turns 2D cells into sortable strings. The edge discontinuities are why neighbour searches are required.
```
