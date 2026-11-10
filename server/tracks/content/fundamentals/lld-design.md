---
id: lld-design
category: architecture
skill: architecture
title: 'Low-level design: SOLID, patterns and UML'
minutes: 16
summary: Low-level design rounds ask you to model a small system in classes, a parking lot, a vending machine or a rate limiter, and judge whether the design will survive change. SOLID names five habits that keep classes small and swappable. A handful of design patterns (strategy, observer, factory, adapter, decorator, state, builder) are shared vocabulary for common shapes, and composition usually beats inheritance. UML class and sequence diagrams are how you sketch it on a whiteboard. The round rewards clarifying requirements, clean responsibilities and a design you can extend live.
objectives:
  - Explain each SOLID principle with an example of breaking and fixing it
  - Recognise strategy, observer, factory, adapter, decorator, state and builder, and when each fits
  - Prefer composition over inheritance, and say why
  - Read and draw UML class diagrams (association, aggregation, composition, inheritance) and sequence diagrams
  - Run an LLD interview from requirements to an extensible design
sources:
  - ['Robert C. Martin, Design Principles and Design Patterns (2000)', 'https://web.archive.org/web/20150906155800/http://www.objectmentor.com/resources/articles/Principles_and_Patterns.pdf']
  - ['Gamma, Helm, Johnson, Vlissides, Design Patterns: Elements of Reusable Object-Oriented Software (1994)', 'https://en.wikipedia.org/wiki/Design_Patterns']
  - ['Refactoring.Guru: Design patterns catalogue', 'https://refactoring.guru/design-patterns/catalog']
  - ['Martin Fowler, UML Distilled', 'https://martinfowler.com/books/uml.html']
---

## SOLID

Five principles, each a guard against a specific kind of pain when requirements change:

- **S, single responsibility**: a class should have one reason to change. An `Invoice` that calculates totals, renders a PDF and emails itself changes when tax rules, branding or the mail provider change. Split it into `Invoice`, `InvoiceRenderer` and `InvoiceMailer`.
- **O, open/closed**: open for extension, closed for modification. Adding a payment method shouldn't mean editing a `switch` in five places; add a new `PaymentMethod` implementation.
- **L, Liskov substitution**: a subtype must work anywhere its parent does, without surprises. The classic violation: `Square extends Rectangle` breaks code that sets width and height independently. If a subclass throws `UnsupportedOperationException` for a parent method, it's probably not a subtype.
- **I, interface segregation**: clients shouldn't depend on methods they don't use. A `Machine` interface with `print`, `scan` and `fax` forces a simple printer to stub out fax. Split into `Printer`, `Scanner`, `Fax`.
- **D, dependency inversion**: high-level policy depends on abstractions, not on concrete details. `OrderService` takes a `PaymentGateway` interface in its constructor rather than creating a `StripeClient`, so you can swap providers and test with a fake.

SOLID is a means, not an end. Applied dogmatically to a 200-line script it produces a maze of one-method interfaces. Use it where change is likely.

```sort
prompt: Which principle does each design break?
buckets: [Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion]
items:
  - {text: 'A ReportService that queries the DB, formats HTML and sends email', bucket: 0, why: 'Three reasons to change.'}
  - {text: 'Every new shipping carrier means adding a case to calculateCost()''s switch', bucket: 1, why: 'Extension requires modification.'}
  - {text: 'ReadOnlyList extends ArrayList and throws on add()', bucket: 2, why: 'Callers expecting a list break.'}
  - {text: 'A Bird interface with fly(), forcing Penguin to throw', bucket: 3, why: 'Clients depend on a method that doesn''t apply. (Also a Liskov smell.)'}
  - {text: 'OrderService does new MySqlOrderRepository() in its constructor', bucket: 4, why: 'Policy is welded to a detail; inject an interface.'}
  - {text: 'A UserManager with login, billing, avatar resizing and audit logging', bucket: 0, why: 'A god class.'}
```

## Composition over inheritance

Inheritance couples a subclass to its parent's internals: change the parent and every child may break (the "fragile base class"), and you can only inherit along one axis. A `Duck` hierarchy that needs flying and non-flying, quacking and squeaking, ends up with `RubberSqueakingNonFlyingDuck`. Composition gives the object parts it delegates to: a `Duck` *has* a `FlyBehaviour` and a `QuackBehaviour`, chosen at construction and swappable at runtime. Use inheritance for genuine is-a relationships with shared behaviour (and keep hierarchies shallow); compose for everything else.

## Patterns worth knowing

| Pattern | Problem it solves | Example |
|---|---|---|
| **Strategy** | Swap an algorithm at runtime | Pricing rules, route planners, rate-limit algorithms |
| **Observer** | Notify many listeners of changes without knowing them | UI events, domain events, pub/sub |
| **Factory** (method / abstract) | Create objects without naming concrete classes | `Notification.create("sms")` |
| **Builder** | Construct complex objects step by step, readably | HTTP requests, query builders |
| **Adapter** | Make an existing interface fit the one you need | Wrapping a vendor SDK behind your `PaymentGateway` |
| **Decorator** | Add behaviour by wrapping, without subclassing | Retry, caching or logging around a client; Java I/O streams |
| **State** | Behaviour changes with an object's state | Vending machine, order lifecycle, TCP connection |
| **Singleton** | One shared instance | Config, connection pool. Use sparingly: it's global state and hard to test; prefer injecting one instance |
| **Command** | Represent an action as an object | Undo/redo, job queues |

