---
id: data-responsibility
category: reliability
skill: requirements
title: Data responsibility: privacy, deletion and predictive systems
minutes: 18
summary: Systems that collect and derive data about people carry obligations that are also engineering requirements. Collect the minimum, keep it no longer than needed, know every place a person's data ends up so you can delete or export it, and treat personal data as a liability that needs protecting. When a system makes predictions that affect people, bias, feedback loops and accountability become design concerns too. This is engineering guidance, not legal advice.
objectives:
  - Apply data minimisation, purpose limitation and retention limits when designing a data model
  - Trace personal data through derived copies, logs and backups so deletion and export requests can be honoured
  - Tell anonymisation from pseudonymisation and choose protections such as encryption, access control and crypto-shredding
  - Recognise bias, feedback loops and lack of recourse in predictive systems, and design for review and appeal
sources:
  - ['Martin Kleppmann, Designing Data-Intensive Applications — Chapter 12, "Doing the Right Thing"', 'https://dataintensive.net/']
  - ['GDPR text, Articles 5, 12, 15, 17, 25 and 33', 'https://gdpr-info.eu/']
  - ['ICO: Guide to the UK GDPR, principles', 'https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/']
  - ['NIST Privacy Framework', 'https://www.nist.gov/privacy-framework']
---

> [!story] "Delete my account"
> A user asked a small SaaS company to delete their account. An engineer removed their row from the users table and closed the ticket. The same person's email still sat in the search index, the marketing tool's contact list, three weeks of application logs, the analytics warehouse, a Kafka topic with seven days of retention, the support system and last night's backups. Months later the user got a promotional email and complained to the data protection regulator. The code that "deleted" the user was correct for the one table it knew about. The company didn't know where the rest of the data was.

*This lesson is about engineering consequences. Laws differ by country and change, so check requirements with your legal or privacy team rather than relying on a course.*

## Data is a liability as well as an asset

Teams are encouraged to collect everything because it might be useful. Personal data has a cost that grows with how much you hold and how long you keep it: it can be stolen, misused by staff, subpoenaed, or demanded back by the person it describes, and a breach can end in fines, lawsuits and lost trust. Some engineers call it **toxic waste**. The most reliable way to avoid a data problem is not to have the data.

Design principles that follow, similar to those in most privacy regimes (the EU GDPR is the best known):

- **Data minimisation.** Collect only what the purpose needs. If you only need to know a user is over 18, store that fact, not their date of birth.
- **Purpose limitation.** Use data for the purpose you collected it for. A new use needs a new justification.
- **Storage limitation.** Decide a **retention period** for each kind of data and enforce it with automatic deletion, not good intentions.
- **Integrity and confidentiality.** Encrypt in transit and at rest, limit who can read what, and log access.
- **Privacy by design and by default.** Build protections into the architecture; the safe setting should be the default.

## Know where the data goes

The opening story is an architecture problem. Personal data spreads into **derived stores**, **logs**, **backups**, **third-party tools** and **message logs**. To honour a request to delete, export or correct someone's data (the rights of erasure, access and rectification), you need to be able to answer: *where is everything we hold about this person?*

```arch
title: Where one user's data ends up
nodes:
  - {id: app, label: Application, kind: service, x: 0, y: 1}
  - {id: db, label: Users database, kind: db, x: 1, y: 1, note: 'system of record'}
  - {id: log, label: Event log, kind: stream, x: 2, y: 1, note: '7-day retention'}
  - {id: idx, label: Search index, kind: db, x: 3, y: 0}
  - {id: wh, label: Analytics warehouse, kind: db, x: 3, y: 1}
  - {id: logs, label: Application logs, kind: db, x: 1, y: 2}
  - {id: crm, label: Marketing and support tools, kind: client, x: 3, y: 2, note: 'third parties'}
  - {id: bak, label: Backups, kind: db, x: 2, y: 2}
edges:
  - [app, db, 'writes']
  - [app, logs, 'logs requests']
  - [db, log, 'change events']
  - [log, idx, 'index']
  - [log, wh, 'load']
  - [log, crm, 'sync contacts']
  - [db, bak, 'snapshots']
paths:
  - label: A deletion request
    steps:
      - [app, db, 'Delete or anonymise the user''s records in the system of record.']
      - [db, log, 'Emit a deletion event so every consumer removes its copy.']
      - [log, idx, 'The index removes the documents. The warehouse and the third-party tools do the same.']
      - [app, logs, 'Logs should never have held the identifier in plain form. Where they did, they expire on a schedule.']
      - [db, bak, 'Backups age out on their retention schedule, and a restore re-applies the deletions that happened since.']
```

