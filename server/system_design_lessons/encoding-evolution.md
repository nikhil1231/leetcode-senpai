---
id: encoding-evolution
category: storage
skill: operations
title: Encoding and schema evolution
minutes: 20
summary: Data outlives the code that wrote it, and during a rolling deploy old and new code run together. So every record, message and API response must be readable by versions that never met. JSON is easy but vague about numbers and schemas; Protocol Buffers identify fields by number; Avro resolves a writer's schema against a reader's. Add fields with defaults, never reuse a field number, and plan for both directions of compatibility.
objectives:
  - Explain backward and forward compatibility and why rolling upgrades and stored data need both
  - Compare JSON, Protocol Buffers and Avro on field identity, schema evolution and pitfalls
  - Name which schema changes are safe in each format and which silently corrupt data
  - Handle compatibility in the three dataflow modes: databases, services and message brokers
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 4', 'https://dataintensive.net/']
  - ['Protocol Buffers: Language guide, updating a message type', 'https://protobuf.dev/programming-guides/proto3/#updating']
  - ['Apache Avro: Schema resolution', 'https://avro.apache.org/docs/current/specification/#schema-resolution']
  - ['Confluent: Schema evolution and compatibility', 'https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html']
---

> [!story] The deploy that deleted a field
> A team added a `preferred_language` field to user profiles and rolled the new version out one server at a time. For twenty minutes both versions ran. When a user edited their profile through an old server, it loaded the record into its own object model, which had no such field, changed the name, and saved the whole record back. The new field vanished. A few thousand users had their language reset, and the data to undo it was gone. Every deploy step was correct. The mistake was assuming that code reading data it didn't recognise would keep it.

## Why compatibility is a requirement, not a nicety

In a running system two kinds of change happen at once:

- **Rolling upgrades.** You can't replace every server at the same instant, and you shouldn't (a bad release would hit everyone). For a while old and new code run side by side, exchanging data. Mobile apps and third-party clients make it worse: you may never be able to force an upgrade.
- **Long-lived data.** A database may hold records written five years ago by code that no longer exists.

That gives two directions, and you need both.

