---
id: graph-data
category: storage
skill: reads
title: Graph data and recursive queries
minutes: 18
summary: When relationships are the point of the data (friends of friends, fraud rings, dependencies, road networks), many-to-many links appear everywhere and the questions follow edges an unknown number of hops. A property graph stores vertices and edges with properties and traverses them with a declarative query language; you can model one in SQL with two tables and a recursive query, but the query gets long. Fan-out, not the database brand, decides what a traversal costs.
objectives:
  - Recognise graph-shaped problems and when a relational or document model strains
  - Describe the property graph model and write a variable-length traversal in Cypher and as a recursive SQL query
  - Contrast declarative and imperative queries, and name triple stores, SPARQL and Datalog
  - Estimate traversal cost from fan-out and handle cycles and super-nodes
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 2', 'https://dataintensive.net/']
  - ['Neo4j: Cypher manual, variable-length patterns', 'https://neo4j.com/docs/cypher-manual/current/patterns/variable-length-patterns/']
  - ['PostgreSQL: WITH queries (recursive CTEs, cycle detection)', 'https://www.postgresql.org/docs/current/queries-with.html']
  - ['W3C: SPARQL 1.1 Query Language', 'https://www.w3.org/TR/sparql11-query/']
---

> [!story] Friends of friends of friends
> A social app showed "people you may know" using a SQL query that self-joined the `friendships` table: one join for friends, two for friends of friends. It ran in milliseconds. Product wanted three hops, then four. The query grew a join per hop, the planner's estimates went wrong, and at four hops it ran for minutes and held a connection the whole time. The data hadn't grown much. The question had changed shape: how many hops is not a number you can write into a fixed query.

## When data is a graph

In a document model, one-to-many relationships nest neatly (a profile contains its positions). In a relational model, many-to-many relationships become join tables, and that works while you ask about one or two hops. But when **connections** are what you query, the data is naturally a **graph**: vertices (things) joined by edges (relationships).

- **Social networks**: people who know each other, follow or block one another.
- **Fraud and security**: accounts that share a device, address or card, linked in rings.
- **Dependencies**: packages, services, build targets, org charts, "who reports to whom".
- **Networks**: roads, railways, the web (pages and links).
- **Knowledge graphs**: many different kinds of vertices (people, places, events) in a single store.

Algorithms work directly on these structures: shortest path in a road network, PageRank on the web graph, connected components to find fraud rings. A graph model also lets a single store hold completely different kinds of thing, as long as edges can join them.

## The property graph model

In a **property graph**, each **vertex** has a unique ID, a set of properties (key–value pairs), and its incoming and outgoing edges. Each **edge** has a unique ID, a tail vertex (where it starts), a head vertex (where it ends), a **label** that names the relationship (`FRIEND`, `LIVES_IN`), and its own properties. Any vertex can connect to any other, and you can follow an edge forwards or backwards.

```arch
title: A small social graph
nodes:
  - {id: ana, label: Ana, kind: client, x: 0, y: 0, note: 'person'}
  - {id: ben, label: Ben, kind: client, x: 1, y: 1, note: 'person'}
  - {id: cy, label: Cy, kind: client, x: 2, y: 0, note: 'person'}
  - {id: dee, label: Dee, kind: client, x: 3, y: 1, note: 'person'}
  - {id: lon, label: London, kind: db, x: 1, y: 2, note: 'place'}
  - {id: bea, label: Beaune, kind: db, x: 3, y: 2, note: 'place'}
edges:
  - [ana, ben, 'FRIEND']
  - [ben, cy, 'FRIEND']
  - [cy, dee, 'FRIEND']
  - [ana, lon, 'LIVES_IN']
  - [ben, lon, 'LIVES_IN']
  - [dee, bea, 'BORN_IN']
paths:
  - label: Friends within two hops of Ana
    steps:
      - [ana, ben, 'Hop 1: Ana''s direct friend is Ben.']
      - [ben, cy, 'Hop 2: Ben''s friend Cy is reachable in two hops.']
  - label: Who lives where Ana lives
    steps:
      - [ana, lon, 'Follow LIVES_IN to London.']
      - [ben, lon, 'Follow LIVES_IN backwards: Ben also lives in London.']
```