Practices that make it tractable:

- **Keep a data inventory.** For each field, record what it is, why you hold it, where it flows, how long you keep it and who can access it.
- **Use a stable internal user ID** across systems, never the email or name as a join key, so you can find and remove records.
- **Propagate deletion as an event** through the same log that carries changes, and let each derived store handle it idempotently. Reconcile to confirm nothing is left behind.
- **Keep personal data out of logs, metrics, URLs and error reports.** Mask or tokenise at the edge.
- **Limit third-party sharing**, and contract for deletion on request.
- **Backups:** you rarely rewrite them. Keep retention short, and make sure a restore replays the deletions made since (or re-run them).

### Append-only logs versus erasure

A retained, immutable log of events is useful, but it conflicts with deletion. Options:

- **Don't put personal data in the immutable log.** Store an ID, and keep the personal details in a mutable store you can delete from.
- **Crypto-shredding.** Encrypt each person's data with a key of their own, kept in a key store. To delete, destroy the key; the ciphertext left in logs and backups becomes unreadable.
- **Compaction and tombstones** for keyed topics, so the latest value per key (including a deletion marker) is what survives.
- **Short retention** where history isn't needed.

## Anonymised or just pseudonymised?

Hashing an email address and calling the result "anonymous" is a common mistake. A hash of a low-entropy value can be reversed by hashing guesses, and the same hash lets you link one person's records across systems, which is the point of the identifier. That is **pseudonymisation**: it reduces risk but the data is still personal data. **Anonymisation** means the person cannot be identified by any reasonably likely means, including by combining with other data. Combinations of age, postcode and gender have identified individuals in "anonymous" datasets. For aggregates, techniques such as **k-anonymity** (each record indistinguishable from at least k−1 others) and **differential privacy** (adding calibrated noise so one person's presence changes results very little) give stronger, measurable guarantees than ad hoc removal of names.

```predict
prompt: A team replaces each user's email address with its SHA-256 hash in the analytics warehouse and calls the data anonymous. What is the problem?
choices:
  - Nothing, because SHA-256 is a one-way function that nobody can reverse in practice
  - Emails can be guessed and hashed, and the hash still links a person's records
  - SHA-256 is far too slow to use on the billions of rows in an analytics warehouse
  - Hash values are opaque blobs, so they cannot be used as join keys between tables
answer: 1
reveal: |
  Emails are guessable and finite, so an attacker (or a curious colleague) can hash candidate addresses and look them up. The hash is also a stable identifier that links the person's activity across datasets, which is exactly what makes it personal data. Pseudonymisation is a useful safeguard, but it doesn't take the data outside privacy obligations. A keyed hash (HMAC) with a protected key is better, and true anonymisation usually means aggregating or removing the identifier altogether.
```

```bug
title: Logging the request
prompt: This handler logs requests for debugging, and the logs go to a third-party service with 90-day retention. Which lines are a privacy problem?
lang: python
code: |
  def handle(request):
      logger.info("signup email=%s password=%s ip=%s", request.email, request.password, request.ip)
      user = create_user(request.email, request.password)
      logger.info("created user %s", user.id)
      return user
bug: [2]
explain: |
  **Line 2** writes the email, the **password** and the IP address to logs that leave your control and live for 90 days. Passwords must never be logged, in any form. The email and IP are personal data too, so log the internal user ID, mask or omit the rest, and set the retention as short as debugging needs. Line 4 is fine: it logs only an internal ID.
fix: |
  def handle(request):
      user = create_user(request.email, request.password)
      logger.info("created user %s", user.id)
      return user
```

## When systems make predictions about people

Credit limits, hiring screens, insurance prices, fraud flags, content ranking and policing tools all use data to predict and decide about individuals. They raise problems that are properties of the system, not only of the model.

