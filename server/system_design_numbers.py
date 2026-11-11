"""Numbers drill: an endless queue of "how big is it?" questions for the Numbers to know lesson.

Each question has one authored answer (a value or a range, with a unit) taken from the lesson. You
type a number and pick a unit (or type the unit); any unit of the same kind converts, so 1,000 MB
and 1 GB are the same answer. Within the range, or within 2× of the answer, is correct. Wrong
answers are banded by how far out they were, and the further out, the sooner the question comes
back. The queue counts answers, not days: a question is due again after so many other questions.
State is one design record (kind numbers_drill): per-question cards, the current question and a
log of recent answers that the page turns into a sliding-window score. Parsing, grading and
picking are pure.
"""
import math
import random
import re
import time

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import auth
from .store import get_store

router = APIRouter(prefix='/api/system-design', tags=['system-design-numbers'])
KEY = 'numbers-drill'
LOG = 200
WINDOW = 20

# Units by kind of quantity: (label, aliases, size in the kind's base unit). The first label of each
# kind is not special; DEFAULT is what the dropdown starts on, chosen so it never hints the answer.
UNITS = {
    'time': [('ns', ['ns', 'nanosecond', 'nanoseconds'], 1e-9), ('µs', ['µs', 'us', 'μs', 'microsecond', 'microseconds'], 1e-6),
             ('ms', ['ms', 'millisecond', 'milliseconds'], 1e-3), ('s', ['s', 'sec', 'secs', 'second', 'seconds'], 1),
             ('minutes', ['min', 'mins', 'minute', 'minutes'], 60), ('hours', ['h', 'hr', 'hrs', 'hour', 'hours'], 3600),
             ('days', ['d', 'day', 'days'], 86400), ('years', ['y', 'yr', 'year', 'years'], 365 * 86400)],
    'size': [('bytes', ['b', 'byte', 'bytes'], 1), ('KB', ['kb', 'kib', 'kilobyte', 'kilobytes'], 1e3),
             ('MB', ['mb', 'mib', 'megabyte', 'megabytes'], 1e6), ('GB', ['gb', 'gib', 'gigabyte', 'gigabytes'], 1e9),
             ('TB', ['tb', 'tib', 'terabyte', 'terabytes'], 1e12), ('PB', ['pb', 'pib', 'petabyte', 'petabytes'], 1e15)],
    'bandwidth': [('Mbps', ['mbps', 'mbit/s'], 1e6 / 8), ('Gbps', ['gbps', 'gbit/s'], 1e9 / 8),
                  ('KB/s', ['kb/s'], 1e3), ('MB/s', ['mb/s', 'mbs'], 1e6), ('GB/s', ['gb/s', 'gbs'], 1e9),
                  ('TB/s', ['tb/s', 'tbs'], 1e12)],
    'rate': [('per second', ['/s', 'per second', 'per sec', 'ps', 'rps', 'qps', 'iops', 'req/s', 'ops/s', 'tokens/s', 'tok/s'], 1),
             ('thousand/s', ['k/s', 'thousand/s', 'thousand per second'], 1e3), ('million/s', ['m/s', 'million/s', 'million per second'], 1e6)],
    'count': [('(number)', ['', 'x1'], 1), ('thousand', ['k', 'thousand'], 1e3), ('million', ['m', 'mn', 'million'], 1e6),
              ('billion', ['bn', 'billion'], 1e9), ('trillion', ['tn', 'trillion'], 1e12)],
    'percent': [('%', ['%', 'percent', 'pct', ''], 1)],
    'ratio': [('×', ['×', 'x', 'times', ''], 1)],
    'distance': [('km', ['km', 'kilometre', 'kilometres', 'kilometer', 'kilometers'], 1)],
}
DEFAULT = {'time': 's', 'size': 'MB', 'bandwidth': 'MB/s', 'rate': 'per second', 'count': '(number)',
           'percent': '%', 'ratio': '×', 'distance': 'km'}
# Magnitude words that may sit between the number and the unit ("2.5k /s", "3 million").
SCALE = {'k': 1e3, 'thousand': 1e3, 'mn': 1e6, 'million': 1e6, 'bn': 1e9, 'billion': 1e9,
         'tn': 1e12, 'trillion': 1e12}