You can store this in a relational database with two tables, one for vertices and one for edges, each carrying a JSON column of properties, with indexes on both ends of every edge so you can walk in either direction:

```sql
CREATE TABLE vertices (id bigint PRIMARY KEY, label text, properties jsonb);
CREATE TABLE edges (
  id bigint PRIMARY KEY,
  tail bigint REFERENCES vertices (id),
  head bigint REFERENCES vertices (id),
  label text,
  properties jsonb
);
CREATE INDEX edges_tail ON edges (tail);
CREATE INDEX edges_head ON edges (head);
```

## Variable-length queries

The question that strains the relational model is a **traversal of unknown length**: "everyone within three friendships of Ana", "all places inside the United States, however deeply nested". Graph query languages have a notation for it. In **Cypher** (Neo4j and others), `*` means "follow this edge repeatedly":

```
MATCH (ana:Person {name: 'Ana'})-[:FRIEND*1..3]-(other:Person)
WHERE other <> ana
RETURN DISTINCT other.name
```

The same question in SQL needs a **recursive common table expression**: a base case, a recursive step that joins to the edges table, and a guard so cycles don't loop forever.

```sql
WITH RECURSIVE reach(person, depth, path) AS (
  SELECT head, 1, ARRAY[tail, head] FROM edges WHERE tail = 1 AND label = 'FRIEND'
  UNION ALL
  SELECT e.head, r.depth + 1, r.path || e.head
  FROM reach r JOIN edges e ON e.tail = r.person AND e.label = 'FRIEND'
  WHERE r.depth < 3 AND NOT e.head = ANY (r.path)
)
SELECT DISTINCT person FROM reach;
```

It works, and for a few hops it is fine, but it is far longer than the Cypher and easy to get wrong. Two details matter. **Limit the depth** or the query may explore the whole graph. **Guard against cycles** (friendships go both ways, and A to B to A is a loop), here by remembering the path. Without either, a recursive query can run until the database stops it.

```bug
title: A recursive query with no brakes
prompt: This query finds everyone connected to person 1 through friendships. Which lines can make it run away?
lang: sql
code: |
  WITH RECURSIVE reach(person) AS (
    SELECT head FROM edges WHERE tail = 1
    UNION ALL
    SELECT e.head FROM reach r JOIN edges e ON e.tail = r.person
  )
  SELECT DISTINCT person FROM reach;
bug: [4]
explain: |
  **Line 4** (the recursive step) has no depth limit and no cycle check. Friendships form cycles (1 → 2 → 1), so the recursion revisits the same people forever and the row count grows until the query is cancelled. Track the depth and stop at a limit, and either remember visited vertices (keep the path, or use `UNION` instead of `UNION ALL` so duplicates stop the recursion), or use the database's `CYCLE` clause where available.
fix: |
  WITH RECURSIVE reach(person, depth) AS (
    SELECT head, 1 FROM edges WHERE tail = 1
    UNION
    SELECT e.head, r.depth + 1 FROM reach r JOIN edges e ON e.tail = r.person WHERE r.depth < 3
  )
  SELECT DISTINCT person FROM reach;
```

## Declarative versus imperative

Cypher, SQL and SPARQL are **declarative**: you describe the *pattern* of the result you want and the database decides how to find it (which index, which order, how to parallelise). An **imperative** query (a loop in application code, or a hand-written MapReduce) says how, step by step. Declarative queries are shorter, hide implementation details so the database can improve without you changing queries, and are easier to run in parallel because they say nothing about order. The cost is that you must trust and sometimes tune the planner.

Two other ways of storing graph data are worth recognising:

- **Triple stores** hold everything as `(subject, predicate, object)` statements, such as `(Ana, livesIn, London)`. It is the same as a property graph with no edge properties. The RDF standard and the **SPARQL** query language come from the semantic web and are used for linked open data and knowledge bases.
- **Datalog** is an older, rule-based language: you define small rules (`within_us(X) :- born_in(X, Y), within(Y, usa)`) and build bigger queries by combining rules, including recursive ones. It influences several modern systems.

```sim
name: datamodels
key: b950
title: Relational, document and graph models
intro: Answer the same question in each model and compare what each has to read.
takeaway: |
  Each model makes some queries trivial and others painful. Choose by access pattern: graphs win when queries follow relationships an unknown number of hops.
```

## What a traversal really costs

The database is not the main factor; **fan-out** is. Each hop multiplies the number of vertices you might touch by the average number of neighbours.

```calc
title: How many people are three hops away?
prompt: Each person has about 200 friends. As an upper bound, how many distinct friend-of-friend-of-friend paths start from one person (200 × 200 × 200)?
answer: 8000000
unit: paths
tolerance: 1.05
steps: |
  200³ = **8,000,000** paths at three hops, and 1.6 billion at four. Overlap (friends in common) means far fewer distinct people than paths, but you still have to walk the edges to find that out. A graph database makes each hop a cheap pointer or index lookup, and a relational one does an index lookup per hop; both are limited by how many edges the query touches. The answer to "four hops gets slow" is usually to cap depth, prune early, use a precomputed index, or ask whether the product really needs it.
```

Practical limits and habits:

- **Cap the depth, and filter as early as you can.** A pattern that tests a property at the first hop explores far less than one that tests it at the end.
- **Super-nodes.** A celebrity with 30 million followers, or a country that half of all people live in, turns one hop into a huge scan. Handle them specially: exclude them, sample, or precompute their neighbourhoods.
- **Cycles.** Always track what you have visited.
- **Sharding is the hard part.** A traversal wanders across the whole graph, so splitting it across machines makes many hops cross the network. Large graphs are usually kept on one big machine, or partitioned by community with care.
- **Not everything is a graph.** If you mostly look a record up by key, or join to a fixed number of tables, a relational or document store is simpler to run. A graph database earns its place when variable-length traversals are central.

```sort
prompt: Which model is the most natural fit?
buckets: [Relational / document, Graph]
items:
  - {text: 'Fetch an order with its line items and shipping address', bucket: 0, why: 'A fixed, shallow shape: one aggregate or a couple of joins.'}
  - {text: 'Find every account within three hops of a known fraudster through shared devices and cards', bucket: 1, why: 'A variable-length traversal over many relationship types.'}
  - {text: 'List all dependencies of a package, including transitive ones', bucket: 1, why: 'Recursive traversal of a dependency graph.'}
  - {text: 'Show a customer''s last 20 orders', bucket: 0, why: 'An indexed range query on one table.'}
  - {text: 'Find the shortest route between two junctions', bucket: 1, why: 'A path-finding algorithm on a road graph.'}
```

```predict
prompt: A "people you may know" feature explores friends of friends of friends of a user with 200 friends each. Product asks for six hops. What is the most sensible response?
choices:
  - Switch to a faster graph database and run six hops live on every page view
  - Cap depth at two or three, prune by mutual friends, and precompute offline
  - Add more indexes on the friendships table so each hop is cheaper
  - Shard the friendships table by user ID so the hops spread across machines
answer: 1
reveal: |
  Six hops at 200 neighbours is 200⁶ = 6.4 × 10¹⁳ paths, and in a connected social graph it reaches nearly everyone. Better hardware doesn't change that, indexes make each hop cheaper but not fewer, and sharding makes hops cross the network. Constrain the question: few hops, ranked by mutual friends, and compute heavy suggestions in a batch or stream job.
```