- **Bias in, bias out.** Models learn from historical decisions, so they reproduce and can amplify past discrimination, even when protected attributes are removed (postcode, school and browsing habits can stand in for them).
- **Feedback loops.** A prediction changes the world it measures. A system that sends more patrols to the neighbourhoods it predicts as high-crime finds more crime there, which reinforces the prediction.
- **Opaque decisions and no recourse.** A person refused a loan or flagged as a fraud risk may have no way to learn why, see the data used, or correct it. A mistake can follow them across systems.
- **Statistics are about groups, not individuals.** "Applicants like you default more often" can be accurate on average and wrong, and unfair, for the person in front of you.
- **Accountability.** "The algorithm decided" is not an answer. Someone owns the outcome.

Engineering responses are practical: keep a **human in the loop** for consequential decisions, record the inputs and version of the model behind each decision so it can be explained and audited, give people a way to **contest and correct** data, **measure outcomes across groups** and not just overall accuracy, and monitor for drift and feedback. Ask early whether a decision should be automated at all, and what happens to someone when the system is wrong.

```incident
title: A deletion request arrives
intro: |
  A user emails privacy@ asking you to erase all their data. You are the on-call engineer who owns the deletion pipeline. The user has been a customer for three years.
start: s1
nodes:
  s1:
    text: Where do you start?
    options:
      - {label: 'Look up the data inventory and the user''s internal ID, to list every system that holds their data', next: s2, quality: good, note: 'You can''t delete what you can''t find. The inventory turns this into a checklist.'}
      - {label: 'Delete their row from the users table and reply that it is done', next: bad1, quality: bad, note: 'Covers one system out of many.'}
      - {label: 'Ask the user which systems they think hold their data', next: bad2, quality: bad, note: 'That is the company''s responsibility to know.'}
  bad1:
    text: Two weeks later a marketing email goes out to the address, and the regulator is copied on the complaint.
    options:
      - {label: 'Go back and work from the inventory', next: s2, quality: good}
  bad2:
    text: The user doesn't know, and the delay eats into the response deadline.
    options:
      - {label: 'Work from the inventory instead', next: s2, quality: good}
  s2:
    text: 'The inventory lists the primary database, search index, warehouse, an event log with 7-day retention, application logs, two third-party tools and backups. How do you handle the event log and the backups?'
    options:
      - {label: 'Emit a deletion event so each consumer removes its copy; let the log expire on schedule; document that backups age out in 35 days and that restores re-apply deletions', next: done, quality: good, note: 'Honest, bounded and repeatable.'}
      - {label: 'Rewrite the whole event log and every backup immediately', next: done2, quality: ok, note: 'Possible but risky and expensive. Prefer scheduled expiry and documented limits where the law allows.'}
      - {label: 'Skip logs and backups since they are not "live"', next: bad3, quality: bad, note: 'They still hold personal data.'}
  bad3:
    text: A restore from backup two months later puts the deleted user back into production.
    options:
      - {label: 'Add a re-apply-deletions step to the restore procedure', next: done, quality: good}
  done:
    text: Every system is cleared or scheduled to expire, the deletion is logged without the personal data itself, and the user gets a reply with what was done and when the remainder will age out.
    verdict: good
  done2:
    text: The user is fully cleared, but the manual rewrite caused an incident for other users. A scheduled expiry would have been enough.
    verdict: ok
```

```sort
prompt: For each piece of data, should you collect and keep it?
buckets: [Collect and keep for a defined period, "Don't collect, or drop quickly"]
items:
  - {text: 'A shipping address, needed to deliver the order', bucket: 0, why: 'Necessary for the stated purpose. Keep only as long as needed (and as the law requires for records).'}
  - {text: 'The full date of birth, when you only need to know the user is an adult', bucket: 1, why: 'Store an "over 18" flag instead of the date.'}
  - {text: 'Precise GPS location history of every user, kept just in case it is useful', bucket: 1, why: 'No defined purpose. A liability the moment you hold it.'}
  - {text: 'Raw passwords', bucket: 1, why: 'Never store. Store a salted, slow password hash.'}
  - {text: 'Payment card number and CVV', bucket: 1, why: 'Use a payment provider and store its token instead.'}
  - {text: 'A hashed password and last login time for authentication', bucket: 0, why: 'Needed for the service. Protect it and limit retention of old records.'}
```