SUPER = str.maketrans('⁰¹²³⁴⁵⁶⁷⁸⁹⁻', '0123456789-')
NUM = r'(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?'
VALUE = re.compile(rf'^\s*[~≈]?\s*(?:10\^(-?\d+)|({NUM})\s*(?:[x×*]\s*10\^(-?\d+))?)\s*(.*?)\s*$', re.I)
RANGE = re.compile(r'(?<![eE^])\s*(?:-|–|\bto\b)\s*(?=[\d.~≈])')

# (id, topic, prompt, kind, answer as written, explanation). Ids are stable: cards are keyed by them.
QUESTIONS_RAW = [
    # Time
    ('secs-day', 'Time', 'How many seconds are in a day?', 'count', '86400', '24 × 3,600 = 86,400, which is about 10⁵.'),
    ('secs-month', 'Time', 'How many seconds are in a 30-day month?', 'count', '2.6 million', '30 × 86,400 ≈ 2.6 million, about 2.5 × 10⁶.'),
    ('secs-year', 'Time', 'How many seconds are in a year?', 'count', '31.5 million', '365 × 86,400 ≈ 31.5 million, about 3 × 10⁷.'),
    ('rate-1m-day', 'Time', '1 million requests a day is what average rate?', 'rate', '12 /s', '10⁶ ÷ 86,400 ≈ 12/s. Dividing by 10⁵ gives 10/s, close enough.'),
    ('rate-10m-day', 'Time', '10 million requests a day is what average rate?', 'rate', '116 /s', '10⁷ ÷ 86,400 ≈ 116/s; the 10⁵ shortcut gives 100/s.'),
    ('rate-100m-day', 'Time', '100 million requests a day is what average rate?', 'rate', '1160 /s', '10⁸ ÷ 86,400 ≈ 1,160/s.'),
    ('rate-1b-day', 'Time', '1 billion requests a day is what average rate?', 'rate', '11600 /s', '10⁹ ÷ 86,400 ≈ 11,600/s; the shortcut gives 10,000/s.'),
    ('rate-50m-day', 'Time', '50 million requests a day is what average rate?', 'rate', '500-580 /s', '50M ÷ 10⁵ = 500/s with the shortcut; exactly 579/s.'),
    ('rate-1m-month', 'Time', '1 million events a month is what average rate?', 'rate', '0.4 /s', 'A month is about 2.6 million seconds, so 10⁶ ÷ 2.6 × 10⁶ ≈ 0.4/s.'),
    ('peak-100m-day', 'Time', '100 million requests a day, with peak at 3× the average. What is the peak rate?', 'rate', '3500 /s', '100M ÷ 86,400 ≈ 1,160/s average; × 3 ≈ 3,500/s.'),
    # Sizes
    ('pow-10', 'Sizes', '2¹⁰ is roughly what?', 'count', '1024', '2¹⁰ = 1,024, about a thousand: a KB.'),
    ('pow-16', 'Sizes', '2¹⁶ is what?', 'count', '65536', '2¹⁶ = 65,536, the number of ports or values in an unsigned 16-bit integer.'),
    ('pow-20', 'Sizes', '2²⁰ is roughly what?', 'count', '1 million', '2²⁰ = (2¹⁰)² ≈ 10⁶: a MB.'),
    ('pow-30', 'Sizes', '2³⁰ is roughly what?', 'count', '1 billion', '2³⁰ = (2¹⁰)³ ≈ 10⁹: a GB.'),
    ('pow-31', 'Sizes', 'What is the largest signed 32-bit integer, roughly (2³¹)?', 'count', '2.1 billion', '2³¹ ≈ 2.1 billion. An auto-increment id in a 32-bit column runs out there.'),
    ('pow-32', 'Sizes', '2³² is roughly what?', 'count', '4.3 billion', '2³² ≈ 4.3 billion, the size of the IPv4 address space.'),
    ('pow-40', 'Sizes', '2⁴⁰ is roughly what?', 'count', '1 trillion', '2⁴⁰ = (2¹⁰)⁴ ≈ 10¹²: a TB.'),
    ('gbps-1', 'Sizes', 'A link runs at 1 Gbps. How many bytes a second is that?', 'bandwidth', '125 MB/s', 'Network speeds are in bits: 1,000 Mb/s ÷ 8 = 125 MB/s.'),
    ('gbps-10', 'Sizes', 'A link runs at 10 Gbps. How many bytes a second is that?', 'bandwidth', '1.25 GB/s', '10,000 Mb/s ÷ 8 = 1,250 MB/s, about 1.25 GB/s.'),
    ('size-int64', 'Sizes', 'How big is a 64-bit integer or timestamp?', 'size', '8 bytes', '64 bits ÷ 8 = 8 bytes.'),
    ('size-uuid', 'Sizes', 'How big is a UUID stored as binary?', 'size', '16 bytes', 'A UUID is 128 bits, 16 bytes. As text it takes 36 characters.'),
    ('size-uuid-text', 'Sizes', 'How many characters is a UUID written as text?', 'count', '36', '32 hex digits plus 4 hyphens = 36 characters.'),
    ('size-message', 'Sizes', 'How big is a short text record with its metadata (a chat message or a post)?', 'size', '1 KB', 'About 1 KB once you add ids, timestamps and the author.'),
    ('size-photo', 'Sizes', 'How big is a compressed photo?', 'size', '200 KB-2 MB', 'About 200 KB to 2 MB, depending on resolution and quality.'),
    ('size-video-hour', 'Sizes', 'How big is an hour of 1080p video streamed at about 5 Mbps?', 'size', '2-2.25 GB', '5 Mbps ÷ 8 = 0.625 MB/s; × 3,600 s ≈ 2.25 GB.'),
    # Latency
    ('lat-l1', 'Latency', 'How long does an L1 cache reference take?', 'time', '1 ns', 'About 1 ns, a few CPU cycles.'),
    ('lat-mem', 'Latency', 'How long does a main memory reference take?', 'time', '100 ns', 'About 100 ns, a hundred times an L1 hit.'),
    ('lat-mem-1mb', 'Latency', 'How long does it take to read 1 MB sequentially from memory?', 'time', '10 µs', 'About 10 µs, at roughly 100 GB/s.'),
    ('lat-ssd-random', 'Latency', 'How long does a random read from an NVMe SSD take?', 'time', '20-100 µs', 'About 20 to 100 µs, roughly 1,000× a memory reference.'),
    ('lat-ssd-1mb', 'Latency', 'How long does it take to read 1 MB sequentially from an SSD?', 'time', '0.3-1 ms', 'About 0.3 to 1 ms, at 1 to 3 GB/s.'),
    ('lat-dc-rtt', 'Latency', 'What is a network round trip within one datacentre?', 'time', '0.5 ms', 'About 0.5 ms.'),
    ('lat-az-rtt', 'Latency', 'What is a round trip between availability zones in one region?', 'time', '1-2 ms', 'About 1 to 2 ms: zones are tens of kilometres apart.'),
    ('lat-hdd-seek', 'Latency', 'How long does a disk seek on a spinning HDD take?', 'time', '5-10 ms', 'About 5 to 10 ms, about 100× a random SSD read.'),
    ('lat-us-rtt', 'Latency', 'What is a round trip between the US east and west coasts?', 'time', '60-70 ms', 'About 60 to 70 ms.'),
    ('lat-ny-london', 'Latency', 'What is a round trip between New York and London?', 'time', '70-80 ms', 'About 70 to 80 ms: 5,600 km each way at 200 km per ms, plus routing.'),
    ('lat-eu-au', 'Latency', 'What is a round trip between Europe and Australia?', 'time', '250-300 ms', 'About 250 to 300 ms, the longest common route.'),
    ('lat-mem-vs-ssd', 'Latency', 'How many times faster is a memory reference than a random SSD read?', 'ratio', '1000 ×', '100 ns against roughly 100 µs: about 1,000×.'),
    ('lat-ssd-vs-hdd', 'Latency', 'How many times faster is a random SSD read than an HDD seek?', 'ratio', '100 ×', 'Tens of µs against 5 to 10 ms: about 100×.'),
    ('lat-fibre', 'Latency', 'How far does light travel in fibre in 1 ms?', 'distance', '200 km', 'About 200 km per ms, two thirds of the speed of light in a vacuum.'),
    ('lat-100km', 'Latency', 'How much round-trip time does each 100 km of distance add?', 'time', '1 ms', '200 km of fibre there and back at 200 km per ms: about 1 ms.'),
    ('lat-https', 'Latency', 'How many round trips does a new HTTPS connection (TCP + TLS 1.3) cost before the request is sent?', 'count', '2', 'One for the TCP handshake and one for TLS 1.3.'),
    ('lat-instant', 'Latency', 'Under what response time does an action feel instant?', 'time', '100 ms', 'Under about 100 ms feels instant; under 1 s keeps the user\'s flow.'),
    ('lat-attention', 'Latency', 'Past what wait do you lose the user\'s attention?', 'time', '10 s', 'Past about 10 s. Show progress well before then.'),
    # One machine
    ('cap-app', 'One machine', 'How many simple requests a second can one stateless app server handle?', 'rate', '1000-10000 /s', 'About 1k to 10k a second, depending on the work per request.'),
    ('cap-redis', 'One machine', 'How many operations a second can one Redis or Memcached node handle?', 'rate', '100 k/s', 'About 100k a second.'),
    ('cap-db-writes', 'One machine', 'How many simple writes a second can one relational database primary take?', 'rate', '5000-20000 /s', 'About 5k to 20k a second; reads go higher.'),
    ('cap-db-size', 'One machine', 'Up to what size is a single relational database comfortable?', 'size', '1-5 TB', 'Up to a few TB before backups, restores and migrations get slow.'),
    ('cap-kafka', 'One machine', 'How much data a second can one Kafka broker take?', 'bandwidth', '100-500 MB/s', 'Hundreds of MB a second.'),
    ('cap-nvme-iops', 'One machine', 'How many random reads a second (IOPS) can one NVMe SSD do?', 'rate', '100000-1000000 /s', '100k and more.'),
    ('cap-nvme-seq', 'One machine', 'How fast can one NVMe SSD read sequentially?', 'bandwidth', '1-3 GB/s', 'About 1 to 3 GB a second.'),
    ('cap-hdd-iops', 'One machine', 'How many random reads a second (IOPS) can one spinning HDD do?', 'rate', '100-200 /s', 'About 100 to 200: each one costs a seek.'),
    ('cap-hdd-seq', 'One machine', 'How fast can one spinning HDD read sequentially?', 'bandwidth', '100-200 MB/s', 'About 100 to 200 MB a second.'),
    ('cap-gateway', 'One machine', 'How many mostly idle connections can one real-time gateway hold?', 'count', '100 thousand-1 million', 'About 100k to 1M, limited by memory.'),
    # Availability
    ('nines-2-year', 'Availability', 'At 99% availability, how much downtime is allowed per year?', 'time', '3.7 days', '1% of 365 days ≈ 3.7 days.'),
    ('nines-2-month', 'Availability', 'At 99% availability, how much downtime is allowed per 30 days?', 'time', '7.2 hours', '1% of 720 hours = 7.2 hours.'),
    ('nines-3-year', 'Availability', 'At 99.9% availability, how much downtime is allowed per year?', 'time', '8.8 hours', '0.1% of 8,760 hours ≈ 8.8 hours.'),
    ('nines-3-month', 'Availability', 'At 99.9% availability, how much downtime is allowed per 30 days?', 'time', '43 minutes', '0.1% of 43,200 minutes ≈ 43 minutes.'),
    ('nines-4-year', 'Availability', 'At 99.99% availability, how much downtime is allowed per year?', 'time', '53 minutes', '0.01% of 525,600 minutes ≈ 53 minutes.'),
    ('nines-4-month', 'Availability', 'At 99.99% availability, how much downtime is allowed per 30 days?', 'time', '4.3 minutes', '0.01% of 43,200 minutes ≈ 4.3 minutes.'),
    ('nines-5-year', 'Availability', 'At 99.999% availability, how much downtime is allowed per year?', 'time', '5.3 minutes', '0.001% of 525,600 minutes ≈ 5 minutes.'),
    ('nines-5-month', 'Availability', 'At 99.999% availability, how much downtime is allowed per 30 days?', 'time', '26 s', '0.001% of 2.6 million seconds ≈ 26 seconds.'),
    ('nines-serial', 'Availability', 'A request needs five services, each 99.9% available. What percentage of the time is it unavailable?', 'percent', '0.5 %', 'Required dependencies add their failure rates: 5 × 0.1% = 0.5%, so about 99.5% available.'),
    ('nines-parallel', 'Availability', 'Two independent replicas, each 99% available, and either will do. What percentage of the time are both down?', 'percent', '0.01 %', 'Redundant copies multiply their failures: 0.01 × 0.01 = 0.0001, which is 0.01%.'),
    # Rules of thumb
    ('rule-peak', 'Rules of thumb', 'Peak traffic is how many times the daily average, for a typical product?', 'ratio', '2-3 ×', 'About 2 to 3×; spiky products reach 10×.'),
    ('rule-read-write', 'Rules of thumb', 'For content and social products, reads outnumber writes by how many times?', 'ratio', '10-100 ×', 'About 10:1 to 100:1.'),
    ('rule-hot-set', 'Rules of thumb', 'What percentage of items typically get about 80% of requests?', 'percent', '20 %', 'About 20%, so caching the hot set covers most reads.'),
    ('rule-little-1', 'Rules of thumb', 'At 2,000 requests a second with 50 ms in the service, how many requests are in flight?', 'count', '100', 'Little\'s Law: rate × time = 2,000 × 0.05 = 100.'),
    ('rule-little-2', 'Rules of thumb', 'At 500 requests a second with 200 ms in the service, how many requests are in flight?', 'count', '100', 'Little\'s Law: 500 × 0.2 = 100.'),
    ('rule-little-3', 'Rules of thumb', 'At 10,000 requests a second with 30 ms each, how many requests are in flight?', 'count', '300', 'Little\'s Law: 10,000 × 0.03 = 300.'),
    ('rule-fanout', 'Rules of thumb', 'A page fans out to 20 calls, each slow 1% of the time. What percentage of page loads hit a slow call?', 'percent', '18-20 %', 'N × p = 20 × 1% = 20% (exactly 1 − 0.99²⁰ ≈ 18%).'),
    ('rule-fanout-2', 'Rules of thumb', 'A request fans out to 50 shards, each slow 0.1% of the time. What percentage of requests hit a slow shard?', 'percent', '5 %', 'N × p = 50 × 0.1% = 5%.'),
    ('rule-utilisation', 'Rules of thumb', 'What utilisation should you aim for at peak?', 'percent', '60-70 %', 'About 60 to 70%, because queueing delay grows like ρ/(1−ρ).'),
    ('rule-queue-90', 'Rules of thumb', 'At 90% utilisation, waits are roughly how many times the service time?', 'ratio', '9 ×', 'ρ/(1−ρ) = 0.9 / 0.1 = 9.'),
    ('rule-replicas', 'Rules of thumb', 'How many copies of the data is the usual replication default?', 'count', '3', 'Three copies: one can fail while another is being rebuilt.'),
    ('rule-index', 'Rules of thumb', 'How much do indexes typically add to storage, as a percentage?', 'percent', '20-100 %', 'About 20 to 100% on top of the data.'),
    # AI and LLM systems
    ('llm-chars', 'LLMs', 'How many characters of English is one token, roughly?', 'count', '4', 'About 4 characters, or 0.75 words.'),
    ('llm-words', 'LLMs', 'How many English words are 1,000 tokens, roughly?', 'count', '750', '1 token ≈ 0.75 words, so about 750 words: a page and a half.'),
    ('llm-out-price', 'LLMs', 'Output tokens cost how many times input tokens?', 'ratio', '4-8 ×', 'About 4 to 8× (5× for Claude).'),
    ('llm-cache-read', 'LLMs', 'A prompt-cache read costs what multiple of normal input?', 'ratio', '0.1 ×', 'About 0.1×, a 90% discount.'),
    ('llm-cache-write', 'LLMs', 'A prompt-cache write (5-minute lifetime) costs what multiple of normal input?', 'ratio', '1.25 ×', 'About 1.25×; a 1-hour cache costs more.'),
    ('llm-batch', 'LLMs', 'What percentage discount does a batch API give?', 'percent', '50 %', 'About 50% off, with results within 24 hours.'),
    ('llm-context', 'LLMs', 'How many tokens fit in the context window of a current frontier model?', 'count', '200 thousand-1 million', 'About 200k to 1M tokens.'),
    ('llm-ttft', 'LLMs', 'What is the time to first token for a short prompt?', 'time', '0.3-1 s', 'About 0.3 to 1 s; longer with long prompts or thinking.'),
    ('llm-speed', 'LLMs', 'How many output tokens a second does one stream from a frontier model produce?', 'rate', '50-150 /s', 'About 50 to 150 tokens a second; small models are faster.'),
    ('llm-500', 'LLMs', 'How long does a 500-token answer take to stream in full?', 'time', '3-10 s', 'At 50 to 150 tokens a second, about 5 s.'),
    ('llm-7b-fp16', 'LLMs', 'How much memory do the weights of a 7B model take in FP16?', 'size', '14 GB', '7 billion params × 2 bytes = 14 GB.'),
    ('llm-70b-fp16', 'LLMs', 'How much memory do the weights of a 70B model take in FP16?', 'size', '140 GB', '70 billion × 2 bytes = 140 GB: two H100s.'),
    ('llm-70b-int4', 'LLMs', 'How much memory do the weights of a 70B model take at INT4?', 'size', '35 GB', '70 billion × 0.5 bytes = 35 GB.'),
    ('llm-train-bytes', 'LLMs', 'How many bytes per parameter does mixed-precision training with Adam need, before activations?', 'size', '16 bytes', 'About 16 bytes: weights, gradients, a full-precision copy and two Adam moments.'),
    ('llm-train-7b', 'LLMs', 'How much memory does training a 7B model take, before activations?', 'size', '110 GB', '7 billion × 16 bytes ≈ 110 GB.'),
    ('llm-kv-token', 'LLMs', 'How much KV cache does one token take, for an 8B to 70B open model in FP16?', 'size', '0.1-0.3 MB', 'About 0.1 to 0.3 MB per token.'),
    ('llm-kv-100k', 'LLMs', 'How much KV cache does a 100k-token context take, for an 8B to 70B model in FP16?', 'size', '10-30 GB', '100k × 0.1 to 0.3 MB = 10 to 30 GB.'),
    ('llm-flops-token', 'LLMs', 'How many FLOPs does a 7B model spend per generated token?', 'count', '14 billion', 'About 2 × params = 14 billion.'),
    ('llm-chinchilla', 'LLMs', 'Compute-optimal training uses about how many tokens per parameter?', 'count', '20', 'About 20 tokens per parameter.'),
    ('llm-decode', 'LLMs', 'What is the single-stream decode ceiling for an 8B FP16 model (16 GB) on an H100 (3.35 TB/s)?', 'rate', '200 /s', '3.35 TB/s ÷ 16 GB ≈ 200 tokens a second: each token reads every weight once.'),
    ('hw-h100-mem', 'LLMs', 'How much HBM does an H100 have?', 'size', '80 GB', '80 GB.'),
    ('hw-h100-bw', 'LLMs', 'What is an H100\'s memory bandwidth?', 'bandwidth', '3.35 TB/s', 'About 3.35 TB/s.'),
    ('hw-h100-flops', 'LLMs', 'How many dense BF16 TFLOPS does an H100 do?', 'count', '1000', 'About 1,000 TFLOPS.'),
    ('hw-4090', 'LLMs', 'How much memory does an RTX 4090 have?', 'size', '24 GB', '24 GB. Consumer GPUs range from 8 to 32 GB.'),
    ('hw-nvlink', 'LLMs', 'What is H100 NVLink bandwidth per direction?', 'bandwidth', '450 GB/s', 'About 450 GB/s each way, 900 GB/s total.'),
    ('hw-pcie', 'LLMs', 'What is PCIe 5 x16 bandwidth per direction?', 'bandwidth', '64 GB/s', 'About 64 GB/s, a seventh of NVLink.'),
    ('rag-vector', 'LLMs', 'How big is one 1,536-dimension float32 embedding?', 'size', '6 KB', '1,536 × 4 bytes ≈ 6 KB.'),
    ('rag-1m', 'LLMs', 'How big is an index of 1 million 1,536-dimension float32 vectors, before overhead?', 'size', '6 GB', '1M × 6 KB = 6 GB.'),
    ('rag-100m', 'LLMs', 'How big is an index of 100 million 1,536-dimension float32 vectors, before overhead?', 'size', '600 GB', '100M × 6 KB = 600 GB; int8 quantisation cuts it 4×.'),
    ('rag-hnsw', 'LLMs', 'How long does an approximate nearest-neighbour (HNSW) search take?', 'time', '1-10 ms', 'About 1 to 10 ms at 95 to 99% recall.'),
]


