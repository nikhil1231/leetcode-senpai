---
id: java-oop
category: java
skill: java
title: Classes, interfaces and generics
minutes: 17
summary: Overloading is chosen at compile time from the static types of the arguments, and overriding at runtime from the object's class, which explains most "what does this print" questions. Interfaces carry behaviour through default methods but no instance state, and records, enums and sealed types model data cleanly. Generics are checked by the compiler and erased at runtime, and are invariant, which is what wildcards and PECS are for. Interviewers probe dispatch, abstract class versus interface, immutability, inner-class leaks, erasure and `? extends` versus `? super`.
objectives:
  - Predict which method runs, distinguishing compile-time overloading from runtime overriding
  - Choose between an abstract class, an interface, a record, an enum and a sealed hierarchy
  - Write an immutable class and explain what final does and doesn't guarantee
  - Explain type erasure and invariance, and apply PECS to choose a wildcard
sources:
  - ['Java Language Specification: Classes', 'https://docs.oracle.com/javase/specs/jls/se21/html/jls-8.html']
  - ['JEP 395: Records', 'https://openjdk.org/jeps/395']
  - ['JEP 409: Sealed Classes', 'https://openjdk.org/jeps/409']
  - ['The Java Tutorials: Generics', 'https://docs.oracle.com/javase/tutorial/java/generics/index.html']
---

> [!story] The fee that ignored the override
> Ripple had a `FeeCalculator` with `fee(Payment p)` and `fee(CardPayment p)` overloads. A list of payments was processed with `for (Payment p : payments) calc.fee(p)`, and card payments were charged the generic fee. Overloads are chosen by the compiler from the variable's declared type, and `p` was declared as `Payment`. Moving the logic into an overridden `CardPayment.fee()` method made the choice happen at runtime, on the actual object.

## Overloading and overriding

- **Overloading**: several methods with the same name and different parameter lists. The **compiler** picks one from the **static (declared) types** of the arguments.
- **Overriding**: a subclass redefines an instance method with the same signature. The JVM picks the version from the **runtime class** of the object (**dynamic dispatch**).

So in `Animal a = new Dog(); a.speak();` the `Dog` version of `speak` runs, but in `describe(a)` with overloads `describe(Animal)` and `describe(Dog)`, the `Animal` overload runs, because `a` is declared as `Animal`.

Three things aren't dispatched dynamically:

- **Static methods** are hidden, not overridden: `Parent.util()` versus `Child.util()` is chosen from the declared type.
- **Fields** aren't polymorphic: `a.name` reads the field of the declared type.
- **Private and final methods** can't be overridden, so they're bound at compile time.

An override may return a subtype (a **covariant return**) and may not narrow visibility or throw broader checked exceptions. Always add `@Override`: it turns an accidental overload (a typo in the parameter type) into a compile error. Don't call overridable methods from a constructor, because the subclass version runs before the subclass's fields are initialised.

```predict
prompt: |
  What does this print?
  ```java
  class Shape { String name() { return "shape"; } static String kind() { return "S"; } }
  class Circle extends Shape { String name() { return "circle"; } static String kind() { return "C"; } }
  class Printer {
      static String show(Shape s) { return "Shape:" + s.name(); }
      static String show(Circle c) { return "Circle:" + c.name(); }
  }
  Shape s = new Circle();
  System.out.println(Printer.show(s) + " " + s.kind());
  ```
choices:
  - 'Circle:circle C'
  - 'Shape:circle S'
  - 'Shape:shape S'
  - 'Shape:circle C'
answer: 1
reveal: |
  The overload is picked at compile time from the declared type `Shape`, so `show(Shape)` runs. Inside it, `s.name()` is an overridden instance method, so the runtime class wins and it returns "circle". `kind()` is static: it's hidden rather than overridden, so it's chosen from the declared type too, giving "S".
```

## Abstract classes, interfaces and the newer types

An **interface** declares a type that unrelated classes can share, and a class can implement many. Since Java 8 interfaces can have `default` and `static` methods, and since Java 9 `private` ones, but no instance fields. An **abstract class** can hold state, constructors and protected helpers, but a class can extend only one.

Use an interface for a capability or a contract (`PaymentGateway`, `Comparable`), and an abstract class when subclasses genuinely share state and setup. In practice most designs are interfaces plus composition. Inheritance couples a subclass to its parent's internals, which is why "favour composition over inheritance" is the usual advice.

The newer types each replace a lot of boilerplate:

- **Records** (Java 16): `record Money(long pence, String currency) {}` is a final class with private final fields, a constructor, accessors, and `equals`, `hashCode` and `toString` over the components. Validate in a **compact constructor**. A record is only shallowly immutable: a `List` component can still be changed unless you copy it.
- **Enums**: a fixed set of instances, each a singleton, which can have fields, methods and per-constant behaviour. An enum is also the simplest thread-safe singleton. Use `EnumMap` and `EnumSet` with them.
- **Sealed interfaces** (Java 17): `sealed interface Result permits Ok, Failed {}` lists every allowed subtype. With pattern matching in `switch` (Java 21), the compiler checks that you've handled every case, so adding a new subtype breaks the build where it should.