- **Backward compatibility:** *new* code can read data written by *old* code.
- **Forward compatibility:** *old* code can read data written by *new* code. (This is the harder one: old code has to ignore what it doesn't understand.)

Anything that turns in-memory objects into bytes, whether stored, sent over a network or put on a queue, is an **encoding** (serialisation), and its design decides how painful these two directions are.

## Formats and how each handles change

**Language-built-in serialisation** (Java `Serializable`, Python `pickle`) is convenient but poor for anything stored or exchanged. It ties data to one language, decoding arbitrary bytes can instantiate arbitrary classes (a well-known remote-code-execution route), and versioning and efficiency are afterthoughts. Use it only for short-lived, same-process purposes.

**JSON, XML and CSV** are text, human-readable and universally supported, with subtle problems:

- JSON has numbers but no integer type and no stated precision. Integers above 2^53 can't be represented exactly by a double, so they are corrupted when parsed in JavaScript. Twitter's API returns tweet IDs twice, as a number and as a string, for this reason.
- There is no binary type, so bytes are Base64-encoded in a string, about a third larger.
- XML and CSV can't tell a number from a string of digits without a separate schema. Optional schemas (JSON Schema, XSD) exist but are often not used.

**Protocol Buffers and Thrift** are binary and schema-based. You write a schema where each field has a **name, a type and a tag number**; the bytes contain tag numbers and values, never names.

```
message User {
  string user_name = 1;
  int64  favourite_number = 2;
  repeated string interests = 3;
}
```

That makes the encoding compact, and it defines the evolution rules. **Names can change freely, tag numbers never.** You can add a field with a new tag; old code meeting an unknown tag skips it (the type says how many bytes), which gives forward compatibility. New code reading old data finds the field missing and uses a default, which gives backward compatibility, but only if every added field is optional or has a default, never required. You can remove an optional field but must never reuse its number, because old data may still carry that tag with its old meaning.

**Avro** takes a different route. There are no tag numbers at all; the encoding is just values in schema order. To read data, the reader needs the **writer's schema** (the one used to encode it) and compares it with the **reader's schema** (the one its code expects). The library resolves differences by field name: a field only the writer has is skipped; a field only the reader has takes its default. So you may only add or remove fields that have defaults, and renaming needs an alias. The cost is that the reader must find the writer's schema: once at the head of a large file, a version number per record that points into a schema registry, or negotiated when a connection starts. The gain is that schemas can be generated automatically from, say, a database table, because there are no hand-assigned numbers to keep stable.

```sim
name: encoding
key: b940
title: Encoding the same record three ways
intro: Encode one record as JSON, Protocol Buffers and Avro, then change the schema and see who can still read it.
```

```sim
name: compat
title: Is this schema change safe?
intro: Pick a format and a change. The table shows both directions for every change, and the card explains the one you picked.
challenges:
  - {text: 'In Protocol Buffers, find a change that is safe in neither direction', metric: safe, op: '==', value: 0, and: [{metric: format, op: '==', value: proto}, {metric: backward, op: '==', value: 0}, {metric: forward, op: '==', value: 0}]}
  - {text: 'Find a rename that is safe both ways', metric: safe, op: '==', value: 1, and: [{metric: change, op: '==', value: rename}]}
  - {text: 'Find a change that only breaks old readers in Avro (new code fine, old code fails)', metric: forward, op: '==', value: 0, and: [{metric: format, op: '==', value: avro}, {metric: backward, op: '==', value: 1}]}
takeaway: |
  Adding an optional field with a default is safe everywhere. Adding a required field breaks backward compatibility because old data lacks it. Renames are free where the encoding uses numbers, need an alias in Avro, and break everything in JSON, where the name is the identity. Reusing a field number is the one change that corrupts data silently rather than failing.
```

```predict
prompt: A Protocol Buffers schema has `string nickname = 4;`. A later release removes the field, and a year after that someone adds `int32 retry_count = 4;` because tag 4 looks free. What happens when new code reads an old record that still contains a nickname?
choices:
  - Decoding fails or yields garbage, because old data carries a string under tag 4
  - The new field is just empty, since the old record has no retry_count value at all
  - The parser notices the type changed and falls back to the field's default
  - Nothing, because tag numbers are reassigned automatically when records are read
answer: 0
reveal: |
  Tag numbers are the only identity the bytes carry. An old record with a string under tag 4 is read by new code that expects an int32 there, so decoding fails or yields nonsense, depending on the wire types. This is why removed field numbers are marked reserved: you can't know whether old data, messages in a queue or a client's cache still contains them.
```

```calc
title: The price of Base64
prompt: A JSON API returns a 6 MB image as a Base64 string. About how many megabytes does the response carry for the image?
answer: 8
unit: MB
tolerance: 1.05
steps: |
  Base64 encodes every 3 bytes as 4 characters, so it inflates data by 4/3: 6 MB × 4/3 = **8 MB**, a third more, before any compression. Binary formats carry the raw bytes. Large binary payloads are often better sent as a separate download than inside a JSON field.
```

## Compatibility in the three dataflow modes

Encoding questions arise wherever data crosses a process boundary, and the constraints differ.

**Through a database.** The writer and reader may be the same application at different points in time, so you are sending a message to your future self. Old code must cope with fields added by new code, and the trap in the opening story is **old code losing fields it didn't know about** when it rewrites a record. Make the object layer preserve unknown fields on write (or update only the columns it knows about). Remember too that data in a table was written under many past schemas, so migrations that rewrite everything are costly. Adding a column with a default is cheap in most databases, and filling it lazily is cheaper than backfilling.

**Through services (REST and RPC).** Clients and servers are deployed independently, and you control servers but not necessarily clients. During an upgrade servers usually change first, so **requests need backward compatibility** (new server, old client) and **responses need forward compatibility** (old client, new server response). You may have to keep old versions alive: in the URL path (`/v2/`), in a header, or by pinning each API key to a version. A remote call is also not a local call: it can fail, hang, or succeed with the response lost, so a retried call must be safe (see the retries lesson).

**Through message brokers and logs.** The sender doesn't know who the receivers are or when they will read. Messages stay in a log for days and may be replayed years later, so both directions matter at once and for long periods. Put a **schema registry** in front: producers register schemas and the registry refuses changes that break the chosen compatibility rule (backward, forward, or full).

```arch
title: Schema registry in a message pipeline
nodes:
  - {id: prod, label: Producer v2, kind: service, x: 0, y: 1}
  - {id: reg, label: Schema registry, kind: service, x: 1, y: 0, note: 'checks compatibility'}
  - {id: topic, label: Topic, kind: stream, x: 1, y: 2, note: 'schema ID + bytes'}
  - {id: c1, label: Consumer v1, kind: service, x: 2, y: 1, note: 'old reader schema'}
  - {id: c2, label: Consumer v2, kind: service, x: 3, y: 1}
edges:
  - [prod, reg, 'register new schema']
  - [prod, topic, 'publish (schema ID, payload)']
  - [topic, c1, 'consume']
  - [c1, reg, 'fetch writer schema']
  - [topic, c2, 'consume']
paths:
  - label: A compatible change is released
    steps:
      - [prod, reg, 'Producer v2 registers a schema with a new optional field. The registry checks it against the previous version and accepts.']
      - [prod, topic, 'It publishes messages tagged with the new schema ID.']
      - [topic, c1, 'Consumer v1 reads a message, fetches the writer schema by ID, and resolves it against its own. The unknown field is ignored.']
  - label: An incompatible change is rejected
    steps:
      - [prod, reg, 'A developer makes a field required. The registry rejects the schema, so the change never reaches production.']
```

```timeline
title: A rolling upgrade that loses a field
lanes: [New server, Old server, Database]
state: {'Profile': 'name=Ana'}
steps:
  - {lane: New server, to: Database, text: 'saves profile with new field preferred_language=pt', set: {'Profile': 'name=Ana, preferred_language=pt'}}
  - {lane: Old server, to: Database, text: 'loads the profile into an object with no preferred_language field'}
  - {lane: Old server, to: Old server, text: 'the user changes the name to Ana Maria'}
  - {lane: Old server, to: Database, text: 'writes the whole object back', set: {'Profile': 'name=Ana Maria'}}
find:
  prompt: At which step does the data loss become unavoidable?
  answer: 1
  explain: |
    Once the old server has deserialised the record into an object that has no place for the new field, the information is gone from its memory, so the write-back can't include it. The fix is to preserve unknown fields (keep the raw record and update only what changed), or to update individual columns rather than rewriting the whole row.
```

## Practical rules

- **Add, don't change.** New fields get new numbers or names, optional, with a default. Never repurpose.
- **Make removal a two-step.** Stop writing a field, wait until no reader needs it, then remove it from the schema. Reserve its number.
- **Don't make a required field.** It is a promise old data can't keep.
- **Test compatibility in CI** by decoding saved samples of old data with the new schema and the other way round.
- **Prefer a schema over none**, for documentation and for the checks it enables, even if the wire format is JSON (JSON Schema, OpenAPI).
- **Mind the width of integers and the meaning of enums.** Widening 32 to 64 bits is safe for new readers but truncates for old ones; a new enum value must be tolerated by old code.

```sort
prompt: Is each change safe for both old and new readers in Protocol Buffers?
buckets: [Safe both ways, Breaks something]
items:
  - {text: 'Add an optional field with a new tag number', bucket: 0, why: 'Old code skips the unknown tag; new code uses a default for old data.'}
  - {text: 'Rename a field but keep its tag', bucket: 0, why: 'Names are not in the encoding.'}
  - {text: 'Add a required field', bucket: 1, why: 'Old data lacks it, so new code can''t read old records.'}
  - {text: 'Reuse a retired tag number for a different type', bucket: 1, why: 'Old data still carries the old meaning under that tag.'}
  - {text: 'Change a field from int32 to int64', bucket: 1, why: 'New code reads old data fine, but old code truncates large new values.'}
  - {text: 'Remove an optional field you no longer use, and reserve its tag', bucket: 0, why: 'Unknown tags are skipped and the missing field takes its default.'}
```

```bug
title: Reading a config message
prompt: A service decodes a settings message sent by other teams. Which lines are risky as the schema evolves?
lang: python
code: |
  def load_settings(raw):
      data = json.loads(raw)
      timeout = data["timeout_ms"]
      retries = data["retries"]
      return Settings(timeout, retries, extra=data["extra"])
bug: [3, 4, 5]
explain: |
  **Lines 3–5** index required keys directly. A producer that omits `retries` (an older version) or renames `timeout_ms` makes this raise, so the reader isn't tolerant. **Line 5** also assumes a key that new producers may drop, and nothing preserves unknown keys that a later version might add. Use `.get()` with defaults, ignore keys you don't know, and validate against a schema so the failure is clear when a message genuinely doesn't fit.
fix: |
  def load_settings(raw):
      data = json.loads(raw)
      return Settings(timeout=data.get("timeout_ms", 3000), retries=data.get("retries", 2), extra=data.get("extra", {}))
```

```faded
title: Fill in the encoding facts
prompt: Fill each gap from memory.
text: |
  Old code reading data written by new code needs [[forward|backward|vertical]] compatibility, which means it must [[ignore unknown fields|reject unknown fields|require every field]].

  In Protocol Buffers a field is identified by its [[tag number|name|position]], so renaming is [[safe|dangerous|impossible]] but reusing a number is [[dangerous|harmless|required]].

  Avro resolves the [[writer's schema|compiler|checksum]] against the reader's schema and fills missing fields from [[defaults|nulls always|the writer]].

  A 6 MB binary sent as Base64 inside JSON takes about [[#8]] MB.
explain: Numbers or schema resolution, not names, carry identity in the binary formats; defaults and ignoring unknowns give both directions.
```

```recall
prompt: Your team is adding a field to an event published to many consumers. Explain how to roll it out without breaking anyone.
points:
  - Add the field as optional with a default and a new field number or name, never required
  - Consumers must ignore fields they don't know, so old consumers keep working (forward compatibility)
  - New consumers must handle old messages that lack the field (backward compatibility)
  - Enforce the compatibility rule with a schema registry and test old and new data in CI
model: |
  I'd add the field as optional with a default and a fresh field number (or name, for Avro and JSON), never as required, because required fields can't be satisfied by old messages. Existing consumers have to tolerate it by ignoring unknown fields, which gives forward compatibility, and the new code must cope with older messages that lack it, using the default, for backward compatibility. To make this enforceable I'd register the schema with a compatibility check so an incompatible change is rejected before it ships, and run tests that decode saved old messages with the new schema and new messages with the old one. If we later retire the field, we stop writing it first, wait until no consumer needs it, and reserve its number.
```

```interview
ask: We are about to change the JSON shape of an API response used by our mobile apps. How do you do it safely?
say: |
  "Mobile clients upgrade on their own schedule, so I assume old versions stay in the wild for a long time. New servers must keep serving old clients, so responses stay forward compatible: I only add optional fields and never remove or rename existing ones, and clients ignore keys they don't know. For a genuine breaking change I introduce a new version, `/v2`, alongside the old one, keep both running for a published window, and measure which clients still call v1 before retiring it. Requests need to stay backward compatible too, so a new server accepts old request shapes. I'd also document the contract with a schema and run contract tests against recorded old-client traffic in CI."
followups:
  - q: What if the app must read a number larger than 2^53?
    a: Send it as a string. Many JSON parsers use doubles and lose precision past 2^53 (about 9 × 10^15).
  - q: Would a binary format avoid these problems?
    a: It avoids JSON's number and Base64 issues and makes evolution rules explicit, but the same discipline applies: new optional fields, no reused numbers.
  - q: What do you do about enum values?
    a: New values can break old clients that don't expect them, so clients should handle unknown values with a default behaviour, and the server should avoid sending a new value to a client that can't understand it.
weak: |
  "Just update the clients and the server at the same time." Impossible with mobile apps and rolling deploys.
strong: |
  Names both compatibility directions, adds optional fields only, versions for breaking changes, and tests old against new.
```

```questions
- kind: check
  prompt: Which describes forward compatibility?
  choices:
    - text: Old code can read data written by new code
      correct: true
    - text: New code can read data written by old code
      why: That's backward compatibility.
    - text: Data can be read by any language
      why: That's interoperability.
    - text: Data never changes
      why: Schemas change. The point is surviving it.
  explanation: Forward compatibility requires old readers to ignore what they don't understand.
- kind: check
  prompt: Why must a field added to a Protocol Buffers schema after the first release not be required?
  choices:
    - text: New code would reject old records that lack it
      correct: true
    - text: Required fields are slower to encode because the parser must verify each one
      why: Speed is not the reason.
    - text: Old code cannot skip a required field it has never seen before
      why: Old code skips unknown tags either way.
    - text: Required fields would force every tag number to be reused for them
      why: That is a different rule.
  explanation: Old data was written before the field existed, so a required field makes it unreadable by new code.
- kind: check
  prompt: In Avro, how do a reader and writer with different schemas read the same data?
  choices:
    - text: It resolves writer against reader, matching by name
      correct: true
    - text: Both sides must use the byte-for-byte identical schema file or decoding fails
      why: They only need to be compatible.
    - text: Fields are matched by their tag numbers, which are stored next to each value
      why: Avro has no tag numbers.
    - text: The reader skips any field it cannot parse and returns whatever is left
      why: Resolution is rule-based, not best effort.
  explanation: Avro's flexibility comes from resolving two schemas rather than hard-coding field numbers in the bytes.
- kind: check
  type: multi
  prompt: Which changes are safe in both directions for an Avro schema? Select all that apply.
  choices:
    - text: Adding a field with a default
      correct: true
    - text: Removing a field that has a default
      correct: true
    - text: Adding a field with no default
      why: New readers can't fill it for old data.
    - text: Renaming a field with no alias
      why: Name is the identity in Avro, so the old reader can't match it.
  explanation: Defaults are what let either side fill a gap.
- kind: check
  prompt: Why did the old server in the opening story lose the new field?
  choices:
    - text: It loaded the record into an object with no slot for the field, then saved it whole
      correct: true
    - text: The database rejected the extra column because the old schema did not list it
      why: The data simply was not sent.
    - text: JSON does not support adding fields to documents after they are created
      why: It does. The code dropped it.
    - text: Clock skew between the servers reordered the two writes so the old one won
      why: Not the cause.
  explanation: Rewrite-on-save with a smaller object model drops unknown data. Preserve unknown fields or update only changed columns.
- kind: fire
  prompt: What happens to a 64-bit integer ID above 2^53 when parsed as a JSON number in JavaScript?
  choices:
    - text: It can lose precision
      correct: true
    - text: It is stored exactly, since JavaScript uses 64-bit integers internally
      why: Doubles cannot represent every integer above 2^53.
    - text: It is automatically converted to a string by the parser to avoid loss
      why: Only if you send a string.
    - text: It throws an error because the number is outside the allowed range
      why: Usually it silently rounds.
  explanation: Send large IDs as strings to avoid silent corruption.
- kind: fire
  prompt: Which identifies a field in Protocol Buffers' wire format?
  choices:
    - text: Its tag number
      correct: true
    - text: Its name
      why: Names aren't in the encoding.
    - text: Its position in the record
      why: Position isn't used.
    - text: A hash of its type
      why: Not how it works.
  explanation: Hence renames are safe but renumbering isn't.
- kind: fire
  prompt: During a rolling upgrade where servers change before clients, which direction must API responses support?
  choices:
    - text: Forward: old clients read responses from new servers
      correct: true
    - text: Backward: new clients read responses written by older servers
      why: That is the case for requests, not responses.
    - text: Neither, because responses are generated fresh on every request
      why: Both directions exist.
    - text: Only transport encryption compatibility needs to be preserved
      why: Irrelevant.
  explanation: The server speaks first with a new shape to clients that haven't upgraded, so responses need forward compatibility.
- kind: fire
  type: order
  prompt: Order these steps to retire a field safely.
  items:
    - Stop writing the field in new code
    - Wait until no reader depends on it
    - - Remove it from the schema
      - Reserve its number or name so it is never reused
  explanation: Stop producing it, let consumers drain, then remove it and reserve its number or name so it is never reused (normally the same change, so either order).
- kind: fire
  prompt: What does a schema registry do in a message pipeline?
  choices:
    - text: Stores schemas by ID and rejects incompatible changes
      correct: true
    - text: Encrypts messages in transit between producers and brokers
      why: Not its job.
    - text: Chooses which partition each message is written to by hashing its key
      why: That is the producer partitioner.
    - text: Replaces the message broker by storing the messages itself
      why: It complements the broker.
  explanation: Producers register schemas and consumers fetch the writer's schema by ID, with compatibility enforced centrally.
```