class UnitError(ValueError):
    pass


def unit_size(kind, text):
    """Size of a unit written as text (label or alias) in the kind's base unit, or None."""
    t = ' '.join(str(text or '').strip().lower().split())
    for label, aliases, size in UNITS[kind]:
        if t == label.lower() or t in aliases:
            return size
    return None


def _plain(text):
    """Superscript powers as ^n, and a real minus sign."""
    return re.sub(r'[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+', lambda m: '^' + m.group(0).translate(SUPER), str(text)).replace('−', '-')


def _one(text, kind):
    """One typed value as (number, size of its unit or None when no unit was typed)."""
    m = VALUE.match(text)
    if not m:
        raise UnitError('Type a number, like 250, 1.5k or 3e6.')
    bare, mant, exp, rest = m.groups()
    n = 10.0 ** int(bare) if bare is not None else float(mant.replace(',', '')) * (10.0 ** int(exp) if exp else 1)
    if not rest:
        return n, None
    size = unit_size(kind, rest)
    if size is not None:
        return n, size
    low = rest.lower()
    for word in sorted(SCALE, key=len, reverse=True):
        if low.startswith(word):
            tail = rest[len(word):].strip()
            tail_size = unit_size(kind, tail) if tail else None
            if tail_size is not None:
                return n * SCALE[word], tail_size
            if not tail:
                return n * SCALE[word], None
    raise UnitError(f'"{rest}" is not a unit for this question.')