```java
sealed interface Payment permits Card, BankTransfer {}
record Card(String last4, long pence) implements Payment {}
record BankTransfer(String iban, long pence) implements Payment {}

long fee(Payment p) {
    return switch (p) {
        case Card c -> 20 + c.pence() / 100;
        case BankTransfer b -> 0;
    };  // no default: the compiler knows these are all the cases
}
```

**Nested classes** come in two kinds. A **static nested class** is an ordinary class namespaced inside another. An **inner class** (non-static), including an anonymous class, holds a hidden reference to the enclosing instance. If an inner-class listener or task outlives its outer object, it keeps the whole outer object alive, which is a classic memory leak. Make nested classes `static` unless they need the outer instance.

## Immutability and final

`final` means different things in different places:

- A **final variable or field** can be assigned only once. It says nothing about the object it refers to: a `final List<String>` can still have items added.
- A **final method** can't be overridden, and a **final class** can't be extended (`String`, `Integer`, records).
- **Final fields** also have a memory-model guarantee: once the constructor finishes, other threads see their values without synchronisation, as long as `this` didn't escape during construction.

An immutable class needs all of: a `final` class (or a private constructor), `private final` fields, no setters, and **defensive copies** of mutable inputs and outputs (`List.copyOf` in the constructor, never return the internal array). Immutable objects are thread-safe without locks, make safe map keys, and can be shared and cached freely.

```bug
title: An immutable order
prompt: This class is meant to be immutable and is shared between threads. Which lines break that?
lang: java
code: |
  public final class Order {
      private final String id;
      private final List<String> items;
      private final Instant placedAt;
      public Order(String id, List<String> items, Instant placedAt) {
          this.id = id;
          this.items = items;
          this.placedAt = placedAt;
      }
      public List<String> items() { return items; }
      public Instant placedAt() { return placedAt; }
  }
bug: [7, 10]
explain: |
  **Line 7** stores the caller's list, so the caller can keep changing it after construction. **Line 10** hands the internal list out, so any reader can add to it. Use `this.items = List.copyOf(items);`, which makes an immutable copy (and the accessor can then return it directly). `Instant` is itself immutable, so line 11 is fine. As a record, `record Order(String id, List<String> items, Instant placedAt)` would still need `items = List.copyOf(items)` in a compact constructor.
```

## Generics: erasure and wildcards

Generics give compile-time type checks. At runtime the type arguments are **erased**: `List<String>` and `List<Integer>` are the same class, `List`. That has consequences:

- You can't write `new T()`, `new T[10]`, or `x instanceof List<String>`, and you can't overload `f(List<String>)` with `f(List<Integer>)`.
- Primitives can't be type arguments, so `List<int>` is `List<Integer>`, with boxing.
- Raw types (`List` without `<>`) turn the checks off and produce warnings. Don't use them in new code.

Generics are **invariant**: a `List<Integer>` is **not** a `List<Number>`, even though `Integer` is a `Number`. If it were, you could add a `Double` to a list of integers through the `List<Number>` reference. Arrays are **covariant** (`Integer[]` is a `Number[]`), and that hole is checked at runtime instead: storing a `Double` in it throws `ArrayStoreException`.

Wildcards relax invariance, and **PECS** (producer `extends`, consumer `super`) says which one:

- `List<? extends Number>` is a **producer**: you can read `Number`s out of it, but you can't add anything (except `null`), because you don't know the real element type.
- `List<? super Integer>` is a **consumer**: you can add `Integer`s to it, but what you read back is only an `Object`.

`Collections.copy(List<? super T> dest, List<? extends T> src)` uses both. A bounded type parameter (`<T extends Comparable<? super T>>`) expresses "a T that can be compared", which is how `Collections.sort` is declared.

```sort
prompt: "Which parameter type fits each method? (PECS: producer extends, consumer super)"
buckets: ['List<? extends Number>', 'List<? super Integer>']
items:
  - {text: 'double sum(... nums), which only reads the numbers', bucket: 0, why: 'The list produces values for you to read, so it accepts List<Integer>, List<Double> and so on.'}
  - {text: 'void fillWithZeros(... out, int n), which only adds Integers', bucket: 1, why: 'The list consumes Integers, so List<Integer>, List<Number> and List<Object> all work.'}
  - {text: 'Number max(... nums), which reads and compares', bucket: 0, why: 'Reading only.'}
  - {text: 'void addIds(... target), which adds parsed ids', bucket: 1, why: 'Writing only.'}
```

