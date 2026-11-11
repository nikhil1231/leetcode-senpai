"""Derived questions for the numbers drill: endless sums built from the base numbers.

Each template takes a few parameters from fixed lists and the base answers it rests on (the same
QUESTIONS the base drill asks), and computes its answer with interval arithmetic, so a base answer
that is a range ("20 to 100 µs") carries through as a range and grading is the base drill's own
ratio and bands. A question's id spells out its template and parameters, so the server rebuilds and
re-checks it from the id alone. Most templates use one or two base numbers; a few use three.
Picking is seeded and pure: of a few candidates, the one resting on the weakest base cards wins.
"""
import math
import random

from . import system_design_numbers as nd

TEMPLATES = {}


def template(name, topic, kind, *options, weight=1):
    """Register a builder: f(*params) -> (prompt, answer interval, why, parts) or None to skip."""
    def wrap(f):
        TEMPLATES[name] = {'name': name, 'topic': topic, 'kind': kind, 'options': options, 'weight': weight, 'build': f}
        return f
    return wrap


# ---------- interval arithmetic over (lo, hi), all positive ----------
def B(qid):
    return nd.QUESTIONS[qid]['answer']


def k(v):
    return (v, v)


def mul(*xs):
    return (math.prod(x[0] for x in xs), math.prod(x[1] for x in xs))


def div(a, b):
    return (a[0] / b[1], a[1] / b[0])


def add(*xs):
    return (sum(x[0] for x in xs), sum(x[1] for x in xs))


# ---------- formatting ----------
SUP = str.maketrans('0123456789-', '⁰¹²³⁴⁵⁶⁷⁸⁹⁻')


def sig(v):
    """v to three significant figures, with thousands separators."""
    if v == 0:
        return '0'
    r = round(v, 2 - int(math.floor(math.log10(abs(v)))))
    if abs(r) >= 1000:
        return f'{int(round(r)):,}'
    return f'{r:.12f}'.rstrip('0').rstrip('.')


def words(v):
    """A count in words past ten thousand: 50 million, 2.5 billion."""
    if v >= 1e16:
        e = int(math.floor(math.log10(v)))
        return f'{sig(v / 10 ** e)} × 10{str(e).translate(SUP)}'
    for size, w in ((1e15, 'quadrillion'), (1e12, 'trillion'), (1e9, 'billion'), (1e6, 'million'), (1e4, 'thousand')):
        if v >= size:
            return f'{sig(v / (1e3 if size == 1e4 else size))} {w}'
    return sig(v)


def fmt(kind, v):
    if kind == 'count':
        return words(v)
    if kind == 'rate':
        return f'{sig(v / 1e3)} thousand/s' if 1e4 <= v < 1e6 else (f'{words(v)}/s' if v >= 1e6 else f'{sig(v)}/s')
    if kind == 'percent':
        return f'{sig(v)}%'
    if kind == 'ratio':
        return f'{sig(v)}×'
    if kind == 'distance':
        return f'{sig(v)} km'
    units = [u for u in nd.UNITS[kind] if not u[0].endswith('bps')]
    label, _, size = next((u for u in reversed(units) if v >= u[2] * 0.9995), units[0])
    n = v / size
    if kind == 'size' and label == 'bytes' and sig(n) == '1':
        label = 'byte'
    return f'{sig(n)} {label}'


def shown(kind, lo, hi):
    if hi / lo <= 1.15:
        return fmt(kind, math.sqrt(lo * hi))
    return f'{fmt(kind, lo)} to {fmt(kind, hi)}'


def said(qid):
    """A base answer as the lesson gives it, for the working."""
    return nd.QUESTIONS[qid]['shown']


# ---------- templates ----------
PERIOD = {'hours': (k(3600), ['secs-day'], 'An hour is 3,600 s'), 'days': (k(86400), ['secs-day'], 'A day is 86,400 s'),
          'weeks': (k(7 * 86400), ['secs-day'], 'A week is 7 × 86,400 ≈ 605,000 s'),
          'months': ((30 * 86400, 365 / 12 * 86400), ['secs-month'], 'A month is about 2.6 million s'),
          'years': (k(365 * 86400), ['secs-year'], 'A year is about 31.5 million s')}