```sort
prompt: Which pattern fits each requirement?
buckets: [Strategy, Observer, Adapter, Decorator, State]
items:
  - {text: 'Let a checkout choose between percentage, fixed and buy-one-get-one discounts', bucket: 0, why: 'Interchangeable algorithms behind one interface.'}
  - {text: 'Add retries and metrics to an HTTP client without changing it', bucket: 3, why: 'Wrap it in objects with the same interface.'}
  - {text: 'Make a legacy XML payment SDK usable through your PaymentGateway interface', bucket: 2, why: 'Translate one interface into another.'}
  - {text: 'A vending machine that behaves differently when idle, holding coins, or out of stock', bucket: 4, why: 'Each state is an object handling the same events.'}
  - {text: 'When an order ships, email the customer, update analytics and notify the warehouse', bucket: 1, why: 'The order shouldn''t know who''s listening.'}
  - {text: 'Pick a token-bucket or sliding-window rate limiter by configuration', bucket: 0, why: 'Same interface, different algorithm.'}
```

```bug
title: A parking lot fee calculator
prompt: This works today. Which lines will hurt most when the business adds an electric-vehicle rate and a weekend discount?
lang: java
code: |
  class ParkingLot {
      private final MySqlTicketStore store = new MySqlTicketStore();

      double fee(Ticket t) {
          long hours = t.hoursParked();
          switch (t.vehicleType()) {
              case "car":        return hours * 3.0;
              case "motorcycle": return hours * 1.5;
              case "truck":      return hours * 6.0;
              default: throw new IllegalArgumentException();
          }
      }

      void exit(Ticket t) {
          double amount = fee(t);
          new StripeClient("sk_live_...").charge(t.card(), amount);
          store.close(t);
      }
  }
bug: [2, 6, 16]
explain: |
  Line 6: pricing is a switch on a type string, so every new rate (EVs, weekends, peak hours) edits this method: an open/closed violation. Use a `PricingStrategy` interface (or a rate table), chosen per vehicle and composable with discounts. Line 2 and line 16 construct concrete dependencies, including a live secret, inside the class: dependency inversion is broken, the class can't be tested without MySQL and Stripe, and switching provider means editing it. Inject a `TicketStore` and a `PaymentGateway` through the constructor.
```

## UML on a whiteboard

You need two diagrams.

**Class diagrams**: a box per class (name, key fields, key methods), and relationships:

- **Association** (plain line): one uses or knows another. `Driver — Vehicle`.
- **Aggregation** (hollow diamond on the whole): has-a, parts can exist alone. `Team ◇— Player`.
- **Composition** (filled diamond on the whole): owns, parts die with the whole. `Order ◆— OrderLine`.
- **Inheritance** (hollow triangle at the parent) and **realisation** (dashed line, hollow triangle, to an interface).
- **Dependency** (dashed arrow): uses temporarily, such as a method parameter.
- **Multiplicity** at the ends: `1`, `0..1`, `*`, `1..*`.

**Sequence diagrams**: lifelines across the top, messages as arrows down the page in time order, return values as dashed arrows. They're the best way to show one use case end to end ("driver exits: gate → ticket service → pricing → payment → gate opens") and they expose missing responsibilities quickly.

```sort
prompt: Which UML relationship fits?
buckets: [Composition (filled diamond), Aggregation (hollow diamond), Inheritance (triangle), Dependency (dashed arrow)]
items:
  - {text: 'A House and its Rooms: rooms don''t exist without the house', bucket: 0}
  - {text: 'A Department and its Professors, who can move departments', bucket: 1}
  - {text: 'ElectricCar is a kind of Car', bucket: 2}
  - {text: 'ReportGenerator takes a DateFormatter as a method argument', bucket: 3}
  - {text: 'An Order and its OrderLines', bucket: 0}
  - {text: 'A Playlist and its Songs, which exist in other playlists too', bucket: 1}
```

## Running the round

```order
prompt: Put the steps of a low-level design interview in a sensible order.
items:
  - Clarify requirements and scope (what must it do, what's out, scale, concurrency)
  - Name the core entities and their responsibilities
  - Sketch the class diagram with relationships and key methods
  - Walk one or two use cases through a sequence diagram
  - Write the core code for the interesting part, with interfaces at the seams
  - Handle edge cases and concurrency (two cars, one spot)
  - Extend the design live with a new requirement and show what changes
explain: Interviewers judge the last step hardest. A design where a new vehicle type or pricing rule is one new class, and nothing else changes, is the payoff for every earlier step. Mention concurrency explicitly; two gates assigning the same spot is the classic follow-up.
```

