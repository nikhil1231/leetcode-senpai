---
id: java-exceptions-streams
category: java
skill: java
title: Exceptions, lambdas and streams
minutes: 16
summary: Checked exceptions are for failures a caller can handle, unchecked ones for programming errors, and `try`-with-resources closes things in the right order without losing the original failure. Lambdas implement functional interfaces and can capture only effectively final variables. Streams are lazy pipelines that run when a terminal operation pulls on them, and `Optional` is for return values. Interviewers probe the exception hierarchy, `finally` traps, handling `InterruptedException`, stream laziness and collector pitfalls, and `orElse` versus `orElseGet`.
objectives:
  - Choose between checked and unchecked exceptions, and handle them without losing information
  - Explain what try-with-resources and finally guarantee, including suppressed exceptions
  - Explain lambdas, functional interfaces and effectively final capture
  - Predict when a stream pipeline runs, and avoid the common collector and Optional traps
sources:
  - ['Java Language Specification: Exceptions', 'https://docs.oracle.com/javase/specs/jls/se21/html/jls-11.html']
  - ['The Java Tutorials: The try-with-resources Statement', 'https://docs.oracle.com/javase/tutorial/essential/exceptions/tryResourceClose.html']
  - ['Java SE docs: java.util.stream', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/stream/package-summary.html']
---

> [!story] The shutdown that hung
> A Ripple worker caught `InterruptedException` around `queue.take()` with an empty `catch` block and carried on looping. When the service shut down, the executor interrupted the worker, the exception was swallowed, the interrupt flag was cleared, and the thread went straight back to waiting. Shutdown hung until Kubernetes killed the pod 30 seconds later. Restoring the flag with `Thread.currentThread().interrupt()` and leaving the loop fixed it.

## The exception hierarchy

Everything thrown is a `Throwable`, which has two branches:

- **`Error`**: problems with the JVM itself (`OutOfMemoryError`, `StackOverflowError`). Don't catch these in normal code.
- **`Exception`**: problems your program might handle. Its subclass **`RuntimeException`** and everything below it is **unchecked**. Every other `Exception` (`IOException`, `SQLException`, `InterruptedException`) is **checked**: the compiler makes you catch it or declare it with `throws`.

The usual guidance is checked exceptions for conditions a caller can reasonably recover from (a file that might not exist), and unchecked for programming errors (`IllegalArgumentException`, `NullPointerException`, `IllegalStateException`). Many modern codebases and frameworks lean on unchecked exceptions, because checked ones don't compose with lambdas and leak implementation details through every layer's `throws` clause.

Handling exceptions well comes down to a few habits:

- **Don't swallow.** An empty `catch` hides the failure. Either handle it, or wrap and rethrow.
- **Keep the cause.** `throw new PaymentException("refund failed", e)` keeps the original stack trace. `throw new PaymentException(e.getMessage())` throws it away.
- **Catch narrowly.** `catch (Exception e)` also catches the `NullPointerException` from your own bug.
- **Don't use exceptions for ordinary control flow.** Building the stack trace is expensive.
- **`InterruptedException` is a request to stop.** If you can't rethrow it, restore the flag with `Thread.currentThread().interrupt()` and finish up.

## finally and try-with-resources

A `finally` block runs whether the `try` completes normally, returns or throws. It doesn't run if the JVM exits or the thread is killed. Two traps:

- A `return` in `finally` **overrides** the `try`'s return value and **discards** any exception that was in flight. Never return from `finally`.
- An exception thrown from `finally` (for example by `close()`) replaces the original one, so you lose the real cause.

`try`-with-resources fixes the second trap. Any `AutoCloseable` declared in the parentheses is closed automatically, in reverse order of opening, even when the body throws. If both the body and `close()` throw, the body's exception is the one that propagates, and the `close()` exception is attached to it as a **suppressed exception** (`e.getSuppressed()`), so neither is lost.

```java
try (Connection c = pool.getConnection();
     PreparedStatement ps = c.prepareStatement(SQL)) {
    ps.setLong(1, id);
    return ps.executeUpdate();
}   // ps closes first, then c, whatever happened above
```

```predict
prompt: |
  What does `count()` return?
  ```java
  static int count() {
      int n = 1;
      try {
          n = 2;
          return n;
      } finally {
          n = 3;
      }
  }
  ```
choices:
  - '3, because finally runs last and changes n'
  - '2, because the return value was already worked out before finally ran'
  - '1, because finally undoes the assignment made in the try block'
  - 'It doesn''t compile, because finally can''t assign a variable that try returned'
answer: 1
reveal: |
  `return n` evaluates `n` (2) and saves that value, then `finally` runs. Changing the local variable afterwards doesn't touch the saved value. If `finally` had its own `return 3`, that would win, and it would also discard any exception from the `try`, which is why returning from `finally` is a bug.
```

## Lambdas and functional interfaces

A **functional interface** has exactly one abstract method, and a lambda is a compact implementation of it. `java.util.function` has the common shapes:

| Interface | Method | Shape |
|---|---|---|
| `Supplier<T>` | `get()` | nothing in, T out |
| `Consumer<T>` | `accept(T)` | T in, nothing out |
| `Function<T, R>` | `apply(T)` | T in, R out |
| `Predicate<T>` | `test(T)` | T in, boolean out |
| `BiFunction<T, U, R>`, `UnaryOperator<T>`, `BinaryOperator<T>` | | two in, or same type in and out |

There are primitive versions too (`IntPredicate`, `ToLongFunction`) that avoid boxing. A **method reference** (`String::length`, `this::send`, `ArrayList::new`) is shorthand for a lambda that only calls that method.

A lambda can use local variables from the enclosing method only if they're **effectively final** (never reassigned). It captures the value, and lambdas often run later or on another thread, so a changing local would be confusing and racy. Fields aren't restricted, because the lambda captures `this` and reads the field through it. That's also how a lambda in a long-lived callback can keep its enclosing object alive.

Checked exceptions and lambdas don't mix: `Function.apply` declares no `throws`, so a lambda that calls a method throwing `IOException` must catch it, usually wrapping it in `UncheckedIOException`.

## Streams

A stream is a pipeline: a source (`list.stream()`), zero or more **intermediate operations** (`filter`, `map`, `flatMap`, `sorted`, `distinct`, `limit`), and one **terminal operation** (`collect`, `toList`, `forEach`, `reduce`, `count`, `findFirst`, `anyMatch`).

- **Lazy**: nothing runs until the terminal operation. Then elements flow through the whole pipeline one at a time, so `filter` then `map` is one pass, not two.
- **Short-circuiting**: `findFirst`, `anyMatch` and `limit` stop pulling once they have the answer, so a pipeline over an infinite `Stream.iterate` can finish.
- **Single-use**: a stream can be consumed once. Reusing it throws `IllegalStateException`.
- **No side effects**: don't modify the source or shared state from inside `map` or `filter`. `peek` is for debugging.
- **Stateful operations** (`sorted`, `distinct`) have to see every element before passing any on.

Collector traps that come up in interviews and code reviews:

- `Collectors.toMap(k, v)` **throws `IllegalStateException` on a duplicate key**. Pass a merge function: `toMap(k, v, (a, b) -> a)`.
- `Collectors.groupingBy(f)` gives a `Map<K, List<T>>`. Add a downstream collector for counts or sums: `groupingBy(f, counting())`.
- `stream.toList()` (Java 16) returns an unmodifiable list; `collect(Collectors.toList())` makes no such promise.

`parallelStream()` splits work across the common `ForkJoinPool`. It helps only for large, CPU-bound, independent work, and blocking calls inside it starve every other user of that pool.

```sim
name: streams
title: Watch a stream pull its elements
intro: 'Build a pipeline over the list of Ripple link ids and run it. Each row shows which stage touched which element, in the order it happened.'
challenges:
  - {text: 'Build a pipeline that runs nothing at all', metric: lazyNothing, op: '==', value: 1}
  - {text: 'Make findFirst stop before reading the whole list', metric: shortCircuit, op: '==', value: 1}
  - {text: 'Add sorted and see it read every element before passing one on', metric: barrier, op: '==', value: 1}
takeaway: |
  A stream does nothing until a terminal operation pulls, and then each element travels the whole pipeline before the next one starts. Short-circuiting operations stop pulling as soon as they have their answer. Stateful operations like `sorted` are barriers: they must read everything first, which also makes them useless on infinite streams.
```

## Optional

`Optional<T>` makes "might be absent" part of a method's return type. Use it for return values. Don't use it for fields, parameters or collection elements, and never return `null` from a method declared to return `Optional`.

- Unwrap with `orElse`, `orElseGet`, `orElseThrow`, `map`, `flatMap`, `ifPresent`. Calling `get()` without checking defeats the point.
- **`orElse(x)` always evaluates `x`**, even when a value is present. `orElse(loadDefaultFromDatabase())` runs the query on every call. Use `orElseGet(() -> loadDefaultFromDatabase())`, which only runs when the value is missing.
- For a collection, return an empty collection rather than `Optional<List<T>>`.

```bug
title: Summarising payments
prompt: This method groups today's payments by merchant. Which lines fail or waste work in production?
lang: java
code: |
  Map<String, Long> totals(List<Payment> payments) {
      return payments.stream()
          .filter(p -> p.status() == Status.SETTLED)
          .collect(Collectors.toMap(Payment::merchantId, Payment::pence));
  }
  Merchant merchant(String id) {
      return cache.find(id).orElse(repository.load(id));
  }
bug: [4, 7]
explain: |
  **Line 4**: `toMap` throws `IllegalStateException` as soon as one merchant has two settled payments. Sum them with a merge function, `toMap(Payment::merchantId, Payment::pence, Long::sum)`, or use `groupingBy(Payment::merchantId, summingLong(Payment::pence))`. **Line 7**: `orElse` evaluates its argument first, so `repository.load(id)` hits the database on every call, cached or not. Use `orElseGet(() -> repository.load(id))`.
```

```recall
prompt: An interviewer asks, "How do you decide between checked and unchecked exceptions, and how do you handle an exception you can't deal with where you catch it?" Answer as you would out loud.
points:
  - Checked exceptions for recoverable conditions the caller should handle; unchecked (RuntimeException) for programming errors and broken invariants
  - Checked exceptions don't compose well with lambdas and spread throws clauses, so many codebases wrap them in unchecked ones
  - When you can't handle it, wrap and rethrow with the original as the cause, never swallow it in an empty catch
  - Special cases such as restoring the interrupt flag on InterruptedException, or try-with-resources for cleanup
model: |
  I use checked exceptions when the caller can do something sensible about the failure, like a file not being there or a remote service rejecting a request, and unchecked ones for bugs and broken invariants, like an invalid argument or an impossible state. In practice I lean towards unchecked at most layer boundaries, because checked exceptions don't work inside lambdas and they drag implementation details through every signature. If I catch something I can't handle, I wrap it in an exception that makes sense at this layer and pass the original as the cause, so the stack trace survives. I never leave a catch block empty. InterruptedException is special: if I can't rethrow it, I call `Thread.currentThread().interrupt()` so the code above knows it was asked to stop. And for cleanup I use try-with-resources rather than finally, so a failure in `close()` doesn't hide the real error.
```

```questions
- kind: check
  prompt: Which of these are checked exceptions?
  type: multi
  choices:
    - text: IOException
      correct: true
    - text: InterruptedException
      correct: true
    - text: IllegalArgumentException
      why: It extends RuntimeException, so it's unchecked.
    - text: OutOfMemoryError
      why: It's an Error, which is unchecked and not meant to be caught.
  explanation: Exceptions that aren't RuntimeException or Error subclasses are checked, so the compiler makes you catch or declare them.
- kind: check
  prompt: In try-with-resources, the body throws an exception and then close() throws another. What does the caller get?
  choices:
    - text: The body's exception, with the close() exception attached as suppressed
      correct: true
    - text: The close() exception, which replaces the body's
      why: That's what happens with a hand-written finally, not try-with-resources.
    - text: Both, wrapped in a new MultipleExceptions error
      why: There's no such wrapper; suppressed exceptions hang off the primary one.
    - text: Only the body's exception; the close() failure is dropped silently
      why: It's kept, in getSuppressed().
  explanation: try-with-resources keeps the primary failure and records the cleanup failure as suppressed, so nothing is lost.
- kind: check
  prompt: '`Stream.of(1, 2, 3).peek(System.out::println).map(x -> x * 2);` What is printed?'
  choices:
    - text: Nothing, as there's no terminal operation
      correct: true
    - text: 1, 2, 3, one number per line
      why: peek is intermediate, and intermediate operations are lazy.
    - text: 2, 4, 6, because peek sees the mapped values
      why: Nothing runs, and peek is before map anyway.
    - text: 1, 2, 3, then 2, 4, 6
      why: Streams don't run stage by stage, and this one doesn't run at all.
  explanation: A stream pipeline runs only when a terminal operation such as toList or forEach pulls elements through it.
- kind: check
  prompt: Why can't a lambda assign to a local variable of the enclosing method?
  choices:
    - text: It captures the variable's value, which must be effectively final
      correct: true
    - text: Lambdas run on another thread, so they can't see local variables at all
      why: Many lambdas run on the same thread, and they can read effectively final locals.
    - text: Lambdas can only access static fields of the enclosing class
      why: They can read locals and instance fields too.
    - text: The compiler turns every local variable into a final field
      why: Only captured locals are copied, and the rule is effectively final.
  explanation: Captured locals are copied into the lambda, so the language requires them never to change.
- kind: fire
  prompt: '`cache.get(id).orElse(loadFromDb(id))` is slow even when the cache always hits. Why?'
  choices:
    - text: orElse evaluates loadFromDb(id) every time; use orElseGet
      correct: true
    - text: Optional boxes the value on every call
      why: Boxing is cheap; the database call is the cost.
    - text: The cache returns a defensive copy of the value on every hit
      why: The cache isn't the problem here.
  explanation: Arguments are evaluated before the call. orElseGet takes a Supplier that runs only on a miss.
- kind: fire
  prompt: What does Collectors.toMap do when two elements produce the same key and no merge function is given?
  choices:
    - text: Throws IllegalStateException
      correct: true
    - text: Keeps the last value, like HashMap.put
      why: That's HashMap.put, not toMap.
    - text: Keeps the first value it saw for that key
      why: You need (a, b) -> a for that.
  explanation: Pass a merge function, or use groupingBy.
- kind: fire
  prompt: A thread catches InterruptedException and can't rethrow it. What should it do?
  choices:
    - text: Restore the flag with Thread.currentThread().interrupt()
      correct: true
    - text: Log it at warning level and carry on looping
      why: That ignores a request to stop, and shutdown hangs.
    - text: Call System.exit(1) so the service restarts
      why: That kills the whole JVM.
  explanation: Catching the exception clears the flag, so restore it for the code above.
- kind: fire
  prompt: What happens to an in-flight exception if the finally block executes `return 0`?
  choices:
    - text: It's discarded, and the method returns 0
      correct: true
    - text: It propagates, and the return in finally is ignored
      why: A completing return in finally wins.
    - text: It's attached as a suppressed exception
      why: Suppression is a try-with-resources feature.
  explanation: Returning from finally silently swallows exceptions. Never do it.
```