TARGET = {'seconds': 1, 'minutes': 60, 'hours': 3600}
PER = {'minutes': 'A minute is 60 s', 'hours': 'An hour is 3,600 s'}


@template('span', 'Time', 'count', ['2', '3', '6', '9', '10', '18', '30', '100'], list(PERIOD), list(TARGET), weight=3)
def _span(n, period, target):
    secs, parts, note = PERIOD[period]
    if TARGET[target] >= secs[0] or (target != 'seconds' and period == 'hours'):
        return None
    n = int(n)
    ans = div(mul(k(n), secs), k(TARGET[target]))
    secs_total = (n * secs[0], n * secs[1])
    tail = '' if target == 'seconds' else f' {PER[target]}, so divide by {TARGET[target]:,}: {shown("count", *ans)}.'
    return (f'How many {target} are in {n} {period}?', ans,
            f'{note}, so {n} {period} is {shown("count", *secs_total)} s.{tail}', parts)


SPAN_RATE = {'day': ('secs-day', 86400), 'month': ('secs-month', 2.6e6), 'year': ('secs-year', 31.5e6)}
VOLUMES = ['200000', '2000000', '5000000', '20000000', '30000000', '200000000', '500000000', '2000000000', '5000000000']


@template('per', 'Time', 'rate', VOLUMES, list(SPAN_RATE), weight=3)
def _per(n, span):
    qid, secs = SPAN_RATE[span]
    n = float(n)
    ans = div(k(n), B(qid))
    return (f'{words(n).capitalize()} requests a {span} is what average rate?', ans,
            f'{words(n)} ÷ {words(secs)} s in a {span} ≈ {shown("rate", *ans)}.', [qid])


@template('peak', 'Time', 'rate', VOLUMES, ['2', '3', '5', '10'], weight=2)
def _peak(n, f):
    n, f = float(n), int(f)
    ans = mul(div(k(n), B('secs-day')), k(f))
    avg = n / 86400
    return (f'{words(n).capitalize()} requests a day, with the peak at {f}× the average. What is the peak rate?', ans,
            f'{words(n)} ÷ 86,400 ≈ {fmt("rate", avg)} on average; × {f} ≈ {shown("rate", *ans)} at peak.', ['secs-day', 'rule-peak'])


@template('daily', 'Time', 'count', ['5', '30', '200', '1000', '3000', '20000', '100000'], weight=2)
def _daily(r):
    r = float(r)
    ans = mul(k(r), B('secs-day'))
    return (f'A service averages {sig(r)} requests a second. How many is that a day?', ans,
            f'{sig(r)} × 86,400 ≈ {shown("count", *ans)}. With the 10⁵ shortcut, {words(r * 1e5)}.', ['secs-day'])


ITEMS = {'message': ('short text messages, with their metadata', 'size-message'),
         'photo': ('compressed photos', 'size-photo'), 'timestamp': ('64-bit timestamps', 'size-int64'),
         'uuid': ('UUIDs stored as binary', 'size-uuid'), 'vector': ('1,536-dimension float32 embeddings', 'rag-vector')}


@template('store', 'Sizes', 'size', ['1000000', '10000000', '100000000', '1000000000'], list(ITEMS), ['day', 'year'], weight=3)
def _store(n, item, span):
    n = float(n)
    what, qid = ITEMS[item]
    days = 1 if span == 'day' else 365
    ans = mul(k(n * days), B(qid))
    lead = f'{words(n)} × {said(qid)}' if span == 'day' else f'{words(n)} × 365 days × {said(qid)}'
    return (f'You store {words(n)} new {what} a day. How much space does a {span} of them take?', ans,
            f'{lead} ≈ {shown("size", *ans)}, before replication.', [qid])