```recall
prompt: Design the classes for a parking lot with multiple floors, spot sizes (small, regular, large), entry and exit gates, and hourly pricing that varies by vehicle type. What are the main classes, and how does your design handle adding a new pricing rule?
points:
  - Entities such as ParkingLot, Floor, ParkingSpot with a size, Vehicle types, Ticket, and Gate
  - A spot-assignment component that finds a free spot that fits the vehicle size
  - Pricing behind a PricingStrategy interface, so new rules are new classes, possibly composed or decorated for discounts
  - Payment and storage injected as interfaces (PaymentGateway, TicketRepository)
  - Concurrency, so that two gates can't assign the same spot (an atomic claim, a lock or a unique constraint)
model: |
  Core entities: `ParkingLot` has `Floor`s, each with `ParkingSpot`s that have a size and an occupied flag. `Vehicle` has a type that maps to the smallest spot size it fits. `Ticket` records vehicle, spot, entry time. `EntryGate` asks a `SpotAllocator` for a spot; the allocator picks the first free spot that fits (strategy-swappable: nearest to the exit, fill floors in order). `ExitGate` asks a `PricingStrategy` for the fee, charges through an injected `PaymentGateway`, frees the spot and closes the ticket through a `TicketRepository`. Pricing is an interface, `fee(ticket)`, with implementations per vehicle type; a weekend discount or EV rate is a new class, or a decorator wrapping another strategy, so nothing existing changes. For concurrency, claiming a spot must be atomic: a compare-and-set on the spot, a lock per floor, or in a database a unique constraint on the active spot, so two gates can't hand out the same one.
```

```questions
- kind: check
  prompt: Square extends Rectangle, overriding setWidth to also set the height. Code that sets a rectangle's width to 5 and height to 4 and expects area 20 gets 16. Which principle is violated?
  choices:
    - text: Liskov substitution
      correct: true
    - text: Single responsibility
      why: Each class still has one job.
    - text: Interface segregation
      why: The interface isn't too broad.
    - text: Dependency inversion
      why: No concrete dependency is involved.
  explanation: A subtype must honour the parent's behavioural contract, not just its method signatures.
- kind: check
  prompt: You need to add retries, caching and logging around a third-party API client, in different combinations per caller. Which pattern fits?
  choices:
    - text: Decorator
      correct: true
    - text: Singleton
      why: That controls instance count, not behaviour.
    - text: Subclassing the client for each combination
      why: That's a class per combination, and it couples you to the client's internals.
    - text: Observer
      why: Observer notifies listeners of events.
  explanation: Each wrapper has the client's interface, so they stack in any order.
- kind: check
  prompt: Why is composition often preferred to inheritance?
  choices:
    - text: It avoids coupling to a parent's internals and lets behaviour vary independently
      correct: true
    - text: Inheritance is slower at runtime because of virtual method dispatch
      why: Performance isn't the argument.
    - text: Composition removes the need for interfaces
      why: Composition usually relies on interfaces.
    - text: Inheritance can't share code
      why: It can; the cost is coupling.
  explanation: Use inheritance for genuine is-a relationships with shallow hierarchies.
- kind: check
  prompt: In a UML class diagram, Order ◆— OrderLine (filled diamond at Order) means what?
  choices:
    - text: Composition - Order owns its lines, which don't exist without it
      correct: true
    - text: Aggregation - lines are shared and can belong to several orders
      why: That's the hollow diamond.
    - text: OrderLine inherits from Order
      why: Inheritance uses a hollow triangle.
  explanation: Lifetimes are tied together.
- kind: fire
  prompt: What does the D in SOLID say?
  choices:
    - text: Depend on abstractions, not concrete implementations
      correct: true
    - text: "Don't repeat yourself: share logic instead of copying it"
      why: DRY isn't part of SOLID.
    - text: Decouple data from behaviour
      why: Not one of the principles.
  explanation: Dependency inversion, usually achieved through injection.
- kind: fire
  prompt: Which pattern lets you swap an algorithm at runtime behind one interface?
  choices:
    - text: Strategy
      correct: true
    - text: Adapter
      why: Adapter converts one interface into another.
    - text: Builder
      why: Builder constructs objects.
  explanation: Pricing rules and route planners are classic strategies.
- kind: fire
  prompt: Which pattern models a vending machine whose response to "insert coin" depends on whether it's idle, has credit or is empty?
  choices:
    - text: State
      correct: true
    - text: Factory
      why: Factory creates objects.
    - text: Command
      why: Command represents actions as objects.
  explanation: Each state is a class handling the same events.
- kind: fire
  prompt: Why is Singleton considered risky?
  choices:
    - text: It's hidden global state that couples code and makes testing hard
      correct: true
    - text: It can't be made thread-safe in languages like Java or C#
      why: It can be.
    - text: It uses too much memory
      why: It's one instance.
  explanation: Prefer creating one instance and injecting it.
- kind: fire
  prompt: Which diagram shows messages between objects over time for one use case?
  choices:
    - text: Sequence diagram
      correct: true
    - text: Class diagram
      why: That shows static structure.
    - text: Deployment diagram
      why: That shows where software runs.
  explanation: Lifelines across, messages down in time order.
```
