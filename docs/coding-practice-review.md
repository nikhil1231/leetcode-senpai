# Coding practice reviews and language mix

The review starts with scores, a short verdict and one or two transferable takeaways. Each takeaway carries a principle,
evidence from this attempt and a concrete method to use on another problem. Strengths and conceptual corrections remain
visible; marking details, walkthroughs, test results and reference code can be expanded. Failed tests open automatically.
Old results render without rewriting saved marks or inventing takeaways; new submissions use feedback version 2.

The examiner distinguishes demonstrated wrong beliefs from missing evidence and explanation tips. Thinking aloud, tentative
hypotheses, dictated fillers and imprecise wording must not automatically become misconceptions. Equivalent or clearly
implied understanding counts. Technical terminology can still be corrected without asserting a deeper misconception.

## Languages

Reading and bug localisation target **70% Java, 25% Python, 2.5% Go and 2.5% TypeScript**. Runnable repair, bugfix and feature
exercises support **Java and Python only**, normalising the 70:25 weights to approximately 74:26. Generation balances the
served/ready inventory, and selection favours underrepresented languages among equally suitable ready exercises. These are
long-run targets, not guaranteed percentages in a small batch: difficulty, available exercises and curated fallbacks still
matter. Already-open exercises and saved history are preserved. Old JavaScript exercises remain readable.

## Java runtime

The API image includes OpenJDK 21. Local API development needs `java` and `javac` from Java 21 on PATH to run Java exercises.
Generated repositories use the standard library, with no Maven, Gradle or JUnit. Public test classes contain independent
`public static void testName()` methods; assertions are enabled. Sources, visible tests and hidden tests compile together
for hidden runs, but only the selected test classes execute. Hidden files are never included in a visible run or sent before
submission. Every generated repair must reproduce a failure, have a passing baseline, and pass visible and hidden tests with
the reference fix before entering the ready queue.

The runner disables annotation processors and executes under an unprivileged user, CPU/wall-time limits, bounded output,
a 128 MiB Java heap and a restrictive Java policy. Only reads within the temporary exercise directory are granted; network,
external files, environment reads, subprocesses, native loading and disabling the security manager are denied. No filesystem
writes or third-party dependencies are supported in Java exercises. Temporary files use the default disk-backed temp directory.

This uses the Java 21 Security Manager deliberately. Java 24+ removed it; upgrading the runtime requires a replacement
isolation design. Unsupported runtimes fail closed. Like the existing Python sandbox, this is for generated code edited by a
trusted personal user, not hostile multi-tenant execution. The policy mechanism is documented in
[Oracle's Java 21 security architecture](https://docs.oracle.com/en/java/javase/21/security/java-se-platform-security-architecture.html).

## Verification

- `python -m pytest tests/test_coding.py tests/test_coding_review.py tests/test_coding_java.py -q`
  (Java tests require the JDK; run in the API image to exercise the production runtime.)
- `cd web && npm run typecheck && npm run test:unit -- src/features/coding/Review.test.tsx`
- Manually replayed the three stored attempts without saving new marks. The revised feedback surfaced transferable boundary,
  caller-tracing and final-state habits; tentative kiosk speculation was no longer labelled a misconception, while the
  linear/exponential terminology correction remained available.
- Generated a fresh Java repair exercise and verified its baseline, reference fix, hidden tests and repeatability in the
  production-style Java container. Inspected the review at desktop and mobile widths.