@template('replicas', 'Sizes', 'size', ['2', '20', '300'], ['GB', 'TB'], weight=1)
def _replicas(n, unit):
    raw = float(n) * (1e9 if unit == 'GB' else 1e12)
    ans = mul(k(raw), B('rule-replicas'))
    return (f'A dataset is {n} {unit}. How much disk does it take with the usual replication?', ans,
            f'The usual default is 3 copies: 3 × {n} {unit} = {shown("size", *ans)}.', ['rule-replicas'])


LINKS = ['0.1', '1', '10', '25', '100', '400']


@template('bytes', 'Sizes', 'bandwidth', LINKS)
def _bytes(g):
    if g in ('1', '10'):
        return None
    ans = mul(k(float(g)), B('gbps-1'))
    return (f'A link runs at {gbps(g)}. How many bytes a second is that?', ans,
            f'Network speeds are in bits: {gbps(g)} ÷ 8 = {shown("bandwidth", *ans)}.', ['gbps-1'])


def gbps(g):
    return f'{sig(float(g) * 1000)} Mbps' if float(g) < 1 else f'{g} Gbps'


DATA = {'100MB': 1e8, '1GB': 1e9, '10GB': 1e10, '100GB': 1e11, '1TB': 1e12, '10TB': 1e13}


def amount(x):
    return x[:-2] + ' ' + x[-2:]


@template('send', 'Latency', 'time', list(DATA), ['1', '10', '100'], weight=2)
def _send(x, g):
    ans = div(k(DATA[x]), mul(k(float(g)), B('gbps-1')))
    rate = mul(k(float(g)), B('gbps-1'))
    return (f'How long does it take to send {amount(x)} over a {g} Gbps link, at full speed?', ans,
            f'{g} Gbps ÷ 8 = {fmt("bandwidth", rate[0])}; {amount(x)} ÷ {fmt("bandwidth", rate[0])} ≈ {shown("time", *ans)}.', ['gbps-1'])


MEDIA = {'memory': ('memory', 'lat-mem-1mb'), 'ssd': ('an NVMe SSD', 'cap-nvme-seq'), 'hdd': ('a spinning HDD', 'cap-hdd-seq')}


@template('scan', 'Latency', 'time', list(DATA), list(MEDIA), weight=2)
def _scan(x, m):
    where, qid = MEDIA[m]
    if m == 'memory':
        ans = mul(k(DATA[x] / 1e6), B(qid))
        why = f'1 MB takes about 10 µs, so {amount(x)} is {words(DATA[x] / 1e6)} × 10 µs ≈ {shown("time", *ans)}.'
    else:
        ans = div(k(DATA[x]), B(qid))
        why = f'{amount(x)} at {said(qid)} ≈ {shown("time", *ans)}.'
    return f'How long does it take to read {amount(x)} sequentially from {where}?', ans, why, [qid]


OPS = {'mem': ('a main memory reference', 'lat-mem'), 'ssd': ('a random read from an NVMe SSD', 'lat-ssd-random'),
       'hdd': ('a seek on a spinning HDD', 'lat-hdd-seek'), 'l1': ('an L1 cache reference', 'lat-l1'),
       'ssd1mb': ('a 1 MB sequential read from an SSD', 'lat-ssd-1mb'), 'mem1mb': ('a 1 MB sequential read from memory', 'lat-mem-1mb'),
       'dc': ('a round trip within a datacentre', 'lat-dc-rtt'), 'az': ('a round trip between availability zones', 'lat-az-rtt'),
       'coast': ('a round trip between the US coasts', 'lat-us-rtt'), 'atlantic': ('a round trip between New York and London', 'lat-ny-london')}


@template('repeat', 'Latency', 'time', ['10', '100', '1000', '10000'], list(OPS), weight=2)
def _repeat(n, op):
    what, qid = OPS[op]
    ans = mul(k(float(n)), B(qid))
    return (f'How long does {what} take {int(n):,} times over, one after another?', ans,
            f'{int(n):,} × {said(qid)} ≈ {shown("time", *ans)}.', [qid])