```faded
title: Fill in the graph facts
prompt: Fill each gap from memory.
text: |
  In a property graph an edge has a [[label|tail only|schema file]] that names the relationship and can carry its own [[properties|tables|shards]].

  A traversal of unknown length in SQL needs a [[recursive CTE|window function|materialised view]], which must limit [[depth and cycles|column types|index size]].

  Traversal cost is driven by [[fan-out|the brand of database|query language]]: 200 friends per person gives [[#8000000]] paths at three hops.

  Describing the result you want and letting the database choose how to find it is called a [[declarative|imperative|procedural]] query.
explain: Graph queries are about edges, depth, cycles and fan-out. Declarative languages let the planner do the walking.
```

```recall
prompt: When would you choose a graph model over a relational one, and what do you watch for in traversals?
points:
  - Choose a graph when relationships are central and queries follow them an unknown number of hops (social, fraud, dependencies, paths)
  - Relational models handle fixed-depth joins but need a join or recursive query per hop and get unwieldy and slow with depth
  - Cap depth, guard against cycles, and prune early
  - Watch fan-out and super-nodes, since cost multiplies per hop, and remember that sharding a graph is hard
model: |
  I'd pick a graph when the valuable questions are about connections, such as who is within a few hops of a flagged account or what a package transitively depends on, because a traversal of unknown length is natural in Cypher and awkward in SQL. The relational model copes with a fixed number of joins, but each hop adds a join or a recursive step, and the queries become long and slow. Whichever I use I cap the depth, track visited vertices so cycles don't loop forever, and filter as early as possible. The real cost is fan-out: average neighbours to the power of hops, so I watch for super-nodes like celebrities, and I avoid sharding a graph unless I must because traversals then cross machines.
```

```interview
ask: We store a social graph in Postgres and the friends-of-friends query is slow. What do you do?
say: |
  "First I'd check what is actually slow. For two hops it should be two index lookups per person, so I'd look at the plan, the index on both directions of the edge and whether a celebrity with millions of followers is in the path. For deeper traversals the cost is fan-out: 200 friends per person is 40,000 at two hops and 8 million at three, so I'd cap depth and rank by mutual connections. If suggestions don't have to be live, I'd precompute them in a batch job and serve them from a cache or key-value store. If variable-length traversals are central to the product and keep growing, a graph database or an in-memory graph is justified, but I'd weigh the cost of running another system, since sharding a graph is hard."
followups:
  - q: Why not just add a join per hop?
    a: Each hop is another join the planner must order, and estimates degrade. A recursive query or a graph engine expresses unknown depth directly.
  - q: How do you stop a recursive query running forever?
    a: Limit the depth and keep the visited set or path, or use cycle detection, because friendship graphs are full of cycles.
  - q: What's a super-node?
    a: A vertex with enormous degree. Traversing through it explodes, so you exclude, sample or precompute it.
weak: |
  "Switch to a graph database, it's built for this." No analysis of depth, fan-out or alternatives.
strong: |
  Measures fan-out, constrains depth, uses precomputation where possible, and adopts a graph store only when traversals are central.
```

