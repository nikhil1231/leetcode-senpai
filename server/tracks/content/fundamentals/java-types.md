---
id: java-types
category: java
skill: java
title: Java types, references and strings
minutes: 15
summary: Java has eight primitive types and everything else is a reference to an object on the heap. Arguments are always passed by value, and for an object that value is the reference. Autoboxing hides a second kind of number with its own `==` trap and its own NullPointerException, and strings are immutable objects with a shared pool. Interviewers probe pass-by-value, `==` versus `equals`, the Integer cache, string building, integer overflow and why money is never a `double`.
objectives:
  - Explain what lives on the stack and what lives on the heap, and why Java is always pass-by-value
  - Predict when `==` on boxed numbers and strings gives a surprising answer, and what to use instead
  - Explain why strings are immutable and when to use StringBuilder
  - Spot numeric traps such as overflow, integer division and floating-point money
sources:
  - ['Java Language Specification: Types, Values, and Variables', 'https://docs.oracle.com/javase/specs/jls/se21/html/jls-4.html']
  - ['Java Language Specification: Boxing conversion', 'https://docs.oracle.com/javase/specs/jls/se21/html/jls-5.html#jls-5.1.7']
  - ['Java SE docs: String', 'https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/lang/String.html']
---

> [!story] The refund check that passed in tests
> Ripple's payments service compared two refund amounts with `if (a.getAmountPence() == b.getAmountPence())`, where the getters returned `Long`. Every test used small amounts and passed. In production, refunds over £1.27 were all reported as mismatches, because `==` on two `Long` objects compares references, and Java only caches boxed values from -128 to 127. The fix was `a.getAmountPence().equals(b.getAmountPence())`, or better, returning a primitive `long`.

## Primitives and references

Java has eight **primitive types**: `byte`, `short`, `int`, `long`, `float`, `double`, `char` and `boolean`. A primitive variable holds the value itself. Every other type (arrays, `String`, your own classes, `Integer`) is a **reference type**: the variable holds a reference to an object, and the object lives on the **heap**.

Local variables live in the current method's **stack frame**. So in `int n = 3; User u = new User();` the stack frame holds `3` and a reference, and the `User` object is on the heap. When the method returns, the frame goes away. The object stays until the garbage collector finds that nothing refers to it any more.

Fields of an object live inside that object on the heap, whether they're primitives or references. Static fields belong to the class, not to any instance.