@template('slower', 'Latency', 'ratio', list(OPS), list(OPS), weight=2)
def _slower(a, b):
    (wa, qa), (wb, qb) = OPS[a], OPS[b]
    ans = div(B(qa), B(qb))
    if a == b or ans[0] < 4:
        return None
    return (f'How many times longer does {wa} take than {wb}?', ans,
            f'{said(qa)} against {said(qb)}: about {shown("ratio", *ans)}.', [qa, qb])


WHERE = {'dc': ('on another machine in the same datacentre', 'lat-dc-rtt'),
         'az': ('in another availability zone of the same region', 'lat-az-rtt'),
         'coast': ('in a datacentre on the other US coast', 'lat-us-rtt'),
         'atlantic': ('in London, called from New York', 'lat-ny-london'),
         'australia': ('in Australia, called from Europe', 'lat-eu-au')}
LOCAL = {k_: OPS[k_] for k_ in ('mem', 'ssd', 'hdd', 'ssd1mb', 'mem1mb')}


@template('remote', 'Latency', 'time', list(LOCAL), list(WHERE), weight=3)
def _remote(op, loc):
    (what, qop), (place, qloc) = LOCAL[op], WHERE[loc]
    ans = add(B(qop), B(qloc))
    return (f'A request asks for {what} on a server {place}. How long until the answer is back?', ans,
            f'One round trip ({said(qloc)}) plus the read ({said(qop)}) ≈ {shown("time", *ans)}.', [qloc, qop])


@template('chain', 'Latency', 'time', list(LOCAL), list(LOCAL), list(WHERE), weight=1)
def _chain(a, b, loc):
    (wa, qa), (wb, qb), (place, qloc) = LOCAL[a], LOCAL[b], WHERE[loc]
    if a == b:
        return None
    ans = add(B(qa), B(qloc), B(qb))
    return (f'A service does {wa} locally, then {wb} on a server {place}. How long does it take in all?', ans,
            f'{said(qa)} + a round trip of {said(qloc)} + {said(qb)} ≈ {shown("time", *ans)}.', [qa, qloc, qb])


@template('fibre', 'Latency', 'time', ['300', '1000', '2500', '4000', '8000', '12000', '16000'], weight=2)
def _fibre(d):
    d = float(d)
    ans = div(k(2 * d), mul(B('lat-fibre'), k(1000)))
    return (f'What is the round trip over {sig(d)} km of fibre, ignoring routing?', ans,
            f'There and back is {sig(2 * d)} km, at about 200 km per ms: {shown("time", *ans)}.', ['lat-fibre', 'lat-100km'])


NINES = {'2': 0.99, '3': 0.999, '4': 0.9999, '5': 0.99999}
PCT = {'2': '99', '3': '99.9', '4': '99.99', '5': '99.999'}
WINDOWS = {'day': 86400, 'week': 7 * 86400, 'quarter': 91 * 86400}


@template('downtime', 'Availability', 'time', list(NINES), list(WINDOWS), weight=2)
def _downtime(n, w):
    a = NINES[n]
    ans = k((1 - a) * WINDOWS[w])
    return (f'At {PCT[n]}% availability, how much downtime is allowed per {w}?', ans,
            f'{sig((1 - a) * 100)}% of a {w} ({words(WINDOWS[w])} s) ≈ {shown("time", *ans)}.', [f'nines-{n}-year', f'nines-{n}-month'])


@template('serial', 'Availability', 'percent', ['2', '3', '10', '20'], ['2', '3', '4'], weight=2)
def _serial(m, n):
    a, m = NINES[n], int(m)
    ans = ((1 - a ** m) * 100, m * (1 - a) * 100)
    return (f'A request needs {m} services, each {PCT[n]}% available. What percentage of the time is it unavailable?', ans,
            f'Required dependencies add their failure rates: {m} × {sig((1 - a) * 100)}% ≈ {fmt("percent", ans[1])}.', ['nines-serial'])