```faded
title: Fill in the responsibility facts
prompt: Fill each gap from memory.
text: |
  Collecting only what the purpose needs is called data [[minimisation|replication|partitioning]], and enforcing how long it is kept is a [[retention|backup|caching]] policy.

  Hashing an email address gives [[pseudonymous|anonymous|encrypted]] data, because guesses can be hashed and the value still [[links records together|is random|cannot be compared]].

  To make data in logs and backups unreadable without rewriting them, encrypt each person's data under its own key and [[destroy the key|rotate the table|add an index]].

  Deleting a user from the database is not enough because their data also lives in [[derived stores, logs and backups|the primary key|the schema]].
explain: Minimise, limit retention, know every copy, and use per-person keys when you can't rewrite history.
```

```recall
prompt: A user asks you to delete all their data. Describe what you need in place for that to be possible and reliable.
points:
  - A data inventory showing every system, field, purpose and retention period, and a stable internal user ID to find records
  - Deletion propagated as an event to all derived stores, search indexes, warehouses and third parties, confirmed by reconciliation
  - Personal data kept out of logs and immutable logs, or protected by per-user encryption keys that can be destroyed
  - Backups with short retention and a restore process that re-applies deletions
model: |
  First I need to know where the data is, so I keep an inventory of every field, why we hold it, where it flows and how long we retain it, and I use an internal user ID everywhere so records can be found. Deletion then becomes an event on the same log that carries changes, so the search index, the warehouse and third-party tools each remove their copy, and I reconcile afterwards to confirm nothing remains. I keep personal data out of application logs and out of immutable logs, or encrypt each person's data with its own key so destroying the key makes leftover copies unreadable. Backups age out on a short, documented schedule and a restore replays deletions made since the snapshot. I'd also record the request and outcome without keeping the personal data itself.
```

```interview
ask: We are launching a feature that scores users' fraud risk from their behaviour, and blocks high scores automatically. What concerns do you raise?
say: |
  "I'd start with the impact of a wrong decision: a blocked legitimate user loses access to their money, so I'd keep a human review path for anything consequential and make blocking proportionate, such as a step-up check before an outright block. I'd ask what data we use and whether each input is necessary and permitted for this purpose, and whether any act as proxies for protected characteristics. I'd log the inputs and model version behind each decision so we can explain it, let people see and contest the outcome, and monitor false positives by group, not just overall accuracy. I'd also watch for feedback loops, since blocking some behaviour changes the data we learn from. And I'd check retention for the behavioural data we collect to do this."
followups:
  - q: Is removing the protected attribute from the data enough to avoid bias?
    a: No. Other features such as postcode or device can act as proxies, and historical labels may already encode bias. Measure outcomes across groups instead.
  - q: How do you explain a decision from a model?
    a: Keep the inputs and model version, use interpretable features or explanation tools, and give a plain-language reason and a route to challenge it.
  - q: What is a feedback loop here?
    a: Actions based on predictions change future data. If flagged users are watched more closely, more of their problems are found, which seems to confirm the flag.
weak: |
  "The model is 95% accurate, so ship it." Ignores who the errors fall on, recourse and drift.
strong: |
  Considers harm from errors, necessity of inputs, proxies, auditability, appeal, group-level evaluation and feedback.
```