def parse(text, kind, unit=''):
    """A typed answer as (lo, hi) in the kind's base unit. A unit typed after the number wins over the
    dropdown's; a range like "20-100 µs" is allowed. Raises UnitError for anything unreadable. Pure."""
    raw = _plain(text).strip()
    parts = RANGE.split(raw, maxsplit=1)
    got = [_one(p, kind) for p in parts]
    fallback = next((s for _, s in reversed(got) if s is not None), None)
    if fallback is None:
        fallback = unit_size(kind, unit) if unit else unit_size(kind, '')
        if fallback is None:
            raise UnitError('Choose a unit.')
    vals = sorted(n * (s if s is not None else fallback) for n, s in got)
    return vals[0], vals[-1]


def typed_unit(text, kind):
    """Whether the answer carries its own unit (or magnitude word)."""
    try:
        return any(_one(p, kind)[1] is not None for p in RANGE.split(_plain(text).strip(), maxsplit=1))
    except UnitError:
        return False


def _answer(spec, kind):
    lo, hi = parse(spec, kind)
    if lo <= 0:
        raise ValueError(f'answer must be positive: {spec}')
    return lo, hi


QUESTIONS = {}
for _qid, _topic, _prompt, _kind, _spec, _why in QUESTIONS_RAW:
    assert _qid not in QUESTIONS, _qid
    assert _kind in UNITS, _kind
    QUESTIONS[_qid] = {'id': _qid, 'topic': _topic, 'prompt': _prompt, 'kind': _kind, 'answer': _answer(_spec, _kind),
                       'shown': re.sub(r'(?<![\d.])\d{4,}', lambda m: f'{int(m.group(0)):,}', re.sub(r' (/s|%|×)', r'\1', RANGE.sub(' to ', _spec))),
                       'why': _why}