@template('parallel', 'Availability', 'percent', ['2', '3'], ['2', '3'], weight=1)
def _parallel(m, n):
    a, m = NINES[n], int(m)
    if m == 3 and n != '2':
        return None
    ans = k((1 - a) ** m * 100)
    return (f'{m} independent replicas, each {PCT[n]}% available, and any one will do. What percentage of the time are all of them down?', ans,
            f'Redundant copies multiply their failures: {sig(1 - a)}{"²" if m == 2 else "³"} = {sig((1 - a) ** m)}, which is {fmt("percent", ans[0])}.', ['nines-parallel'])


@template('little', 'Rules of thumb', 'count', ['100', '800', '3000', '20000', '50000'], ['5', '20', '120', '400', '2000'], weight=2)
def _little(r, ms):
    r, s = float(r), float(ms) / 1000
    ans = k(r * s)
    return (f'At {sig(r)} requests a second with {int(ms):,} ms in the service, how many requests are in flight?', ans,
            f"Little's Law: rate × time = {sig(r)} × {sig(s)} s = {shown('count', *ans)}.", ['rule-little-1'])


@template('inflight', 'Rules of thumb', 'count', ['1000', '10000'], list(WHERE), weight=1)
def _inflight(r, loc):
    place, qloc = WHERE[loc]
    ans = mul(k(float(r)), B(qloc))
    return (f'A service handles {sig(float(r))} requests a second, and each waits on one call to a server {place}. About how many of those calls are in flight?', ans,
            f"Little's Law: {sig(float(r))}/s × {said(qloc)} ≈ {shown('count', *ans)}.", ['rule-little-1', qloc])


@template('fanout', 'Rules of thumb', 'percent', ['5', '10', '30', '100'], ['0.1', '0.5', '1'], weight=2)
def _fanout(n, p):
    n, p = int(n), float(p) / 100
    exact = (1 - (1 - p) ** n) * 100
    ans = (exact, max(exact, min(n * p * 100, 100)))
    return (f'A request fans out to {n} calls, each slow {sig(p * 100)}% of the time. What percentage of requests hit at least one slow call?', ans,
            f'N × p = {n} × {sig(p * 100)}% = {sig(n * p * 100)}%; exactly 1 − {sig(1 - p)}^{n} ≈ {sig(exact)}%.', ['rule-fanout'])


@template('servers', 'One machine', 'count', ['20000', '100000', '500000'], ['app', 'redis', 'db'], weight=2)
def _servers(r, what):
    r = float(r)
    noun, qid, verb = {'app': ('stateless app servers', 'cap-app', 'simple requests'),
                       'redis': ('Redis nodes', 'cap-redis', 'cache operations'),
                       'db': ('relational database primaries', 'cap-db-writes', 'simple writes')}[what]
    if what == 'redis' and r < 1e5:
        return None
    ans = div(k(r), B(qid))
    return (f'At {words(r)} {verb} a second, how many {noun} do you need, before headroom?', ans,
            f'One takes {said(qid)}, so {words(r)}/s needs {shown("count", *ans)}.', [qid])


PRECISION = {'FP16': (2, 'llm-bytes-fp16'), 'INT8': (1, 'llm-bytes-int8'), 'INT4': (0.5, 'llm-bytes-int4')}
PARAMS = ['1', '3', '8', '13', '34', '70', '180', '405']


@template('weights', 'LLMs', 'size', PARAMS, list(PRECISION), weight=3)
def _weights(p, prec):
    by, qid = PRECISION[prec]
    ans = mul(k(float(p) * 1e9), B(qid))
    return (f'How much memory do the weights of a {p}B model take at {prec}?', ans,
            f'{p} billion params × {sig(by)} byte{"s" if by != 1 else ""} = {shown("size", *ans)}.', [qid])