| | Primitive (`int`) | Reference (`Integer`, `User`) |
|---|---|---|
| Variable holds | The value | A reference to a heap object, or `null` |
| Default for a field | `0`, `false`, `'\u0000'` | `null` |
| `==` compares | Values | Whether both refer to the same object |
| Can be `null` | No | Yes |
| Usable as a generic type argument | No (`List<int>` doesn't compile) | Yes |

## Java is always pass-by-value

When you call a method, Java copies each argument into the method's parameter. For a primitive, the copy is the number. For an object, the copy is the **reference**, so the method can change the object the reference points to, but it can't make the caller's variable point somewhere else.

```java
void rename(User u) { u.setName("Ada"); }      // the caller sees the new name
void replace(User u) { u = new User("Ada"); }  // the caller's variable is unchanged
```

This is why a `swap(Integer a, Integer b)` method can't work in Java, and why "Java passes objects by reference" is a common wrong answer. The accurate wording is "Java passes references by value".

```predict
prompt: |
  What does this print?
  ```java
  static void grow(int[] a, StringBuilder sb, String s) {
      a[0] = 99;
      a = new int[]{7};
      sb.append("!");
      s = s + "!";
  }
  int[] nums = {1}; StringBuilder sb = new StringBuilder("hi"); String s = "hi";
  grow(nums, sb, s);
  System.out.println(nums[0] + " " + sb + " " + s);
  ```
choices:
  - '7 hi! hi!'
  - '99 hi! hi'
  - '1 hi hi'
  - '99 hi! hi!'
answer: 1
reveal: |
  `a[0] = 99` changes the array the caller also refers to, so `nums[0]` is 99. Reassigning `a` only changes the method's copy of the reference. `sb.append` mutates the shared StringBuilder. `s + "!"` builds a new String and points the local copy at it, so the caller's `s` still refers to `"hi"`. Strings can't be changed in place.
```

## Autoboxing and the Integer cache

Each primitive has a **wrapper class** (`Integer`, `Long`, `Double`, `Boolean` and so on), and the compiler converts between them automatically: **boxing** turns `int` into `Integer` (via `Integer.valueOf`), and **unboxing** calls `intValue()`. That convenience hides three traps:

- **`==` on wrappers compares references.** `Integer.valueOf` returns a cached object for values from -128 to 127, so `Integer a = 127, b = 127; a == b` is `true`, but with 128 it's `false`. Compare wrappers with `equals`, or unbox to primitives first.
- **Unboxing `null` throws `NullPointerException`.** `int total = map.get("missing");` compiles fine and fails at runtime, because `map.get` returned a null `Integer`. The same happens with a `Boolean` field used in an `if`.
- **Boxing in hot loops costs allocations.** `Long sum = 0L; for (...) sum += x;` creates a new `Long` on every iteration. Use `long`.

Mixed comparisons unbox: `Integer a = 1000; int b = 1000; a == b` is `true`, because the `Integer` is unboxed to compare two `int` values.

```sim
name: refs
title: Stack and heap, one line at a time
intro: 'Pick a program and step through it. The left side is the stack frames, the right side is the heap. Watch which variables share an object.'
challenges:
  - {text: 'Show that a method cannot reassign the caller''s variable', metric: swapFailed, op: '==', value: 1}
  - {text: 'Find a pair of Integers where == says false but equals says true', metric: cacheMiss, op: '==', value: 1}
  - {text: 'Unbox a null and get a NullPointerException', metric: npe, op: '==', value: 1}
takeaway: |
  A variable of a reference type holds a reference, and passing it to a method copies the reference, not the object. Two references can point at one object (so a change through either is visible to both) or at two equal objects (so `==` is false while `equals` is true). Boxed numbers are objects too, which is where the Integer cache and unboxing NPEs come from.
```

## Strings

`String` is an immutable object: every method that seems to change it (`concat`, `replace`, `toUpperCase`, `+`) returns a new string. Immutability makes strings safe to share between threads, safe as `HashMap` keys (the hash can be cached in the object), and safe to pass to security checks without the caller changing them afterwards.

String **literals** are interned: every `"hello"` in your code refers to one object in the **string pool**. Strings built at runtime (`new String("hello")`, concatenation of variables, text read from a file) are separate objects. So `"hello" == "hello"` is `true`, but comparing a literal with a string read from a request is usually `false`. Always compare strings with `equals` (or `equalsIgnoreCase`). `intern()` exists but you rarely need it.

Building a string in a loop with `+=` copies the whole string every time, which is quadratic. Use a `StringBuilder` (not synchronised, the normal choice) and call `toString()` at the end. A single expression like `"id=" + id + ", name=" + name` is fine: the compiler already turns it into efficient code.

Since Java 9, a string that only contains Latin-1 characters is stored with one byte per character (**compact strings**), otherwise two bytes in UTF-16. A `char` is a UTF-16 code unit, so an emoji takes two `char`s and `length()` counts code units, not characters.

```bug
title: A request filter
prompt: This filter decides whether to skip authentication for a request. Which lines are wrong?
lang: java
code: |
  static final String HEALTH = "/health";
  boolean isPublic(HttpRequest req) {
      String path = req.path();
      if (path == HEALTH) return true;
      Boolean internal = req.attribute("internal");
      if (internal) return true;
      return false;
  }
bug: [4, 6]
explain: |
  **Line 4**: `path` comes from the request at runtime, so it's a different object from the `"/health"` literal even when the text is the same, and `==` is false. Use `HEALTH.equals(path)`, which also copes with a null path. **Line 6**: when the attribute is missing, `internal` is `null`, and `if (internal)` unboxes it, throwing `NullPointerException`. Use `Boolean.TRUE.equals(internal)`.
```

## Numbers that surprise people

- **Overflow is silent.** `int` is 32-bit and wraps: `Integer.MAX_VALUE + 1` is `Integer.MIN_VALUE`. Milliseconds since 1970 don't fit in an `int`, which is why time is a `long`. `Math.addExact` throws instead of wrapping. The midpoint `(lo + hi) / 2` overflows for large indexes; `lo + (hi - lo) / 2` doesn't.
- **Integer division truncates towards zero.** `7 / 2` is `3` and `-7 / 2` is `-3`. `-7 % 2` is `-1`, so `n % 2 == 1` misses negative odd numbers. Use `Math.floorMod` when you need a non-negative remainder.
- **`double` can't represent most decimals exactly.** `0.1 + 0.2` is `0.30000000000000004`. Store money as a `long` count of the smallest unit (pence) or use `BigDecimal`, created from a string (`new BigDecimal("0.10")`), not from a double. Compare `BigDecimal`s with `compareTo`, because `equals` also compares the scale, so `2.0` and `2.00` aren't equal.
- **Widening can lose precision.** A `long` converts to `float` or `double` silently, and above 2^53 the `double` can't hold every integer.

```sort
prompt: Primitive or reference?
buckets: [Primitive, Reference]
items:
  - {text: 'long', bucket: 0, why: 'One of the eight primitive types; the variable holds the number.'}
  - {text: 'Long', bucket: 1, why: 'The wrapper class: a reference to an object, which can be null.'}
  - {text: 'int[]', bucket: 1, why: 'Every array is an object, even an array of primitives.'}
  - {text: 'char', bucket: 0, why: 'A 16-bit UTF-16 code unit, held by value.'}
  - {text: 'String', bucket: 1, why: 'An immutable object on the heap.'}
  - {text: 'boolean', bucket: 0, why: 'Primitive; its wrapper is Boolean.'}
```

```recall
prompt: An interviewer asks, "Is Java pass-by-value or pass-by-reference?" Answer as you would out loud, with an example.
points:
  - Java is always pass-by-value
  - For objects, the value that is copied is the reference, so the method and the caller point at the same object
  - The method can mutate the shared object and the caller sees it, but reassigning the parameter doesn't affect the caller's variable
  - A concrete example such as a swap method that can't work, or setName being visible but parameter = new X() not
model: |
  Always pass-by-value. When the argument is a primitive, the method gets a copy of the number. When it's an object, the method gets a copy of the reference, so both the caller and the method point at the same object. That means if the method calls `user.setName("Ada")`, the caller sees the change, because there's only one object. But if the method does `user = new User()`, it only redirects its own copy of the reference, and the caller's variable still points at the original. That's why you can't write a working `swap(a, b)` method in Java.
```

```questions
- kind: check
  prompt: '`Integer a = 128, b = 128;` What is `a == b`, and why?'
  choices:
    - text: false, because == compares references and 128 is outside the Integer cache
      correct: true
    - text: true, because the compiler unboxes both sides to int values before comparing
      why: Both sides are Integer, so nothing is unboxed; == compares references.
    - text: true, because all Integer objects with the same value are interned
      why: Only -128 to 127 are cached by Integer.valueOf.
    - text: It doesn't compile, because == isn't defined for Integer
      why: It compiles; it just compares identity.
  explanation: Integer.valueOf caches -128 to 127. Outside that range each boxing creates a new object, so == is false. Use equals, or compare primitives.
- kind: check
  prompt: A method receives a `List<String> names` and runs `names = new ArrayList<>(); names.add("x");`. What does the caller see?
  choices:
    - text: The caller's list is unchanged
      correct: true
    - text: The caller's list now holds just "x"
      why: Reassigning the parameter only changes the method's copy of the reference.
    - text: The caller's list has "x" added to its existing items
      why: The add went to the new list, not the caller's.
    - text: The caller's variable is now null
      why: Nothing the method does can change the caller's variable.
  explanation: Java copies the reference into the parameter. Reassigning the parameter points the copy at a new list and leaves the caller's variable alone.
- kind: check
  prompt: Which of these can throw NullPointerException at runtime?
  type: multi
  choices:
    - text: '`int n = map.get(key);` where map is a Map<String, Integer>'
      correct: true
    - text: '`if (flag)` where flag is a Boolean field that was never set'
      correct: true
    - text: '`"admin".equals(role)` where role is null'
      why: equals on a non-null literal simply returns false for null.
    - text: '`String s = null; String t = s + "!";`'
      why: String concatenation turns null into the text "null".
  explanation: Unboxing a null wrapper calls intValue() or booleanValue() on null. Calling equals on a literal is the null-safe way round.
- kind: check
  prompt: Ripple stores a balance as a double and adds 0.10 ten times. What's the best fix?
  choices:
    - text: Store pence in a long, or use BigDecimal built from strings
      correct: true
    - text: Round to two decimal places after each addition
      why: Rounding hides the error but compounds it in long calculations.
    - text: Use float instead, since its shorter mantissa rounds away the noise
      why: float has even less precision.
    - text: Compare with == after adding, since the error cancels out
      why: 0.1 has no exact binary representation, so the sum isn't exactly 1.0.
  explanation: Binary floating point can't represent most decimal fractions. Money is an integer count of the smallest unit, or a BigDecimal.
- kind: fire
  prompt: Building a 10,000-line report with `s += line` in a loop is slow. Why?
  choices:
    - text: Each += copies the whole string so far into a new String
      correct: true
    - text: The string pool fills up and has to be garbage collected
      why: Runtime-built strings aren't pooled.
    - text: String methods are synchronised, so each += takes a lock
      why: Strings are immutable and need no locks.
  explanation: Strings are immutable, so repeated concatenation is quadratic. Use a StringBuilder.
- kind: fire
  prompt: What is `Integer.MAX_VALUE + 1` in Java?
  choices:
    - text: Integer.MIN_VALUE
      correct: true
    - text: It throws ArithmeticException
      why: Only Math.addExact and friends throw on overflow.
    - text: 2147483648, promoted to long
      why: int + int stays int and wraps.
  explanation: int arithmetic wraps silently in two's complement.
- kind: fire
  prompt: Why are Java strings immutable?
  choices:
    - text: So they can be shared safely, cached as map keys and pooled
      correct: true
    - text: Because the JVM keeps every string in read-only memory pages
      why: Runtime strings are ordinary heap objects.
    - text: So that == can compare them reliably
      why: == still compares references; use equals.
  explanation: Immutability makes strings thread-safe, lets them cache their hash code, and makes the literal pool possible.
- kind: fire
  prompt: What does `-7 % 2` evaluate to in Java?
  choices:
    - text: '-1'
      correct: true
    - text: '1, the same as floorMod'
      why: That's floorMod; % keeps the sign of the dividend.
    - text: '0, because the result is truncated'
      why: -7 is odd.
  explanation: The remainder takes the sign of the left operand, so checks like n % 2 == 1 miss negative odd numbers.
```
