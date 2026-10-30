---
id: numbers
category: foundations
skill: capacity
title: Numbers to know
minutes: 18
reference: true
summary: Every estimate in an interview rests on a few dozen constants — seconds in a day, powers of two, the latency ladder from memory to a cross-world round trip, what one machine can do, what each nine of availability allows, and the token, cost and GPU numbers behind LLM systems. Know them to an order of magnitude, without stopping to look them up, so the conversation stays on the design.
objectives:
  - Convert per-day, per-month and per-year totals to per-second rates in your head
  - Place memory, SSD, disk and network latencies on the right order of magnitude
  - Recall rough per-node capacity for app servers, caches, databases, brokers and NICs
  - Translate nines of availability into downtime, and compose availability across dependencies
  - Apply the rules of thumb (peak factor, Little's Law, N × p, utilisation headroom) without a calculator
  - Estimate LLM cost, latency, memory and retrieval sizes from tokens, parameters and bandwidth
sources:
  - ['Jeff Dean: Numbers everyone should know (via Google talk)', 'https://static.googleusercontent.com/media/research.google.com/en//people/jeff/stanford-295-talk.pdf']
  - ['Colin Scott: Latency numbers every programmer should know (interactive)', 'https://colin-scott.github.io/personal_website/research/interactive_latency.html']
  - ['Google SRE Book: Availability table', 'https://sre.google/sre-book/availability-table/']
  - ['Nielsen Norman Group: Response times, the three important limits', 'https://www.nngroup.com/articles/response-times-3-important-limits/']
---

This is the reference sheet. Interviewers want orders of magnitude: 1 ms versus 10 ms is the skill, 1.0 versus 1.3 ms is not. Read it once, then use **Practise topic** to drill it until every answer is instant.

### Time

> [!numbers] The three conversions
> 1 day = **86,400 s ≈ 10⁵ s**. 1 month ≈ **2.6 million s** (2.5 × 10⁶). 1 year ≈ **31.5 million s ≈ 3 × 10⁷ s**.

| Per day | Average per second |
|---|---|
| 1 million | ~12 |
| 10 million | ~120 |
| 100 million | ~1,200 |
| 1 billion | ~12,000 |

Dividing by 10⁵ instead of 86,400 is about 15% low, which never changes a design decision. 1 million per **month** is only ~0.4/s.

### Sizes

| Power of two | Roughly | Unit |
|---|---|---|
| 2¹⁰ | 1 thousand | KB |
| 2²⁰ | 1 million | MB |
| 2³⁰ | 1 billion | GB |
| 2⁴⁰ | 1 trillion | TB |
| 2⁵⁰ | 1 quadrillion | PB |

Also worth knowing: 2¹⁶ = 65,536; 2³¹ ≈ 2.1 billion (largest signed 32-bit integer); 2³² ≈ 4.3 billion; 2⁶⁴ ≈ 1.8 × 10¹⁹.

> [!numbers] Bits and bytes
> 1 byte = 8 bits, and network speeds are in **bits**. 1 Gbps ≈ **125 MB/s**; 10 Gbps ≈ **1.25 GB/s**.

| Thing | Typical size |
|---|---|
| 64-bit integer or timestamp | 8 bytes |
| UUID | 16 bytes binary (36 characters as text) |
| A short text record with metadata (a tweet, a chat message) | ~1 KB |
| A compressed photo | ~200 KB–2 MB |
| An hour of 1080p video at streaming quality (~5 Mbps) | ~2 GB |

### Latency

| Operation | Latency |
|---|---|
| L1 cache reference | ~1 ns |
| Main memory reference | ~100 ns |
| Read 1 MB sequentially from memory | ~10 µs |
| Random read from an NVMe SSD | ~20–100 µs |
| Read 1 MB sequentially from SSD | ~0.3–1 ms |
| Round trip within a datacentre | ~0.5 ms |
| Round trip between availability zones in a region | ~1–2 ms |
| Disk seek on a spinning HDD | ~5–10 ms |
| Round trip, US east ↔ west | ~60–70 ms |
| Round trip, New York ↔ London | ~70–80 ms |
| Round trip, Europe ↔ Australia | ~250–300 ms |

> [!numbers] The ratios to remember
> Memory is about **1,000×** faster than a random SSD read, and an SSD read is about **100×** faster than an HDD seek. Light in fibre covers about **200 km per ms**, so every 100 km of distance adds about **1 ms of round trip**. A new HTTPS connection (TCP + TLS 1.3) costs **2 round trips** before the request is even sent.

> [!numbers] What users notice
> Under **100 ms** feels instant. Under **1 s** keeps the user's flow. Past **10 s** you lose their attention.

```faded
title: The latency ladder
prompt: Fill each gap from memory.
text: |
  A main memory reference takes about [[100 ns|1 ns|10 µs]]. A random NVMe SSD read takes about [[20–100 µs|100 ns|5–10 ms]], roughly [[1,000×|10×|1,000,000×]] slower.

  A round trip inside a datacentre is about [[0.5 ms|5 µs|50 ms]], between availability zones about [[1–2 ms|10 µs|50 ms]], and between New York and London about [[70–80 ms|7 ms|700 ms]].

  Light in fibre covers about [[#200]] km per millisecond, so 100 km of distance adds about [[#1]] ms of round trip.
explain: Each rung is one to three orders of magnitude. Getting the order of magnitude right is what an interviewer is checking.
```

### What one machine can do

| Component | Rough capacity (one node) |
|---|---|
| Stateless app server | 1k–10k simple requests/s |
| Redis or Memcached | ~100k operations/s |
| Relational database primary | ~5k–20k simple writes/s; more reads |
| Single relational database, comfortable size | up to a few TB |
| Kafka broker | 100s of MB/s |
| NVMe SSD | 100k+ random IOPS; 1–3 GB/s sequential |
| Spinning HDD | ~100–200 random IOPS; 100–200 MB/s sequential |
| Real-time gateway | ~100k–1M mostly idle connections, limited by memory |

These are starting points to say out loud with "roughly", not benchmarks.

### Availability

| Availability | Downtime per year | Downtime per 30 days |
|---|---|---|
| 99% | ~3.7 days | ~7.2 hours |
| 99.9% | ~8.8 hours | ~43 minutes |
| 99.99% | ~53 minutes | ~4.3 minutes |
| 99.999% | ~5 minutes | ~26 seconds |

Each extra nine is 10× less downtime. **Required dependencies multiply**: five services at 99.9% give about 99.5% (add the failure rates: 5 × 0.1%). **Independent redundant copies multiply the failures**: two 99% replicas, either of which will do, give 1 − 0.01² = 99.99%.

```faded
title: Say it without a calculator
prompt: Fill each gap from memory.
text: |
  50 million requests a day is about 50M ÷ 10⁵ = [[#500]] per second on average, and about [[#1500]] per second at a 3× peak.

  A 99.9% SLO over 30 days allows about [[#43]] minutes of downtime.

  A page that fans out to 20 calls, each slow 1% of the time, has about N × p = [[#20]]% of loads that hit at least one slow call.

  At 2,000 requests/s with 50 ms in the service, Little's Law says about [[#100]] requests are in flight.
explain: The 10⁵ shortcut gives 500/s (exactly, 579/s). The fan-out estimate N × p slightly overestimates (exactly, 1 − 0.99²⁰ ≈ 18%) but is fine while N × p is well below 1. Little's Law is rate × time: 2,000 × 0.05 = 100.
```

### Rules of thumb

| Rule | Value |
|---|---|
| Peak traffic | ~2–3× the daily average (spiky products up to 10×) |
| Read:write ratio for content and social products | ~10:1 to 100:1 |
| Hot set | ~20% of items get ~80% of requests, so caching the hot set covers most reads |
| Little's Law | requests in flight = arrival rate × time in system |
| Fan-out | P(at least one of N calls is slow) ≈ N × p while that stays well below 1 |
| Utilisation target | ~60–70% at peak; queueing delay grows like ρ/(1−ρ), so at 90% waits are ~9× the service time |
| Replication | 3 copies is the usual default; indexes add 20–100% to storage |

### AI and LLM systems

These move faster than anything above, so quote them as "roughly, as of now". The shapes (output costs more than input, decode is memory-bound, KV cache grows with context) are stable.

> [!numbers] Tokens
> 1 token ≈ **4 characters ≈ 0.75 English words**, so 1,000 tokens ≈ 750 words, about a page and a half. Code and non-English text take more tokens per character.

| API economics | Rough value |
|---|---|
| Output token price vs input | ~4–8× (5× for Claude) |
| Prompt-cache **read** vs normal input | ~0.1× (a 90% discount) |
| Prompt-cache **write** vs normal input | ~1.25× for the default ~5-minute lifetime; more for a 1-hour cache |
| What gets cached | The input **prefix** only; any change early in the prompt invalidates everything after it. Output is never cached |
| Batch API | ~50% off, results within 24 hours |
| Context window, current frontier models | ~200k–1M tokens |

| API latency | Rough value |
|---|---|
| Time to first token, short prompt | ~0.3–1 s (longer with long prompts or thinking) |
| Output speed per stream | ~50–150 tokens/s for frontier models; small models faster |
| A 500-token answer | ~5 s to stream in full |
| Input vs output processing | Input (prefill) is processed in parallel, thousands of tokens/s; output (decode) comes one token at a time |

| Model memory and compute | Rough value |
|---|---|
| Weights | params × bytes per param: FP16/BF16 = 2, INT8 = 1, INT4 = 0.5. So 7B ≈ 14 GB and 70B ≈ 140 GB in FP16 |
| Training memory (mixed precision + Adam) | ~16 bytes per param before activations, so 7B ≈ 110 GB |
| KV cache | ~0.1–0.3 MB per token for 8B–70B open models in FP16, so a 100k-token context can take 10–30 GB |
| Inference compute | ~2 × params FLOPs per generated token |
| Training compute | ~6 × params × training tokens; compute-optimal is ~20 tokens per param |
| Single-stream decode ceiling | memory bandwidth ÷ weight bytes, e.g. 3.35 TB/s ÷ 16 GB ≈ 200 tokens/s for an 8B FP16 model on an H100. Batching shares each weight read across many requests |

| Hardware | Rough value |
|---|---|
| H100 | 80 GB HBM, ~3.35 TB/s, ~1,000 dense BF16 TFLOPS |
| H200 / B200 | ~141 GB at ~4.8 TB/s / ~180 GB at ~8 TB/s |
| Consumer GPUs | 8–32 GB (an RTX 4090 has 24 GB) |
| NVLink (H100) vs PCIe 5 x16 | ~900 GB/s vs ~64 GB/s per direction |

| Retrieval | Rough value |
|---|---|
| Embedding size | 768–3,072 dimensions; 1,536 × float32 ≈ 6 KB per vector |
| Index size | 1M vectors at 6 KB ≈ 6 GB; 100M ≈ 600 GB before index overhead (int8 quantisation cuts it 4×) |
| Approximate nearest-neighbour search (HNSW) | ~1–10 ms at ~95–99% recall |

```questions
- kind: check
  prompt: About how many seconds are in a day?
  choices:
    - text: 86,400 (about 10⁵)
      correct: true
    - text: 8,640 (about 10⁴)
      why: That's a tenth of a day. 24 × 3,600 = 86,400.
    - text: 864,000 (about 10⁶)
      why: That's ten days.
    - text: 3,600
      why: That's one hour.
  explanation: 24 × 60 × 60 = 86,400 ≈ 10⁵. Dividing a daily total by 10⁵ gives its average per-second rate.
- kind: check
  type: order
  prompt: Order these from fastest to slowest.
  items:
    - L1 cache reference
    - Main memory reference
    - Random read from an NVMe SSD
    - Round trip within a datacentre
    - Disk seek on a spinning HDD
    - Round trip, US east ↔ west
  explanation: ~1 ns, ~100 ns, ~20–100 µs, ~0.5 ms, ~5–10 ms, ~60–70 ms. Each step is roughly one to three orders of magnitude.
- kind: check
  prompt: An SLO of 99.9% over 30 days allows about how much downtime?
  choices:
    - text: About 43 minutes
      correct: true
    - text: About 4 minutes
      why: That's 99.99%.
    - text: About 7 hours
      why: That's 99%.
    - text: About 26 seconds
      why: That's 99.999%.
  explanation: 30 days × 1,440 minutes × 0.001 ≈ 43 minutes. Each extra nine divides it by 10.
- kind: check
  prompt: A link runs at 1 Gbps. About how many megabytes per second is that?
  choices:
    - text: About 125 MB/s
      correct: true
    - text: About 1,000 MB/s
      why: Network speeds are in bits. Divide by 8 for bytes.
    - text: About 12.5 MB/s
      why: That's 100 Mbps.
    - text: About 8 MB/s
      why: That divides 1 Gbps by 125 instead of by 8.
  explanation: 1,000 Mb/s ÷ 8 = 125 MB/s. 10 Gbps is about 1.25 GB/s.
- kind: check
  prompt: A service handles 10 million requests a day. What's the average rate?
  choices:
    - text: About 120 per second
      correct: true
    - text: About 12 per second
      why: That's 1 million a day.
    - text: About 1,200 per second
      why: That's 100 million a day.
    - text: About 10,000 per second
      why: That treats the daily total as if a day were 1,000 seconds.
  explanation: 10M ÷ 10⁵ = 100/s with the shortcut; exactly 10M ÷ 86,400 ≈ 116/s.
- kind: check
  prompt: 2³⁰ is roughly what?
  choices:
    - text: 1 billion (a GB)
      correct: true
    - text: 1 million (an MB)
      why: That's 2²⁰.
    - text: 1 trillion (a TB)
      why: That's 2⁴⁰.
    - text: 30 thousand
      why: Each 10 in the exponent multiplies by about 1,000.
  explanation: 2¹⁰ ≈ 10³, so 2³⁰ = (2¹⁰)³ ≈ 10⁹.

- kind: fire
  prompt: About how many seconds are in a year?
  choices:
    - text: About 3 × 10⁷ (31.5 million)
      correct: true
    - text: About 3 × 10⁶
      why: That's roughly a month.
    - text: About 3 × 10⁸
      why: That's about ten years.
    - text: About 8.6 × 10⁵
      why: That's ten days.
  explanation: 365 × 86,400 ≈ 31.5 million ≈ 3 × 10⁷.
- kind: fire
  prompt: About how many seconds are in a 30-day month?
  choices:
    - text: About 2.6 million
      correct: true
    - text: About 260,000
      why: That's three days.
    - text: About 26 million
      why: That's ten months.
    - text: About 600,000
      why: That's a week.
  explanation: 30 × 86,400 ≈ 2.6 million ≈ 2.5 × 10⁶.
- kind: fire
  prompt: 1 billion requests a day is about what average rate?
  choices:
    - text: About 12,000 per second
      correct: true
    - text: About 1,200 per second
      why: That's 100 million a day.
    - text: About 120,000 per second
      why: That's 10 billion a day.
    - text: About 1 million per second
      why: That would be 86 billion a day.
  explanation: 10⁹ ÷ 10⁵ = 10,000/s with the shortcut; exactly about 11,600/s.
- kind: fire
  prompt: 100 million requests a day, with peak at 3× the average. What's the peak rate?
  choices:
    - text: About 3,500 per second
      correct: true
    - text: About 350 per second
      why: The average alone is ~1,200/s.
    - text: About 35,000 per second
      why: That's 1 billion a day at a 3× peak.
    - text: About 1,200 per second
      why: That's the average, before the peak factor.
  explanation: 100M ÷ 86,400 ≈ 1,160/s average; × 3 ≈ 3,500/s at peak.
- kind: fire
  prompt: 1 million events a month is about what average rate?
  choices:
    - text: About 0.4 per second
      correct: true
    - text: About 4 per second
      why: That's 10 million a month.
    - text: About 12 per second
      why: That's 1 million a day.
    - text: About 40 per second
      why: That's 100 million a month.
  explanation: A month is about 2.6 million seconds, so 10⁶ ÷ 2.6 × 10⁶ ≈ 0.4/s. Monthly totals sound big and are usually tiny rates.
- kind: fire
  prompt: 2⁴⁰ is roughly what?
  choices:
    - text: 1 trillion (a TB)
      correct: true
    - text: 1 billion (a GB)
      why: That's 2³⁰.
    - text: 1 quadrillion (a PB)
      why: That's 2⁵⁰.
    - text: 40 million
      why: Each 10 in the exponent multiplies by about 1,000.
  explanation: (2¹⁰)⁴ ≈ (10³)⁴ = 10¹².
- kind: fire
  prompt: About how many values does an unsigned 32-bit integer hold?
  choices:
    - text: About 4.3 billion
      correct: true
    - text: About 2.1 billion
      why: That's the largest signed 32-bit integer, 2³¹.
    - text: About 65,000
      why: That's 2¹⁶.
    - text: About 4.3 million
      why: 2³⁰ alone is already ~1 billion.
  explanation: 2³² ≈ 4.3 × 10⁹. It's why 32-bit IDs run out and IPv4 has ~4 billion addresses.
- kind: fire
  prompt: How big is a UUID stored in binary?
  choices:
    - text: 16 bytes
      correct: true
    - text: 8 bytes
      why: That's a 64-bit integer, such as a Snowflake ID.
    - text: 36 bytes
      why: That's its text form with hyphens.
    - text: 128 bytes
      why: A UUID is 128 bits, which is 16 bytes.
  explanation: 128 bits = 16 bytes. Stored as text it takes 36 characters, more than twice as much.
- kind: fire
  prompt: About how big is a short text record with metadata, such as a tweet or a chat message?
  choices:
    - text: About 1 KB
      correct: true
    - text: About 10 bytes
      why: The text alone is often longer, before IDs, timestamps and other fields.
    - text: About 100 KB
      why: That's a small image.
    - text: About 1 MB
      why: That's a photo.
  explanation: A few hundred bytes of text plus IDs, timestamps and flags rounds to ~1 KB, which keeps the arithmetic easy.
- kind: fire
  prompt: About how big is a typical compressed photo?
  choices:
    - text: About 200 KB–2 MB
      correct: true
    - text: About 2–20 KB
      why: That's a small thumbnail.
    - text: About 20–200 MB
      why: That's a minute or more of video.
    - text: About 1 GB
      why: That's roughly half an hour of streaming video.
  explanation: Web-sized photos are a few hundred KB; phone originals are a few MB.
- kind: fire
  prompt: About how much data is an hour of 1080p video at streaming quality (~5 Mbps)?
  choices:
    - text: About 2 GB
      correct: true
    - text: About 200 MB
      why: That's about ten minutes.
    - text: About 20 GB
      why: That's closer to an hour of 4K at a high bitrate.
    - text: About 20 MB
      why: That's about half a minute.
  explanation: 5 Mbps × 3,600 s = 18,000 Mb ÷ 8 ≈ 2.25 GB.
- kind: fire
  prompt: A server has a 10 Gbps network card. About how much data can it send per second?
  choices:
    - text: About 1.25 GB/s
      correct: true
    - text: About 10 GB/s
      why: Network speeds are in bits; divide by 8.
    - text: About 125 MB/s
      why: That's 1 Gbps.
    - text: About 80 GB/s
      why: That multiplies by 8 instead of dividing.
  explanation: 10,000 Mb/s ÷ 8 = 1,250 MB/s.
- kind: fire
  prompt: About how long does a main memory reference take?
  choices:
    - text: About 100 ns
      correct: true
    - text: About 1 ns
      why: That's an L1 cache hit.
    - text: About 10 µs
      why: That's reading a whole megabyte from memory.
    - text: About 1 ms
      why: That's slower than a datacentre round trip.
  explanation: ~100 ns, about 100× slower than L1 cache.
- kind: fire
  prompt: About how long does an L1 cache reference take?
  choices:
    - text: About 1 ns
      correct: true
    - text: About 100 ns
      why: That's main memory.
    - text: About 1 µs
      why: That's a thousand L1 hits.
    - text: About 10 µs
      why: That's reading a megabyte from memory.
  explanation: Roughly one CPU clock cycle or a few, ~1 ns.
- kind: fire
  prompt: About how long does a random read from an NVMe SSD take?
  choices:
    - text: About 20–100 µs
      correct: true
    - text: About 100 ns
      why: That's main memory.
    - text: About 5–10 ms
      why: That's a spinning disk seek.
    - text: About 1 s
      why: No storage device is that slow for one read.
  explanation: Tens of microseconds, about 1,000× slower than memory and 100× faster than an HDD seek.
- kind: fire
  prompt: About how long does a disk seek on a spinning HDD take?
  choices:
    - text: About 5–10 ms
      correct: true
    - text: About 50–100 µs
      why: That's an SSD random read.
    - text: About 100 ns
      why: That's main memory.
    - text: About 1 s
      why: Seeks are slow, but not that slow.
  explanation: The head has to move and the platter has to rotate into place, so ~5–10 ms, which caps an HDD at ~100–200 random reads a second.
- kind: fire
  prompt: About how long is a network round trip within one datacentre?
  choices:
    - text: About 0.5 ms
      correct: true
    - text: About 50 ms
      why: That's a cross-country round trip.
    - text: About 5 ns
      why: That's a few CPU cache hits.
    - text: About 5 s
      why: Nothing healthy in a datacentre takes that long.
  explanation: ~0.5 ms, often less on modern networks. It's why a chatty service making 100 sequential calls adds ~50 ms.
- kind: fire
  prompt: About how long is a round trip between two availability zones in the same region?
  choices:
    - text: About 1–2 ms
      correct: true
    - text: About 10 µs
      why: Zones are kilometres apart; light alone takes longer.
    - text: About 50 ms
      why: That's crossing a continent.
    - text: About 500 ms
      why: That's slower than going round the world.
  explanation: Zones are tens of km apart, so ~1–2 ms. Cheap enough for synchronous replication within a region.
- kind: fire
  prompt: About how long is a round trip between the US east and west coasts?
  choices:
    - text: About 60–70 ms
      correct: true
    - text: About 6–7 ms
      why: That's a few hundred km.
    - text: About 600 ms
      why: That's more than twice round the world.
    - text: About 1 ms
      why: That's about 100 km.
  explanation: ~4,000 km of fibre each way at ~200 km/ms, plus routing, gives ~60–70 ms.
- kind: fire
  prompt: About how long is a round trip between New York and London?
  choices:
    - text: About 70–80 ms
      correct: true
    - text: About 7 ms
      why: Light in fibre can't cross the Atlantic that fast.
    - text: About 700 ms
      why: That's more than twice round the world.
    - text: About 15 ms
      why: That's about 1,500 km of round trip.
  explanation: ~5,500 km each way at ~200 km/ms is ~55 ms round trip for light alone; real routes give ~70–80 ms.
- kind: fire
  prompt: About how long is a round trip between Europe and Australia?
  choices:
    - text: About 250–300 ms
      correct: true
    - text: About 25 ms
      why: That's a few thousand km at most.
    - text: About 2–3 s
      why: Even halfway round the world is well under a second.
    - text: About 80 ms
      why: That's a transatlantic round trip.
  explanation: It's close to the far side of the world. A design that needs several sequential round trips between them is noticeably slow.
- kind: fire
  prompt: About how far does light travel in fibre in one millisecond?
  choices:
    - text: About 200 km
      correct: true
    - text: About 2 km
      why: That would make a datacentre round trip take most of a millisecond for light alone.
    - text: About 300,000 km
      why: That's how far light goes in a vacuum in one second.
    - text: About 20,000 km
      why: That's halfway round the world.
  explanation: About two-thirds of the speed of light in a vacuum. Rule of thumb, each 100 km of distance adds ~1 ms of round trip.
- kind: fire
  prompt: Roughly how much faster is a main memory reference than a random SSD read?
  choices:
    - text: About 1,000×
      correct: true
    - text: About 10×
      why: The gap is far larger, ~100 ns versus ~20–100 µs.
    - text: About 1,000,000×
      why: That's closer to memory versus a cross-world round trip.
    - text: About the same
      why: SSDs are fast for storage, but still far slower than RAM.
  explanation: ~100 ns versus ~20–100 µs. It's why a cache in RAM in front of a disk-backed database pays off.
- kind: fire
  prompt: About how long does it take to read 1 MB sequentially from memory?
  choices:
    - text: About 10 µs
      correct: true
    - text: About 10 ns
      why: That's a handful of cache references.
    - text: About 10 ms
      why: That's an HDD seek.
    - text: About 1 s
      why: Memory bandwidth is tens of GB/s.
  explanation: Memory bandwidth is roughly 10–100 GB/s, so a megabyte takes microseconds.
- kind: fire
  prompt: A client opens a brand-new HTTPS connection (TCP + TLS 1.3). How many round trips happen before the request itself is sent?
  choices:
    - text: Two
      correct: true
    - text: None
      why: The TCP handshake alone takes one round trip.
    - text: One
      why: TCP takes one and TLS 1.3 adds another.
    - text: Four
      why: That's closer to TCP plus TLS 1.2.
  explanation: One round trip for TCP, one for TLS 1.3, then the request and response take a third. Reusing connections removes the first two.
- kind: fire
  prompt: Below roughly what response time does an action feel instant to a user?
  choices:
    - text: About 100 ms
      correct: true
    - text: About 1 s
      why: Under a second keeps flow, but the delay is noticeable.
    - text: About 10 s
      why: Around 10 s users lose attention.
    - text: About 1 ms
      why: People can't perceive differences that small.
  explanation: ~100 ms feels instant, ~1 s keeps flow, ~10 s loses attention.
- kind: fire
  prompt: About how many operations per second can one Redis instance serve?
  choices:
    - text: About 100,000
      correct: true
    - text: About 1,000
      why: That's closer to a busy relational database doing complex queries.
    - text: About 10 million
      why: Only with heavy pipelining across many cores; one instance is about 100k.
    - text: About 10
      why: It's an in-memory store; it's very fast.
  explanation: ~100k simple ops/s per instance, more with pipelining. A hot key on one instance hits this ceiling.
- kind: fire
  prompt: About how many simple requests per second can one stateless app server handle?
  choices:
    - text: About 1k–10k
      correct: true
    - text: About 10–100
      why: Only for heavy work; simple requests are far cheaper.
    - text: About 1 million
      why: That's beyond one machine for real request handling.
    - text: About 100 million
      why: No single server does that.
  explanation: It depends on the work per request, but 1k–10k is a fair starting assumption to say out loud.
- kind: fire
  prompt: About how many simple writes per second can one relational database primary sustain?
  choices:
    - text: About 5k–20k
      correct: true
    - text: About 50
      why: That's far too low for modern hardware.
    - text: About 1 million
      why: That's sharded-cluster territory.
    - text: About 100 million
      why: No single database does that.
  explanation: Thousands to tens of thousands of simple writes per second. Below that, you don't need to shard for writes.
- kind: fire
  prompt: About how much throughput does one Kafka broker handle?
  choices:
    - text: Hundreds of MB per second
      correct: true
    - text: Hundreds of KB per second
      why: Brokers do sequential disk writes and are much faster.
    - text: Hundreds of GB per second
      why: That's beyond one machine's disks and network.
    - text: About 1 MB per second
      why: That's far too low.
  explanation: Sequential appends and zero-copy reads put a broker in the hundreds of MB/s, bounded by disk and network.
- kind: fire
  prompt: About how many random reads per second can a spinning HDD do?
  choices:
    - text: About 100–200
      correct: true
    - text: About 100,000
      why: That's an NVMe SSD.
    - text: About 10
      why: Seeks take ~5–10 ms, so it's more than that.
    - text: About 10,000
      why: Each random read needs a seek, ~5–10 ms.
  explanation: 1 s ÷ ~5–10 ms per seek ≈ 100–200 IOPS. Why random access on HDDs is avoided.
- kind: fire
  prompt: 99.99% availability allows about how much downtime per year?
  choices:
    - text: About 53 minutes
      correct: true
    - text: About 5 minutes
      why: That's 99.999%.
    - text: About 8.8 hours
      why: That's 99.9%.
    - text: About 3.7 days
      why: That's 99%.
  explanation: 525,600 minutes × 0.0001 ≈ 53 minutes, or about 4.3 minutes a month.
- kind: fire
  prompt: 99.999% ("five nines") allows about how much downtime per year?
  choices:
    - text: About 5 minutes
      correct: true
    - text: About 53 minutes
      why: That's four nines.
    - text: About 30 seconds
      why: That's closer to five nines over a month (~26 s).
    - text: About 8.8 hours
      why: That's three nines.
  explanation: 525,600 × 0.00001 ≈ 5.3 minutes a year. Hard to achieve when any human has to react.
- kind: fire
  prompt: 99% availability allows about how much downtime in a 30-day month?
  choices:
    - text: About 7 hours
      correct: true
    - text: About 43 minutes
      why: That's 99.9%.
    - text: About 3.7 days
      why: That's 99% over a whole year.
    - text: About 4 minutes
      why: That's 99.99%.
  explanation: 720 hours × 0.01 ≈ 7.2 hours.
- kind: fire
  prompt: A request needs five services, each 99.9% available, and fails if any one fails. Roughly what's its availability?
  choices:
    - text: About 99.5%
      correct: true
    - text: About 99.9%
      why: Each required dependency adds its own failure chance.
    - text: About 99.999%
      why: Required dependencies lower availability; only redundancy raises it.
    - text: About 95%
      why: That would need each service at 99%.
  explanation: Add the failure rates, 5 × 0.1% = 0.5%, so about 99.5% (exactly 0.999⁵).
- kind: fire
  prompt: Two independent replicas are each 99% available, and either one can serve. Roughly what's the combined availability?
  choices:
    - text: About 99.99%
      correct: true
    - text: About 99.5%
      why: Redundancy multiplies the failure chances, 1% × 1%.
    - text: About 98%
      why: That's two required services in series.
    - text: About 99%
      why: The second replica helps, provided failures are independent.
  explanation: Both must fail: 0.01 × 0.01 = 0.0001, so 99.99%. Only if failures are independent; a shared rack or deploy breaks this.
- kind: fire
  prompt: For a typical consumer product, peak traffic is roughly how many times the daily average?
  choices:
    - text: About 2–3×
      correct: true
    - text: About 1.1×
      why: Daily cycles alone are bigger than that.
    - text: About 100×
      why: Only for rare events like ticket on-sales.
    - text: Less than 1×
      why: The peak is above the average by definition.
  explanation: Assume 2–3× unless the product is spiky (flash sales, live events), where 10× or more is possible.
- kind: fire
  prompt: A service handles 1,000 requests/s and each spends 200 ms in it. About how many requests are in flight?
  choices:
    - text: About 200
      correct: true
    - text: About 5
      why: That's 1,000 × 0.005; use 0.2 s.
    - text: About 5,000
      why: That divides 1,000 by 0.2 instead of multiplying.
    - text: About 200,000
      why: That multiplies by 200 ms as if it were 200 s.
  explanation: Little's Law, L = λW = 1,000/s × 0.2 s = 200. Size thread and connection pools from this.
- kind: fire
  prompt: A page calls 50 services in parallel, each slow 1% of the time. Roughly what share of page loads hit a slow call?
  choices:
    - text: About 40–50%
      correct: true
    - text: About 1%
      why: The page waits for the slowest of 50 calls.
    - text: About 5%
      why: That's five calls, not fifty.
    - text: Essentially 100%
      why: It's high, but 0.99⁵⁰ ≈ 60% of loads still avoid it.
  explanation: N × p = 50% is the quick estimate; exactly 1 − 0.99⁵⁰ ≈ 40%.
- kind: fire
  prompt: What utilisation should you plan servers to run at during peak?
  choices:
    - text: About 60–70%
      correct: true
    - text: About 95%
      why: Queueing delay grows like ρ/(1−ρ); at 95% waits are ~19× the service time.
    - text: About 100%
      why: There's no headroom for bursts or losing an instance.
    - text: About 10%
      why: That wastes most of the fleet.
  explanation: Headroom absorbs bursts and the loss of an instance or zone, and keeps queueing delay low.
- kind: fire
  prompt: Under the usual 80/20 rule, caching the hottest 20% of items serves roughly what share of reads?
  choices:
    - text: About 80%
      correct: true
    - text: About 20%
      why: Popularity is skewed, so the hot items get far more than their share.
    - text: About 50%
      why: The skew is stronger than that.
    - text: About 99%
      why: Possible for very skewed workloads, but 80% is the usual assumption.
  explanation: A small hot set takes most reads, which is why a cache much smaller than the database still has a high hit rate.
- kind: fire
  prompt: For content and social products, what's a typical read:write ratio?
  choices:
    - text: About 10:1 to 100:1
      correct: true
    - text: About 1:1
      why: People view far more than they post.
    - text: About 1:10
      why: That's write-heavy, like logging or metrics.
    - text: About 1,000,000:1
      why: Too extreme for most products.
  explanation: Read-heavy workloads favour caches, replicas and precomputation.
- kind: fire
  prompt: About how many English words is 1,000 LLM tokens?
  choices:
    - text: About 750
      correct: true
    - text: About 250
      why: A token is usually part of a word, not several words.
    - text: About 4,000
      why: That's characters; a token is about 4 characters.
    - text: About 1,000
      why: Common words are one token, but many words split into several.
  explanation: 1 token ≈ 4 characters ≈ 0.75 words. Code and non-English text use more tokens.
- kind: fire
  prompt: Reading input tokens from a prompt cache costs roughly what fraction of the normal input price?
  choices:
    - text: About 0.1×
      correct: true
    - text: About 0.5×
      why: That was some providers' early discount; current cache reads are ~90% off.
    - text: About 1.25×
      why: That's the price of writing to the cache.
    - text: Free
      why: Cache reads are discounted, not free.
  explanation: Cache reads cost ~10% of normal input, which is why a long, stable system prompt or document should come first and be cached.
- kind: fire
  prompt: What does LLM prompt caching actually cache?
  choices:
    - text: An identical prefix of the input, so repeat requests skip re-processing it
      correct: true
    - text: The model's output, so the same question returns the stored answer
      why: That's an application-level response cache. Prompt caching never caches output, and output is the expensive part.
    - text: Any input text that appeared before, wherever it is in the prompt
      why: It's a prefix match; a change early in the prompt invalidates everything after it.
    - text: The model weights on the client
      why: Weights stay on the provider's GPUs.
  explanation: Order the prompt stable-first (tools, system prompt, documents) and put anything that varies (the question, timestamps) at the end.
- kind: fire
  prompt: Writing a prompt prefix into the cache costs roughly what, compared with normal input?
  choices:
    - text: About 1.25× for a ~5-minute cache
      correct: true
    - text: About 0.1×
      why: That's reading from the cache.
    - text: About 10×
      why: The write premium is small; it pays off after one or two reuses.
    - text: Nothing extra
      why: There's a small premium, and more for a 1-hour cache.
  explanation: A 25% premium once, then ~90% off each reuse within the lifetime. One reuse already comes out ahead.
- kind: fire
  prompt: For hosted LLM APIs, how does the price of an output token compare with an input token?
  choices:
    - text: Output costs about 4–8× more
      correct: true
    - text: They cost the same
      why: Output is generated one token at a time, which uses far more GPU time per token.
    - text: Input costs more
      why: Input is processed in parallel and is the cheaper side.
    - text: Output costs about 100× more
      why: The gap is a single-digit multiple (5× for Claude).
  explanation: Decode is sequential and memory-bound, prefill is parallel. Long outputs, and long hidden reasoning, dominate the bill.
- kind: fire
  prompt: 1M requests a day each send 2,000 input tokens and get 500 output tokens, at $3 per million input and $15 per million output. Which part costs more?
  choices:
    - text: Output, about $7,500 a day versus $6,000 for input
      correct: true
    - text: Input, because there are four times as many input tokens
      why: Output costs 5× more per token, which outweighs the 4× volume.
    - text: They're about equal at $3,000 each
      why: Input is 2B tokens × $3/M = $6,000; output is 0.5B × $15/M = $7,500.
    - text: Neither matters next to GPU hosting
      why: With an API, tokens are the bill.
  explanation: Input 2B × $3/M = $6,000; output 0.5B × $15/M = $7,500. Caching the stable part of the input and capping output length are the first levers.
- kind: fire
  prompt: What does a batch API typically offer in exchange for results within about 24 hours?
  choices:
    - text: About 50% off
      correct: true
    - text: About 10% off
      why: The batch discount is much larger.
    - text: About 90% off
      why: That's the cache-read discount.
    - text: A larger context window
      why: Batch changes price and latency, not model limits.
  explanation: Use it for evals, backfills and offline classification, anything not waiting on a user.
- kind: fire
  prompt: About how fast does a hosted frontier model stream output to one user?
  choices:
    - text: About 50–150 tokens per second
      correct: true
    - text: About 5 tokens per second
      why: Far slower than typical hosted serving.
    - text: About 5,000 tokens per second
      why: That's closer to how fast input is processed, not output.
    - text: About 1 token per second
      why: That's much too slow.
  explanation: A 500-token answer takes ~5 s to stream, so stream it to the user and keep outputs short where latency matters.
- kind: fire
  prompt: How much GPU memory do the weights of a 70B-parameter model need in FP16?
  choices:
    - text: About 140 GB
      correct: true
    - text: About 70 GB
      why: That's INT8, 1 byte per parameter.
    - text: About 35 GB
      why: That's INT4, half a byte per parameter.
    - text: About 1.1 TB
      why: That's closer to 16 bytes per parameter, the training footprint.
  explanation: 70B × 2 bytes = 140 GB, more than one 80 GB H100, before any KV cache.
- kind: fire
  prompt: Roughly how much memory does full training of a 7B model with Adam in mixed precision need, before activations?
  choices:
    - text: About 110 GB
      correct: true
    - text: About 14 GB
      why: That's the FP16 weights alone, enough for inference.
    - text: About 28 GB
      why: Training also holds gradients and two Adam states per parameter.
    - text: About 1 TB
      why: That's well over 100 bytes per parameter.
  explanation: ~16 bytes per param (weights, gradients, FP32 master copy and Adam moments) × 7B ≈ 112 GB.
- kind: fire
  prompt: For an 8B–70B open model in FP16, about how much KV cache does each token of context take?
  choices:
    - text: About 0.1–0.3 MB
      correct: true
    - text: About 1–3 KB
      why: That's about 100× too small; every layer stores keys and values.
    - text: About 10–30 MB
      why: That's about 100× too large.
    - text: Nothing; only the weights use memory
      why: The KV cache grows with context and batch size and often limits concurrency.
  explanation: 2 × layers × KV heads × head size × 2 bytes. For a 70B model that's ~0.33 MB per token, so 100k tokens ≈ 33 GB.
- kind: fire
  prompt: How much memory and bandwidth does an H100 have?
  choices:
    - text: 80 GB at about 3.35 TB/s
      correct: true
    - text: 24 GB at about 1 TB/s
      why: That's a consumer RTX 4090.
    - text: 1 TB at about 100 GB/s
      why: That's closer to a CPU server's RAM.
    - text: 8 GB at about 450 GB/s
      why: That's a consumer RTX 3070.
  explanation: 80 GB of HBM at ~3.35 TB/s. H200 has ~141 GB; B200 ~180 GB.
- kind: fire
  prompt: Batch size 1, an 8B model in FP16 (16 GB) on a GPU with 3.35 TB/s of memory bandwidth. Roughly what's the decode speed ceiling?
  choices:
    - text: About 200 tokens per second
      correct: true
    - text: About 20 tokens per second
      why: That's a 10× smaller ceiling; 3,350 ÷ 16 ≈ 210.
    - text: About 2,000 tokens per second
      why: Every token must read all 16 GB of weights.
    - text: Limited by FLOPs, not memory
      why: At batch size 1, decode is memory-bandwidth bound.
  explanation: Each token reads every weight once, so tokens/s ≤ bandwidth ÷ weight bytes. Batching reuses each read across many requests, raising total throughput.
- kind: fire
  prompt: Roughly how many FLOPs does a model with N parameters use per generated token?
  choices:
    - text: About 2N
      correct: true
    - text: About 6N
      why: That's per training token (forward and backward pass).
    - text: About N²
      why: Compute grows linearly with parameters.
    - text: About N/1,000
      why: Every parameter takes part in a multiply and an add.
  explanation: One multiply-add per parameter per token is 2N FLOPs. Training is ~6N per token.
- kind: fire
  prompt: How big is one 1,536-dimension float32 embedding, and 1 million of them?
  choices:
    - text: About 6 KB each, 6 GB for a million
      correct: true
    - text: About 1.5 KB each, 1.5 GB for a million
      why: float32 is 4 bytes per dimension.
    - text: About 60 KB each, 60 GB for a million
      why: That's 10× too large.
    - text: About 600 bytes each, 600 MB for a million
      why: 1,536 × 4 bytes ≈ 6 KB.
  explanation: 1,536 × 4 B ≈ 6 KB. 100M vectors ≈ 600 GB, before index overhead; int8 quantisation cuts it 4×.
- kind: fire
  prompt: What's a typical context window for current frontier LLMs?
  choices:
    - text: About 200k–1M tokens
      correct: true
    - text: About 4k–8k tokens
      why: That was early models, years ago.
    - text: About 100M tokens
      why: No production model has a window that large.
    - text: Unlimited
      why: Windows are fixed, and cost and latency grow with every token used.
  explanation: Large windows still cost per token and slow time to first token, so retrieval and caching still matter.
```