@template('gpus', 'LLMs', 'count', PARAMS, list(PRECISION), weight=2)
def _gpus(p, prec):
    by, qid = PRECISION[prec]
    need = float(p) * 1e9 * by / B('hw-h100-mem')[0]
    if need < 1.2:
        return None
    ans = k(float(math.ceil(need)))
    return (f'How many H100s does it take just to hold the weights of a {p}B model at {prec}?', ans,
            f'{p}B × {sig(by)} bytes = {fmt("size", float(p) * 1e9 * by)}; at 80 GB each that is {sig(need)}, so {math.ceil(need)} GPUs.', [qid, 'hw-h100-mem'])


GPUS = {'H100': 'hw-h100-bw', 'H200': 'hw-h200-bw', 'B200': 'hw-b200-bw'}


@template('decode', 'LLMs', 'rate', ['1', '3', '8', '13', '34', '70'], list(PRECISION), list(GPUS), weight=1)
def _decode(p, prec, gpu):
    by, qid = PRECISION[prec]
    w = float(p) * 1e9 * by
    if w > 141e9 or (gpu == 'H100' and w > 80e9) or (p == '8' and prec == 'FP16' and gpu == 'H100'):
        return None
    ans = div(B(GPUS[gpu]), k(w))
    return (f'What is the single-stream decode ceiling for a {p}B model at {prec} on one {gpu}?', ans,
            f'Each token reads every weight once: {said(GPUS[gpu])} ÷ {fmt("size", w)} ≈ {shown("rate", *ans)}.', [GPUS[gpu], qid, 'llm-decode'])


def short(n):
    n = int(n)
    return f'{n // 1000000}M' if n >= 1000000 else f'{n // 1000}k'


@template('kv', 'LLMs', 'size', ['8000', '32000', '128000', '1000000'], weight=2)
def _kv(n):
    ans = mul(k(float(n)), B('llm-kv-token'))
    return (f'How much KV cache does a {short(n)}-token context take, for an 8B to 70B model in FP16?', ans,
            f'{words(float(n))} × 0.1 to 0.3 MB per token = {shown("size", *ans)}.', ['llm-kv-token'])


@template('stream', 'LLMs', 'time', ['200', '1000', '2000', '4000'], weight=2)
def _stream(n):
    n = float(n)
    ans = add(B('llm-ttft'), div(k(n), B('llm-speed')))
    return (f'How long until a {sig(n)}-token answer has finished streaming, from sending the request?', ans,
            f'Time to first token ({said("llm-ttft")}) plus {sig(n)} tokens at {said("llm-speed")} ≈ {shown("time", *ans)}.', ['llm-ttft', 'llm-speed'])


@template('tokens', 'LLMs', 'count', ['words', 'chars'], ['300', '3000', '20000', '100000', '1000000'], weight=2)
def _tokens(unit, n):
    n = float(n)
    if unit == 'words':
        ans = k(n / 0.75)
        return (f'About how many tokens is {words(n)} words of English?', ans,
                f'1 token ≈ 0.75 words, so {words(n)} ÷ 0.75 ≈ {shown("count", *ans)}.', ['llm-words'])
    ans = div(k(n), B('llm-chars'))
    return (f'About how many tokens is {words(n)} characters of English?', ans,
            f'1 token ≈ 4 characters, so {words(n)} ÷ 4 ≈ {shown("count", *ans)}.', ['llm-chars'])


@template('index', 'LLMs', 'size', ['10000000', '50000000', '1000000000'], ['float32', 'int8'], weight=2)
def _index(n, prec):
    n = float(n)
    ans = mul(k(n), B('rag-vector'))
    parts = ['rag-vector']
    if prec == 'int8':
        ans, parts = div(ans, B('rag-int8')), parts + ['rag-int8']
    return (f'How big is an index of {words(n)} 1,536-dimension {prec} vectors, before overhead?', ans,
            f'{words(n)} × 6 KB{" ÷ 4 for int8" if prec == "int8" else ""} ≈ {shown("size", *ans)}.', parts)