```questions
- kind: check
  prompt: What does data minimisation mean for system design?
  choices:
    - text: Collect and keep only what the purpose needs
      correct: true
    - text: Compress stored data to use as little disk space as possible
      why: That is storage efficiency, not minimisation.
    - text: Run the smallest number of replicas that the availability target allows
      why: Replication is a reliability matter.
    - text: Keep all personal data inside a single region or datacentre
      why: Residency is a different concern.
  explanation: Data you never collected can't leak, be misused, or need deleting. Store an over-18 flag, not a date of birth, when that is all you need.
- kind: check
  prompt: Why is deleting a user's row from the database not enough to honour an erasure request?
  choices:
    - text: Their data also lives in other stores, logs and backups
      correct: true
    - text: Databases cannot delete rows once a transaction log has recorded them
      why: They can.
    - text: Erasure requests apply only to backups and nothing in production
      why: They apply to every copy you hold.
    - text: The row is encrypted, so deleting it leaves the plaintext elsewhere
      why: Encryption does not remove copies elsewhere.
  explanation: Personal data spreads wherever the pipeline sends it, so deletion needs an inventory and propagation.
- kind: check
  prompt: What is crypto-shredding?
  choices:
    - text: Destroying a per-person key so every copy becomes unreadable
      correct: true
    - text: Overwriting a disk with random data before it is returned to the provider
      why: That is secure wiping.
    - text: Hashing every stored value so that none can be read back
      why: Hashing is pseudonymisation, not erasure.
    - text: Compressing logs so that old entries take up less space
      why: Unrelated.
  explanation: It makes deletion possible in append-only logs and backups you can't rewrite.
- kind: check
  type: multi
  prompt: Which are examples of feedback loops or bias risks in a predictive system? Select all that apply.
  choices:
    - text: Extra patrols sent to areas predicted as high-crime find more crime there
      correct: true
    - text: A hiring model trained on past decisions reproduces past discrimination
      correct: true
    - text: A model uses postcode, which stands in for a protected attribute
      correct: true
    - text: A model's accuracy is reported as a single overall percentage
      why: Not a loop by itself, though overall accuracy can hide poor results for particular groups.
  explanation: Predictions change the data that later predictions learn from, and historical labels carry historical bias.
- kind: check
  prompt: Hashing an email address and treating it as anonymous is wrong because...
  choices:
    - text: Guesses can be hashed and matched, and it links records
      correct: true
    - text: Cryptographic hashes are reversible by definition, given enough time
      why: They are not reversible, but low-entropy inputs can be guessed.
    - text: Hashes are too long to be stored efficiently in an analytics table
      why: Length is not the problem.
    - text: Databases cannot build an index over a hashed column
      why: They can.
  explanation: It's pseudonymisation. It reduces risk but doesn't remove the data from privacy obligations.
- kind: fire
  prompt: Which belongs in application logs?
  choices:
    - text: An internal user ID
      correct: true
    - text: The user's password, so that failed sign-ins can be debugged
      why: Never.
    - text: A full card number, so payment issues can be traced
      why: Never.
    - text: The user's email in plain text, kept indefinitely
      why: Personal data with no purpose and no retention.
  explanation: Log identifiers that let you debug without exposing personal data, and set short retention.
- kind: fire
  prompt: A 90-day log retention policy is an example of which principle?
  choices:
    - text: Storage limitation
      correct: true
    - text: Purpose limitation
      why: That's about use, not duration.
    - text: Data portability
      why: Letting people take their data elsewhere.
    - text: Integrity
      why: Protection from corruption.
  explanation: Keep data no longer than needed, and enforce it automatically.
- kind: fire
  prompt: Under the GDPR, within roughly how long must a serious personal data breach be reported to the regulator, where required?
  choices:
    - text: 72 hours after becoming aware of it
      correct: true
    - text: 24 hours after the breach actually happened, whether or not anyone had noticed
      why: Not the GDPR limit.
    - text: 30 days, which is closer to the time allowed to answer a data subject request
      why: That is a different deadline.
    - text: One full year, so that the investigation can be completed first
      why: Far too long.
  explanation: Article 33 sets 72 hours from becoming aware, where the breach is likely to risk people's rights. Check your own jurisdiction's rules.
- kind: fire
  type: order
  prompt: Order these from least to most effective at protecting a person's data in an append-only log.
  items:
    - Put the person's email directly in every event
    - Hash the email and put the hash in every event
    - Put an internal ID in events and keep the email in a deletable store
    - Encrypt the person's data under a per-person key and destroy the key on request
  explanation: Plain values are worst, a hash only pseudonymises, an ID with deletable details lets you erase, and per-person keys make every remaining copy unreadable.
- kind: fire
  prompt: What is a reasonable safeguard for an automated decision that can block someone's account?
  choices:
    - text: Human review and a way to contest the outcome
      correct: true
    - text: Hiding the reason from users so that they cannot game the system
      why: Opacity removes recourse.
    - text: Deleting every decision record after one day to protect privacy
      why: Auditability needs a record.
    - text: Relying on the model's overall accuracy figure alone
      why: It can hide poor results for some groups.
  explanation: Consequential automated decisions need oversight, explanation and appeal.
```