```questions
- kind: check
  prompt: Which kind of query most strains a relational model and suits a graph model?
  choices:
    - text: Following relationships an unknown number of hops
      correct: true
    - text: Fetching one customer record by primary key from a table
      why: A trivial indexed lookup in any model.
    - text: Summing a single numeric column across every row in a table
      why: A columnar or relational strength.
    - text: Appending a new event to the end of an audit log
      why: Not about relationships.
  explanation: Variable-length traversals need a join per hop in SQL, or a recursive query. A graph language expresses them directly.
- kind: check
  prompt: What does an edge in a property graph contain?
  choices:
    - text: An ID, a tail, a head, a label and properties
      correct: true
    - text: Only the IDs of the two vertices it connects, and nothing else about the link
      why: Edges also have labels and may carry properties.
    - text: A full copy of both vertices' properties, kept in sync with the vertices
      why: Edges reference vertices, they do not copy them.
    - text: A table schema describing every kind of relationship in the graph
      why: Not part of the model.
  explanation: The label names the relationship and properties describe it, such as a friendship since 2019.
- kind: check
  prompt: Why must a recursive friendship traversal guard against cycles?
  choices:
    - text: Friendships go both ways, so it can revisit people forever
      correct: true
    - text: Recursive queries are not allowed in SQL, so the database refuses to run them
      why: Recursive CTEs exist.
    - text: Cycles make every index on the edges table invalid until it is rebuilt
      why: They do not.
    - text: Relational databases cannot store a cyclic structure in tables at all
      why: They can.
  explanation: Track visited vertices (or depth) so the recursion terminates.
- kind: check
  type: multi
  prompt: Which are good reasons a graph traversal gets slow? Select all that apply.
  choices:
    - text: High fan-out multiplied over several hops
      correct: true
    - text: A super-node with millions of neighbours in the path
      correct: true
    - text: No depth limit on a variable-length pattern
      correct: true
    - text: Using a declarative query language
      why: Declarative languages let the planner optimise.
  explanation: Cost is driven by the number of edges touched, which grows exponentially with hops.
- kind: check
  prompt: What is the main advantage of declarative queries over imperative ones?
  choices:
    - text: The database picks the plan and can parallelise it
      correct: true
    - text: They always run faster than the same logic hand-written in application code
      why: Not always, but they let the engine improve.
    - text: They remove the need for indexes, since the engine scans efficiently anyway
      why: Indexes still matter.
    - text: They guarantee the query completes in linear time however large the graph
      why: No such guarantee.
  explanation: Saying what you want, not how, leaves room for the engine to optimise.
- kind: fire
  prompt: Each person has 100 friends. As an upper bound, how many friend-of-friend paths start from one person?
  choices:
    - text: 10,000
      correct: true
    - text: 200
      why: That's two hops of 100 added, not multiplied.
    - text: 1,000,000
      why: That's three hops.
    - text: 100
      why: One hop.
  explanation: 100 × 100 = 10,000.
- kind: fire
  prompt: What is a triple store?
  choices:
    - text: A database of (subject, predicate, object) statements
      correct: true
    - text: A store whose data is replicated three times for durability across zones
      why: That is a replication factor.
    - text: A table restricted to exactly three columns of any type
      why: Not the definition.
    - text: A graph with exactly three vertices, used for teaching
      why: Not the definition.
  explanation: RDF stores hold facts as triples and are queried with SPARQL.
- kind: fire
  prompt: Why is sharding a graph hard?
  choices:
    - text: Traversals follow edges across machines
      correct: true
    - text: Graphs cannot be serialised into any form that can be written across nodes
      why: They can.
    - text: Vertices in a graph database have no IDs that could be hashed
      why: They do.
    - text: Graph databases do not support secondary indexes at all
      why: They do.
  explanation: There is rarely a clean partition key, so network hops accumulate.
- kind: fire
  type: order
  prompt: Order these ways to handle a slow friends-of-friends feature, from least to most disruptive.
  items:
    - Cap the traversal depth and prune early
    - Precompute suggestions in a batch job and cache them
    - Add a dedicated graph store for live traversals
    - Rebuild the entire data platform around a graph
  explanation: Constraining the question is cheapest, precomputation moves cost off the request path, a graph store adds a system, and replatforming is the last resort.
- kind: fire
  prompt: In Cypher, what does `-[:FRIEND*1..3]-` express?
  choices:
    - text: Follow FRIEND edges one to three times
      correct: true
    - text: Match exactly three FRIEND vertices in a row, ignoring any shorter chain
      why: It is a range of one to three hops.
    - text: A property called FRIEND that holds a number between one and three
      why: FRIEND is an edge label.
    - text: Multiply the friend counts of the matched vertices together
      why: The star means repetition.
  explanation: The star followed by a range is a variable-length path pattern.
```