# Bands, best first: (id, worst ratio to the answer, correct?, label).
BANDS = [('exact', 1.25, True, 'Correct'), ('close', 2.0, True, 'Correct, within 2×'),
         ('off', 10.0, False, 'Not quite: within 10×'), ('far', 100.0, False, 'Wrong: 10× to 100× out'),
         ('wild', math.inf, False, 'Wrong: more than 100× out')]
LABEL = {b[0]: b[3] for b in BANDS} | {'skip': 'Skipped'}
CORRECT = {b[0] for b in BANDS if b[2]}
WRONG_GAP = {'off': 6, 'far': 3, 'wild': 2, 'skip': 3}
RIGHT_GAPS = [10, 25, 60, 150, 350]


def ratio(lo, hi, answer):
    """How far a typed value or range is from the answer's range, as a factor ≥ 1. Pure."""
    a_lo, a_hi = answer
    if lo <= 0 or hi <= 0:
        return math.inf
    mid = math.sqrt(lo * hi)
    if a_lo <= mid <= a_hi:
        return 1.0
    return a_lo / mid if mid < a_lo else mid / a_hi


def band(r):
    return next(b[0] for b in BANDS if r <= b[1])


def schedule(card, b, turn):
    """The card after an answer in band b on answer number `turn`. Pure."""
    card = dict(card or {})
    card['seen'] = card.get('seen', 0) + 1
    card['band'] = b
    if b in CORRECT:
        streak = card.get('streak', 0) + (1 if b == 'exact' else 0) or 1
        gap = RIGHT_GAPS[min(streak, len(RIGHT_GAPS)) - 1]
        card['streak'] = streak
        card['due'] = turn + (gap if b == 'exact' else max(8, gap // 2))
    else:
        card['streak'] = 0
        card['misses'] = card.get('misses', 0) + 1
        card['due'] = turn + WRONG_GAP[b]
    return card


def pick(cards, turn, last, seed):
    """The next question: the most overdue card, else a new one, else the one due soonest. Never the
    question just answered. Pure."""
    rng = random.Random(f'{seed}:{turn}')
    ids = [q for q in QUESTIONS if q != last]
    due = [q for q in ids if q in cards and cards[q]['due'] <= turn]
    if due:
        return min(due, key=lambda q: (cards[q]['due'], rng.random()))
    new = [q for q in ids if q not in cards]
    if new:
        return rng.choice(new)
    return min(ids, key=lambda q: (cards[q]['due'], rng.random()))


def public(q):
    return {'id': q['id'], 'topic': q['topic'], 'prompt': q['prompt'], 'kind': q['kind'],
            'units': [u[0] for u in UNITS[q['kind']]], 'unit': DEFAULT[q['kind']]}


def summary(doc):
    log = doc.get('log') or []
    cards = doc.get('cards') or {}
    return {'log': log[-WINDOW:], 'window': WINDOW, 'answered': doc.get('turn', 0),
            'seen': len(cards), 'total': len(QUESTIONS),
            'secure': sum(1 for c in cards.values() if c.get('streak', 0) >= 2)}


# ---------- API ----------
def store_for(uid: str = Depends(auth.require_user)):
    return get_store(uid)


def _save(store, doc):
    try:
        return store.put_design_record(KEY, doc, doc.get('revision'))
    except ValueError as exc:
        raise HTTPException(409, 'The drill changed in another tab. Reload to carry on.') from exc


def _state(store):
    doc = store.get_design_record(KEY)
    if not doc or doc.get('kind') != 'numbers_drill':
        doc = {'kind': 'numbers_drill', 'turn': 0, 'cards': {}, 'log': [], 'current': None, 'seed': random.randrange(1 << 30)}
    if doc.get('current') not in QUESTIONS:
        doc['current'] = pick(doc['cards'], doc['turn'], None, doc['seed'])
        doc = _save(store, doc)
    return doc


class NumbersAnswer(BaseModel):
    question_id: str
    value: str = Field(default='', max_length=80)
    unit: str = Field(default='', max_length=40)
    skip: bool = False


@router.get('/numbers')
def numbers_state(store=Depends(store_for)):
    doc = _state(store)
    return {'question': public(QUESTIONS[doc['current']]), **summary(doc)}


@router.post('/numbers/answer')
def numbers_answer(body: NumbersAnswer, store=Depends(store_for)):
    doc = _state(store)
    q = QUESTIONS.get(body.question_id)
    if not q:
        raise HTTPException(404, 'Unknown question')
    if body.skip:
        b, given, r = 'skip', '', None
    else:
        try:
            lo, hi = parse(body.value, q['kind'], body.unit)
        except UnitError as exc:
            raise HTTPException(422, str(exc)) from exc
        r = ratio(lo, hi, q['answer'])
        b = band(r)
        unit = '' if typed_unit(body.value, q['kind']) or body.unit in ('(number)', '%', '×') else ' ' + body.unit
        given = body.value.strip() + unit
    turn = doc['turn'] + 1
    doc['turn'] = turn
    doc['cards'][q['id']] = schedule(doc['cards'].get(q['id']), b, turn)
    doc['log'] = (doc.get('log') or [])[-(LOG - 1):] + [{'q': q['id'], 'band': b, 'given': given, 'at': int(time.time())}]
    doc['current'] = pick(doc['cards'], turn, q['id'], doc['seed'])
    doc = _save(store, doc)
    result = {'question_id': q['id'], 'band': b, 'label': LABEL[b], 'correct': b in CORRECT, 'given': given,
              'answer': q['shown'], 'why': q['why'], 'factor': None if r is None or math.isinf(r) else round(r, 1),
              'back_in': doc['cards'][q['id']]['due'] - turn}
    return {'result': result, 'question': public(QUESTIONS[doc['current']]), **summary(doc)}
