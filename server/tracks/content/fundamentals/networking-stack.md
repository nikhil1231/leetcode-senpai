---
id: networking-stack
category: systems
skill: systems
title: What happens on the wire - DNS, TCP, TLS and HTTP
minutes: 16
summary: "What happens when you type a URL?" tests whether you can walk the stack, say what each layer costs, and debug it. Cover DNS resolution and TTLs, the TCP handshake, congestion and TIME_WAIT, the TLS 1.3 handshake and certificates, then HTTP/1.1 vs HTTP/2 vs HTTP/3. Round trips explain most latency, and connection reuse is the cheapest fix.
objectives:
  - Walk a request from DNS to response, counting round trips
  - Explain TCP connection setup, slow start, head-of-line blocking and TIME_WAIT
  - Explain what TLS proves, what certificates contain, and why TLS 1.3 is faster
  - Compare HTTP/1.1, HTTP/2 and HTTP/3 and say when each matters
sources:
  - ['MDN: An overview of HTTP', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview']
  - ['Cloudflare: What happens in a TLS handshake?', 'https://www.cloudflare.com/learning/ssl/what-happens-in-a-tls-handshake/']
  - ['Ilya Grigorik: High Performance Browser Networking', 'https://hpbn.co/']
---

## DNS

The browser asks a **recursive resolver** (your ISP, 1.1.1.1 or 8.8.8.8). On a cache miss, the resolver walks root servers, then the TLD (`.com`), then the domain's **authoritative** servers, and caches the answer for its **TTL**. Records to know: `A`/`AAAA` (addresses), `CNAME` (alias), `MX`, `TXT` (verification, SPF), and `NS`.

TTLs cut both ways. A long TTL means fewer lookups, but a failover or migration takes up to that long to reach everyone (and some clients ignore TTLs). Lower the TTL **days before** a planned migration. DNS-based load balancing is coarse: clients cache records and pick addresses unevenly.

## TCP

TCP gives an ordered, reliable byte stream over an unreliable network:

- **Handshake**: SYN, SYN-ACK, ACK. That's one round trip before any data.
- **Flow control**: the receiver advertises a window, so a fast sender can't overwhelm it.
- **Congestion control**: a new connection starts with a small congestion window (**slow start**, about 10 segments, roughly 14 KB) and roughly doubles it each round trip until it sees loss. So a new connection is slow for its first few round trips, which is why connection reuse and keep-alive matter so much.
- **Head-of-line blocking**: one lost packet holds up everything behind it in the stream until it's retransmitted.
- **TIME_WAIT**: the side that closes first keeps the connection's 4-tuple reserved for about 2 × MSL (60 s on Linux), so stray packets can't corrupt a new connection. A client opening and closing thousands of short connections to one backend can **exhaust ephemeral ports**. The fix is pooling and keep-alive, not kernel tricks.

## TLS

TLS gives **confidentiality** (encryption), **integrity** (tamper detection), and **authentication** of the server: the server proves it holds the private key for a certificate that a trusted CA has signed for that hostname. The client checks the chain of trust, the validity dates, and that the hostname matches the certificate's SAN.

**TLS 1.3** needs one round trip: the client sends its key share in the first message, so the server can respond with its certificate and start encrypting. TLS 1.2 needed two. Session resumption and 0-RTT can skip more, but 0-RTT data can be replayed, so use it only for idempotent requests. **mTLS** also authenticates the client with a certificate, which is common for service-to-service traffic.

```calc
title: Round trips before the first byte
prompt: A user is 80 ms round-trip time from your server. DNS is cached. Ignoring server processing time, how many milliseconds pass before the browser can send the HTTP request on a fresh HTTPS connection with TCP and TLS 1.3?
answer: 160
unit: ms
tolerance: 0.01
steps: |
  The TCP handshake takes **1 RTT** (SYN → SYN-ACK; the client's ACK can carry data). The TLS 1.3 handshake takes **1 RTT** (ClientHello with key share → ServerHello and certificate). So the request goes out after 2 RTTs = **160 ms**, and the response takes at least one more RTT, so 240 ms to the first byte. With TLS 1.2 it would be 3 RTTs before the request. With HTTP/3 (QUIC), transport and crypto share one handshake, so it's 1 RTT. With a reused connection, it's 0. This is why CDNs (shorter RTT) and keep-alive (no handshake) are the biggest latency wins.
```

## HTTP versions

| | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Transport | TCP | TCP | QUIC over UDP |
| Concurrency | One request at a time per connection (browsers open about 6) | Many streams multiplexed on one connection | Multiplexed streams |
| Headers | Text, repeated | HPACK compression | QPACK compression |
| Head-of-line blocking | Per connection | Fixed at HTTP level, but one lost TCP packet still stalls all streams | Fixed: loss stalls only the affected stream |
| Handshake | TCP + TLS | TCP + TLS | Combined, 1 RTT (0-RTT on resumption) |

HTTP/2 helps most for many small requests on one origin. HTTP/3 helps most on lossy mobile networks, and it survives network changes (Wi-Fi to cellular) because QUIC connections are identified by connection ID, not by IP and port.

```order
prompt: Order what happens when a browser loads https://shop.example.com for the first time today.
items:
  - The browser checks its caches, then asks a recursive resolver for shop.example.com
  - The resolver returns an IP address (walking root, TLD and authoritative servers on a miss)
  - The browser opens a TCP connection with SYN, SYN-ACK, ACK
  - The TLS handshake verifies the certificate and agrees session keys
  - The browser sends the HTTP GET request with Host and cookies
  - The server (or CDN edge) responds, and the browser parses HTML and requests subresources over the same connection
explain: Each early step costs at least one round trip on a cold start, which is why DNS prefetching, CDNs, connection reuse and TLS 1.3 all exist.
```

## Debugging the network

- `dig +trace example.com`: follow DNS resolution.
- `curl -v` or `curl -w '%{time_namelookup} %{time_connect} %{time_appconnect} %{time_starttransfer}\n'`: break latency into DNS, TCP, TLS and server time.
- `openssl s_client -connect host:443 -servername host`: inspect the certificate chain.
- `ss -tanp`: socket states. Thousands in TIME_WAIT or CLOSE_WAIT is a clue. **CLOSE_WAIT** means *your* app never closed sockets that the peer already closed.
- `tcpdump` / Wireshark: when all else fails.

```questions
- kind: check
  prompt: Why is a brand-new TCP connection slower than a warm one, even with no packet loss?
  choices:
    - text: The handshake costs a round trip, and slow start limits how much data the first round trips can carry
      correct: true
    - text: New connections use a lower-priority queue
      why: There's no such priority.
    - text: DNS must be resolved again for every connection
      why: DNS results are cached independently of connections.
  explanation: Connection reuse avoids both the handshake and the slow-start ramp-up.
- kind: check
  prompt: What does a TLS certificate let the client verify?
  choices:
    - text: That the server holds the private key for a CA-signed certificate valid for this hostname
      correct: true
    - text: That the server has no vulnerabilities
      why: Certificates say nothing about server security.
    - text: That the client's own identity is known to the server
      why: That's only with mutual TLS.
  explanation: The chain of trust, the validity period and the hostname match are all checked.
- kind: check
  prompt: What problem does HTTP/3 solve that HTTP/2 can't?
  choices:
    - text: One lost packet no longer stalls every multiplexed stream
      correct: true
    - text: It adds header compression for the first time
      why: HTTP/2 already had HPACK.
    - text: It allows more than one request per connection
      why: HTTP/2 already multiplexes streams.
  explanation: QUIC retransmits per stream, avoiding TCP's transport-level head-of-line blocking.
- kind: fire
  prompt: A server shows thousands of sockets in CLOSE_WAIT. Whose bug is it?
  choices:
    - text: Your application's, because it never closes sockets the peer has already closed
      correct: true
    - text: The client's, for closing too early
      why: Closing is normal; not closing your end is the bug.
    - text: The kernel's TIME_WAIT settings
      why: TIME_WAIT is a different state, on the side that closes first.
  explanation: CLOSE_WAIT persists until the local app calls close().
- kind: fire
  prompt: You're migrating a domain to a new IP next week. What should you do with DNS today?
  choices:
    - text: Lower the record's TTL well in advance, so the change propagates quickly on the day
      correct: true
    - text: Raise the TTL to reduce load during the migration
      why: That makes the cutover take longer.
    - text: Nothing; DNS changes are instant
      why: Resolvers cache records for up to the old TTL.
  explanation: Caches honour the TTL that was in effect when they fetched the record.
- kind: fire
  prompt: How many round trips does a TLS 1.3 handshake add on a fresh connection (no resumption)?
  type: numeric
  answer: 1
  unit: RTT
  tolerance: 0.01
  explanation: The client sends its key share up front, so one round trip suffices; TLS 1.2 needed two.
- kind: fire
  prompt: A client makes thousands of short-lived connections per second to one backend and gets "cannot assign requested address". Best fix?
  choices:
    - text: Reuse connections with a pool and keep-alive
      correct: true
    - text: Turn off TCP checksums
      why: Unrelated, and unsafe.
    - text: Increase the server's listen backlog
      why: The client is running out of ephemeral ports, not the server.
  explanation: Each closed connection holds a port in TIME_WAIT. Reuse avoids churning through them.
```