```recall
prompt: An interviewer asks, "When would you use an abstract class rather than an interface in modern Java?" Answer as you would out loud.
points:
  - A class can implement many interfaces but extend only one class
  - Interfaces can have default, static and private methods but no instance state or constructors
  - An abstract class suits subclasses that share state, constructor logic or protected helpers
  - Prefer interfaces plus composition by default; mention records or sealed interfaces for data and closed hierarchies
model: |
  I'd start with an interface, because a class can implement several and it keeps the contract separate from any implementation. Since Java 8 an interface can carry default methods, so shared behaviour alone isn't a reason for an abstract class any more. What an interface can't have is instance state or a constructor. So I'd use an abstract class when the subclasses really share fields and setup, like a base HTTP client holding a connection pool and retry settings, with subclasses filling in one abstract method. Even then I'd consider composition first, because inheritance ties the subclass to the parent's internals. For plain data I'd use a record, and for a closed set of variants a sealed interface, so a switch over them is checked for missing cases.
```

```questions
- kind: check
  prompt: '`Object o = "hi"; print(o);` with overloads `print(Object)` and `print(String)`. Which runs?'
  choices:
    - text: print(Object), because overloads are chosen from the declared type
      correct: true
    - text: print(String), because the object really is a String at runtime
      why: That's how overriding works, not overloading.
    - text: It doesn't compile, because the call is ambiguous
      why: Object is an exact match for the declared type, so there's no ambiguity.
    - text: Whichever overload was declared first in the class
      why: Declaration order plays no part in overload resolution.
  explanation: The compiler resolves overloads from static types. Only overridden instance methods are dispatched on the runtime class.
- kind: check
  prompt: Why doesn't `List<Number> nums = new ArrayList<Integer>();` compile?
  choices:
    - text: Generics are invariant, or you could add a Double to a list of Integers
      correct: true
    - text: Type erasure removes the type arguments before the assignment is checked
      why: Erasure happens after type checking; this is a deliberate compile-time rule.
    - text: Integer isn't a subtype of Number
      why: It is. The rule is about List<Integer> versus List<Number>.
    - text: ArrayList can't be assigned to a List variable
      why: It can when the type arguments match.
  explanation: Invariance keeps generic collections type-safe. Use List<? extends Number> to accept any list of numbers for reading.
- kind: check
  prompt: Which of these are true of a Java record?
  type: multi
  choices:
    - text: It gets equals, hashCode and toString over its components
      correct: true
    - text: It's implicitly final, and its fields are private and final
      correct: true
    - text: Its List components are deep-copied automatically
      why: Records are shallowly immutable; copy mutable components in a compact constructor.
    - text: It can extend another class
      why: Records implicitly extend java.lang.Record and can only implement interfaces.
  explanation: Records are concise, shallowly immutable data carriers.
- kind: check
  prompt: A Swing-style screen registers an anonymous inner-class listener with a long-lived event bus and never unregisters it. What leaks?
  choices:
    - text: The whole screen, through the listener's hidden reference
      correct: true
    - text: Only the small listener object, which holds no other state
      why: An anonymous inner class holds a reference to its enclosing instance.
    - text: Nothing, because the garbage collector can collect cycles
      why: It isn't a cycle problem; the bus is still reachable and it holds the listener.
    - text: The event bus, which can no longer be collected
      why: The bus is reachable anyway; it's the screen that should have gone.
  explanation: Inner and anonymous classes capture the outer instance. Unregister listeners, or use static nested classes holding only what they need.
- kind: fire
  prompt: Which wildcard should a method that only adds Integers to a list accept?
  choices:
    - text: List<? super Integer>
      correct: true
    - text: List<? extends Integer>
      why: You can't add to an extends-wildcard list.
    - text: List<?>
      why: You can only add null to it.
  explanation: Consumer super. It accepts List<Integer>, List<Number> and List<Object>.
- kind: fire
  prompt: A static method with the same signature is declared in a parent and a child class. Called through a Parent variable that holds a Child, which runs?
  choices:
    - text: The parent's, because static methods aren't overridden
      correct: true
    - text: The child's, because the object's runtime class decides
      why: Dynamic dispatch applies only to instance methods.
    - text: Both of them, the parent's first and then the child's
      why: Only one method runs.
  explanation: Static methods are bound at compile time from the declared type.
- kind: fire
  prompt: Why can't you write `new T[10]` in a generic class?
  choices:
    - text: T is erased, so the JVM can't tell which array type to make
      correct: true
    - text: Arrays can only hold primitive values, not objects
      why: Arrays hold objects fine.
    - text: Generic classes aren't allowed to use arrays at all
      why: They can hold an Object[] internally, as ArrayList does.
  explanation: Arrays need their element type at runtime, and erasure removes it.
- kind: fire
  prompt: What does `final List<String> names = new ArrayList<>();` prevent?
  choices:
    - text: Reassigning names to a different list
      correct: true
    - text: Adding and removing items
      why: final applies to the variable, not the object.
    - text: Other threads reading the list without a lock
      why: final has nothing to do with access.
  explanation: final makes a reference unassignable, not the object immutable.
```
