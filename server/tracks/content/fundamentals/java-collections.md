---
id: java-collections
category: java
skill: java
title: equals, hashCode and the collections
minutes: 17
summary: Hash-based collections rely on a contract between `equals` and `hashCode`, and breaking it (or mutating a key) makes entries vanish. HashMap is an array of buckets that doubles at 75% full and turns long chains into trees. Choosing between ArrayList, ArrayDeque, LinkedHashMap, TreeMap and PriorityQueue is about which operations must be fast. Interviewers probe the contract, HashMap internals, fail-fast iterators, and the difference between unmodifiable and immutable.
objectives:
  - State the equals and hashCode contract and explain what breaks when it's violated
  - Explain how HashMap stores, finds and resizes, and what its operations cost
  - Choose the right collection for a workload and say why
  - Explain fail-fast iterators and the difference between unmodifiable views and immutable collections
sources:
  - ['Java SE docs: Object.equals and hashCode', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/Object.html#equals(java.lang.Object)']
  - ['Java SE docs: HashMap', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/HashMap.html']
  - ['Java SE docs: Collections Framework overview', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/doc-files/coll-overview.html']
---

> [!story] The session cache that forgot people
> Ripple cached open sessions in a `HashMap<SessionKey, Session>`. `SessionKey` had `equals` comparing user id and device, but no `hashCode`, so it used the default identity hash. Every lookup built a new `SessionKey`, which landed in a different bucket from the stored one, so `get` returned `null` and users were logged out on every request. Adding a `hashCode` over the same two fields fixed it.

## The equals and hashCode contract

`Object.equals` compares identity by default, and `Object.hashCode` returns a number derived from the object's identity. When you override `equals` to compare values, you must override `hashCode` too, because the contract says:

- If `a.equals(b)`, then `a.hashCode() == b.hashCode()`.
- The same object returns the same hash code as long as the fields used by `equals` don't change.
- Unequal objects may share a hash code (a **collision**). That's allowed, just slower.

`equals` itself must be reflexive, symmetric, transitive and consistent, and `x.equals(null)` must be `false`. The easy way to get all of this right is a **record** (`record SessionKey(long userId, String device) {}`), which generates both methods from its components. Otherwise use `Objects.equals` and `Objects.hash` over the same fields.

Two more ways to break a hash map:

- **Mutating a key after inserting it.** The entry stays in the bucket for its old hash, so `get` with the new value looks in the wrong bucket, and `get` with the old value finds the entry but `equals` fails. The entry is still there, unreachable. Keys should be immutable.
- **Symmetry across subclasses.** If `ColourPoint extends Point` and both override `equals`, `point.equals(colourPoint)` can be true while the reverse is false. This is one reason to prefer composition, or `final` value classes.

## Inside HashMap

A `HashMap` is an array of **buckets** (16 by default). To place a key it:

1. Calls `key.hashCode()` and mixes the high bits into the low ones (`h ^ (h >>> 16)`), because the next step only uses the low bits.
2. Picks bucket `hash & (capacity - 1)`. Capacity is always a power of two, so this is a cheap modulo.
3. Walks that bucket's entries comparing hashes, then `equals`. If it finds the key it replaces the value; otherwise it adds a new entry.

When the number of entries passes **capacity × load factor** (0.75 by default), the map **resizes**: it doubles the array and moves every entry to its new bucket. One resize is O(n), but doubling keeps the average `put` at O(1). If you know the size in advance, pass a capacity to the constructor and skip the resizes.

If many keys collide in one bucket, lookups in that bucket get slow. Since Java 8, a bucket with more than 8 entries (in a table of at least 64 buckets) is converted from a linked list to a **red-black tree**, so the worst case is O(log n) rather than O(n). That protects against bad hash functions and deliberate collision attacks, and it works best when keys are `Comparable`.

`HashMap` allows one `null` key and `null` values, isn't thread-safe, and has no defined iteration order. `HashSet` is a `HashMap` with a dummy value.

```sim
name: hashmap
title: Inside a HashMap
intro: 'Put keys into a HashMap and watch the buckets. Change how the key class computes hashCode, mutate a key after inserting it, or let the table fill up.'
challenges:
  - {text: 'Fill the map past 75% of its capacity and watch it resize', metric: resized, op: '>=', value: 1}
  - {text: 'Use a constant hashCode until a bucket turns into a tree', metric: treeified, op: '==', value: 1}
  - {text: 'Mutate a key after inserting it, then fail to get it back', metric: lostKey, op: '==', value: 1}
  - {text: 'Override equals without hashCode and miss an equal key', metric: missedEqual, op: '==', value: 1}
takeaway: |
  HashMap finds a key by its hash first and by `equals` second, so the two methods must agree and the fields they use must not change while the key is in a map. Resizing at 75% full keeps chains short on average, and treeifying a long chain caps the damage of a bad hash function at O(log n).
```

```bug
title: A cache key
prompt: This key class is used in a HashMap that caches exchange rates. Which lines cause wrong cache behaviour?
lang: java
code: |
  final class RateKey {
      private String from;
      private final String to;
      RateKey(String from, String to) { this.from = from; this.to = to; }
      void setFrom(String from) { this.from = from; }
      @Override public boolean equals(Object o) {
          return o instanceof RateKey k && from.equals(k.from) && to.equals(k.to);
      }
      @Override public int hashCode() { return from.hashCode(); }
  }
bug: [2, 5]
explain: |
  **Lines 2 and 5**: `from` is mutable, and `equals` and `hashCode` both depend on it. Change it after the key is in the map and the entry stays in its old bucket, where no lookup will ever find it. Make the field `final` and drop the setter, or better, write `record RateKey(String from, String to) {}`. Line 9 is legal: hashing on `from` alone is consistent with `equals` (equal keys have equal `from`), just weaker, because every rate from GBP collides.
```

## Choosing a collection

| Need | Use | Why |
|---|---|---|
| A list you index and append to | `ArrayList` | Contiguous array: O(1) get and amortised O(1) add at the end. Inserting in the middle shifts elements. |
| A queue or stack | `ArrayDeque` | O(1) at both ends, faster than `LinkedList` and `Stack`. Doesn't allow `null`. |
| Lookup by key | `HashMap` | O(1) average, no ordering. |
| Lookup plus insertion or access order | `LinkedHashMap` | A HashMap with a doubly linked list through the entries. With `accessOrder = true` and `removeEldestEntry`, it's an LRU cache. |
| Sorted keys, ranges, nearest key | `TreeMap` | Red-black tree: O(log n), with `floorKey`, `ceilingKey`, `headMap`, `subMap`. |
| Smallest or largest first | `PriorityQueue` | Binary heap: O(log n) offer and poll, O(1) peek. Iterating it is **not** in sorted order. |
| Enum keys | `EnumMap`, `EnumSet` | Backed by an array or a bit set, very fast. |

`LinkedList` is rarely the right answer. Each node is a separate object, so it uses more memory and its elements are scattered across the heap, which is bad for the CPU cache. Even its O(1) insert needs an O(n) walk to the position first.

`TreeMap` and `TreeSet` decide equality with `compareTo` (or the `Comparator`), not `equals`. If the two disagree, a `TreeSet` can hold "duplicates" or drop distinct items. A comparator for `BigDecimal` values, for instance, treats `2.0` and `2.00` as the same key.

```sort
prompt: Which collection fits each Ripple job best?
buckets: [ArrayDeque, LinkedHashMap, TreeMap, PriorityQueue]
items:
  - {text: 'Keep the 1,000 most recently used link previews, evicting the oldest', bucket: 1, why: 'Access order plus removeEldestEntry is a ready-made LRU cache.'}
  - {text: 'Find the exchange rate in effect at a timestamp: the latest entry at or before it', bucket: 2, why: 'floorEntry(timestamp) on a TreeMap keyed by time.'}
  - {text: 'Always process the retry with the earliest due time next', bucket: 3, why: 'A min-heap ordered by due time: O(log n) offer and poll.'}
  - {text: 'A breadth-first search frontier', bucket: 0, why: 'A FIFO queue with cheap adds and removes at the ends.'}
  - {text: 'Return query parameters in the order the client sent them', bucket: 1, why: 'Insertion order with hash lookups.'}
  - {text: 'Pick the top 10 links by clicks from a stream of millions', bucket: 3, why: 'Keep a min-heap of size 10 and evict its smallest.'}
```

## Iterators, views and immutability

Most collections in `java.util` have **fail-fast iterators**: each keeps the `modCount` it started with, and if the collection is changed structurally by anything other than the iterator itself, the next call throws `ConcurrentModificationException`. That's how removing from a list inside a for-each loop fails, even with a single thread. Use `iterator.remove()`, or `list.removeIf(x -> ...)`. Fail-fast is a best-effort bug detector, not a thread-safety guarantee. Concurrent collections like `ConcurrentHashMap` and `CopyOnWriteArrayList` have weakly consistent iterators that never throw.

Three kinds of "read-only" list behave differently:

- **`Collections.unmodifiableList(list)`** is a **view**: you can't change it through the view, but changes to the original list show through.
- **`List.of(...)`, `List.copyOf(...)`, `stream.toList()`** are truly **immutable**: nobody can change them. `List.of` and `List.copyOf` reject `null` elements, and their `contains(null)` throws.
- **`Arrays.asList(array)`** is a fixed-size list backed by the array: `set` works and writes through to the array, but `add` and `remove` throw `UnsupportedOperationException`.

To return internal state safely from a class, return `List.copyOf(items)` rather than the field itself.

```predict
prompt: |
  What happens?
  ```java
  List<String> ids = new ArrayList<>(List.of("a", "b", "c"));
  for (String id : ids) {
      if (id.equals("a")) ids.remove(id);
  }
  ```
choices:
  - 'The loop finishes and `ids` is `[b, c]`'
  - '`ConcurrentModificationException` on the next step of the loop'
  - '`UnsupportedOperationException`, because the list came from `List.of`'
  - 'Nothing is removed, because the loop works on a copy of `ids`'
answer: 1
reveal: |
  Removing "a" through the list changes its modCount, and the for-each loop's hidden iterator notices on its next `next()` call. (Removing the second-to-last element happens to skip the check and silently misses the last one, which is worse.) The `new ArrayList<>(...)` copy is mutable, so it's not an UnsupportedOperationException. Use `ids.removeIf(id -> id.equals("a"))`.
```

```recall
prompt: An interviewer asks, "How does a HashMap work, and why must you override hashCode when you override equals?" Answer as you would out loud.
points:
  - An array of buckets; the key's hashCode (with high bits mixed in) picks the bucket, then equals finds the key within it
  - Resizes by doubling when size passes capacity times the load factor of 0.75, so operations are O(1) on average
  - Long chains become red-black trees (more than 8 in one bucket), giving O(log n) worst case
  - Equal objects must have equal hash codes, otherwise an equal key is looked for in the wrong bucket and get returns null
model: |
  A HashMap is an array of buckets. To find a key it takes `hashCode()`, mixes the high bits in, and uses the low bits to pick a bucket. Within that bucket it compares hashes, then calls `equals`. When the map passes 75% of its capacity it doubles the array and redistributes the entries, which keeps chains short and operations O(1) on average. If one bucket gets more than eight entries, Java 8 and later turn it into a red-black tree, so the worst case is O(log n). Because lookup goes through the hash first, two equal keys must have the same hash code. If you override `equals` but not `hashCode`, an equal key built for a lookup hashes to a different bucket, `equals` never even runs, and `get` returns null. For the same reason, keys must not change while they're in the map.
```

```questions
- kind: check
  prompt: A class overrides equals to compare id and name, but keeps Object's hashCode. What happens when it's used as a HashMap key?
  choices:
    - text: Lookups with a new but equal key usually return null
      correct: true
    - text: The code doesn't compile until hashCode is overridden
      why: The compiler doesn't check the contract.
    - text: Equal keys are found, just more slowly, because they collide
      why: The default identity hash puts equal keys in different buckets, so equals is never reached.
    - text: The map throws IllegalStateException on put
      why: HashMap has no way to detect the violation.
  explanation: HashMap picks the bucket by hash before comparing with equals. Equal objects with different hashes end up in different buckets.
- kind: check
  prompt: A HashMap has the default capacity of 16 and load factor 0.75. When does it first resize?
  choices:
    - text: When the 13th entry is added
      correct: true
    - text: When the 17th entry is added
      why: It resizes at 75% of capacity, not when full.
    - text: When any bucket holds more than 8 entries
      why: That triggers treeification, not a resize.
    - text: Never; buckets are linked lists that grow without limit
      why: HashMap doubles its table to keep chains short.
  explanation: The threshold is 16 × 0.75 = 12, so the 13th entry doubles the table to 32 buckets.
- kind: check
  prompt: Which of these let a caller change what a class returns from `getItems()`?
  type: multi
  choices:
    - text: Returning the internal ArrayList field directly
      correct: true
    - text: Returning Collections.unmodifiableList(items), then the class changing items later
      correct: true
    - text: Returning List.copyOf(items)
      why: An immutable copy; nobody can change it, and later internal changes don't show through.
    - text: Returning items.stream().toList()
      why: Also an unmodifiable copy.
  explanation: An unmodifiable view blocks writes through the view but reflects later changes to the original. A copy is a snapshot.
- kind: check
  prompt: You need "the latest price at or before time t" for millions of lookups. Which structure and method?
  choices:
    - text: TreeMap<Instant, Price> with floorEntry(t)
      correct: true
    - text: HashMap<Instant, Price> with get(t)
      why: Only exact matches; no "at or before".
    - text: PriorityQueue<Price> ordered by time, polling until t
      why: Polling destroys the queue and is O(k log n) per lookup.
    - text: LinkedHashMap<Instant, Price> iterated backwards from the end
      why: LinkedHashMap has no backwards seek, so this is O(n).
  explanation: A TreeMap keeps keys sorted and answers floor and ceiling queries in O(log n).
- kind: fire
  prompt: Removing elements from an ArrayList inside a for-each loop over it. Safest fix?
  choices:
    - text: list.removeIf(predicate)
      correct: true
    - text: Wrap the loop in synchronized (list)
      why: The exception isn't about threads; one thread triggers it.
    - text: Catch ConcurrentModificationException and continue
      why: The iterator is broken by then.
  explanation: removeIf (or iterator.remove) changes the list through the iteration itself.
- kind: fire
  prompt: Since Java 8, what does HashMap do when one bucket gets more than 8 entries in a large table?
  choices:
    - text: Turns that bucket's list into a red-black tree
      correct: true
    - text: Doubles the table immediately, so the chain spreads out
      why: Resizing is driven by total size, not one bucket.
    - text: Rehashes the keys with a different seed to spread them out
      why: Java's HashMap doesn't reseed.
  explanation: Treeification caps lookups in a bad bucket at O(log n).
- kind: fire
  prompt: Why is ArrayDeque usually preferred to LinkedList as a queue?
  choices:
    - text: It's a compact array, so it's faster and uses less memory
      correct: true
    - text: It's thread-safe, so producers and consumers can share it
      why: Neither is thread-safe.
    - text: It allows null elements, which LinkedList forbids outright
      why: The reverse: ArrayDeque rejects null.
  explanation: LinkedList allocates a node per element and scatters them across the heap.
- kind: fire
  prompt: What does iterating a PriorityQueue with for-each give you?
  choices:
    - text: The elements in heap order, which isn't sorted
      correct: true
    - text: The elements in order, from the smallest to the largest
      why: Only repeated poll() gives sorted order.
    - text: The elements in insertion order
      why: The heap rearranges them on every insert.
  explanation: A PriorityQueue only guarantees that the head is the smallest.
```