@template('train', 'LLMs', 'size', ['1', '3', '13', '34', '70'], weight=1)
def _train(p):
    ans = mul(k(float(p) * 1e9), B('llm-train-bytes'))
    return (f'How much memory does training a {p}B model take with mixed precision and Adam, before activations?', ans,
            f'{p} billion × 16 bytes ≈ {shown("size", *ans)}.', ['llm-train-bytes'])


@template('pow', 'Sizes', 'count', [str(e) for e in range(11, 64) if e not in (16, 20, 30, 31, 32, 40, 50)], weight=1)
def _pow(e):
    e = int(e)
    near = min((10, 20, 30, 40, 50), key=lambda b: abs(e - b))
    near = near if e - near >= 0 or near == 10 else near - 10
    rest = e - near
    ans = k(2.0 ** e)
    return (f'2{str(e).translate(SUP)} is roughly what?', ans,
            f'2{str(near).translate(SUP)} ≈ {said(f"pow-{near}")} and 2{str(rest).translate(SUP)} = {2 ** rest:,}, so about {shown("count", *ans)}.', [f'pow-{near}'])


# ---------- building, picking ----------
def build(qid):
    """The question for an id like gen:span:6:months:seconds, or None if it isn't a valid one. Pure."""
    bits = str(qid).split(':')
    if len(bits) < 2 or bits[0] != 'gen' or bits[1] not in TEMPLATES:
        return None
    t, params = TEMPLATES[bits[1]], bits[2:]
    if len(params) != len(t['options']) or any(p not in o for p, o in zip(params, t['options'])):
        return None
    got = t['build'](*params)
    if not got:
        return None
    prompt, (lo, hi), why, parts = got
    return {'id': qid, 'topic': t['topic'], 'prompt': prompt, 'kind': t['kind'], 'answer': (lo, hi),
            'shown': shown(t['kind'], lo, hi), 'why': why, 'parts': list(dict.fromkeys(parts)), 'derived': True}


def sample(rng):
    """One random valid question. Templates are weighted, and those resting on fewer base numbers
    come up more often."""
    names = list(TEMPLATES)
    while True:
        t = TEMPLATES[rng.choices(names, weights=[TEMPLATES[n]['weight'] for n in names])[0]]
        q = build(':'.join(['gen', t['name']] + [rng.choice(o) for o in t['options']]))
        if q:
            return q


def weakness(q, cards):
    """Lower is weaker: the mean streak of the base cards a question rests on (unseen counts as 1)."""
    return sum((cards.get(p) or {}).get('streak', 1) for p in q['parts']) / max(1, len(q['parts']))


def pick(gen_cards, turn, recent, seed, cards):
    """The next derived question: a missed one that is due again, else the weakest-founded of three
    fresh ones not asked recently. `recent` holds the latest ids, the last one answered at the end. Pure."""
    recent = list(recent or [])
    due = [g for g, c in gen_cards.items() if c['due'] <= turn and recent[-1:] != [g] and build(g)]
    if due:
        return min(due, key=lambda g: (gen_cards[g]['due'], g))
    rng = random.Random(f'{seed}:derived:{turn}')
    fresh = []
    for _ in range(30):
        q = sample(rng)
        if q['id'] not in recent:
            fresh.append(q)
        if len(fresh) == 3:
            break
    return min(fresh or [sample(rng)], key=lambda q: weakness(q, cards))['id']


def nudge(card, b, turn):
    """A base card after a derived question resting on it went wrong in band b. A lighter touch than
    missing it directly: the streak drops by one rather than to zero, and it comes back within twice
    the gap a direct miss would get, if it wasn't due sooner already. Pure."""
    if not card:
        return card
    card = dict(card)
    card['streak'] = max(0, card.get('streak', 0) - 1)
    card['due'] = min(card['due'], turn + 2 * nd.WRONG_GAP[b])
    card['nudged'] = card.get('nudged', 0) + 1
    return card
