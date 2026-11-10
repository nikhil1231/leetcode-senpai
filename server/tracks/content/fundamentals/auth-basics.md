---
id: auth-basics
category: security
skill: security
title: Authentication, sessions and authorisation
minutes: 18
summary: Authentication proves who someone is; authorisation decides what they may do, and most real breaches are authorisation bugs. Store passwords with a slow, salted hash (Argon2id or bcrypt), add MFA and rate limits. Keep login state in a server-side session behind an HttpOnly cookie, or in a signed token such as a JWT, and know what each costs: JWTs are easy to verify anywhere but hard to revoke, and a verifier that skips one check accepts forged tokens. Authorise every request against the specific object, on the server, deny by default.
objectives:
  - Separate authentication from authorisation, and 401 from 403
  - Explain how passwords should be stored and why fast hashes are wrong
  - Compare server-side sessions with JWTs, including revocation and where the browser keeps them
  - List the checks a JWT verifier must make, and the attack each one stops
  - Choose between RBAC, ABAC and relationship-based access, and check access per object
sources:
  - ['OWASP Password Storage Cheat Sheet', 'https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html']
  - ['OWASP Session Management Cheat Sheet', 'https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html']
  - ['RFC 8725: JSON Web Token Best Current Practices', 'https://datatracker.ietf.org/doc/html/rfc8725']
  - ['OWASP API Security Top 10 (2023): API1 Broken Object Level Authorization', 'https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/']
  - ['Zanzibar: Google''s Consistent, Global Authorization System (USENIX ATC 2019)', 'https://research.google/pubs/zanzibar-googles-consistent-global-authorization-system/']
---

## Two different questions

**Authentication (authN)** answers "who is this?" with a password, a passkey, a one-time code or a signed token. **Authorisation (authZ)** answers "may this caller do this, to this thing?". They fail differently, and HTTP gives each its own status:

- **401 Unauthorized** really means *unauthenticated*: no valid credentials. The client should log in.
- **403 Forbidden** means *authenticated but not allowed*. Logging in again won't help. (For objects the caller shouldn't know exist, return **404** instead, so IDs can't be probed.)

Authentication is usually one well-tested library or identity provider. Authorisation is spread across every handler you write, which is why OWASP ranks broken access control as the most common serious web flaw.

```sort
prompt: Is each failure an authentication problem or an authorisation problem?
buckets: [Authentication (who you are), Authorisation (what you may do)]
items:
  - {text: 'An attacker logs in with passwords leaked from another site', bucket: 0, why: 'Credential stuffing defeats proof of identity.'}
  - {text: 'A logged-in user changes /orders/1001 to /orders/1002 and sees a stranger''s order', bucket: 1, why: 'They are who they say they are; the server never checked ownership.'}
  - {text: 'A support agent''s account can call the admin-only refund endpoint', bucket: 1, why: 'Missing function-level authorisation.'}
  - {text: 'A session cookie stolen through XSS is replayed from another country', bucket: 0, why: 'The server accepts someone else''s proof of identity.'}
  - {text: 'A user sends {"role": "admin"} in a profile update and it is saved', bucket: 1, why: 'Mass assignment: the client chose its own permissions.'}
```

## Storing passwords

Never store passwords, and never store a fast hash of them. A GPU computes billions of SHA-256 hashes a second, so a leaked table of unsalted SHA-256 hashes falls in hours. Use a **password hashing function** that is deliberately slow and memory-hungry:

- **Argon2id** (first choice), **scrypt**, or **bcrypt** (cost 10 to 12 or more). PBKDF2 with a high iteration count where FIPS is required.
- A unique random **salt** per password (these libraries do it for you), so identical passwords have different hashes and precomputed tables are useless.
- Optionally a **pepper**: a secret key kept outside the database (in a KMS or HSM), so a database dump alone isn't enough.
- Tune the cost so one hash takes tens to hundreds of milliseconds on your servers, and re-hash on login when you raise it.

Around the hash: rate-limit logins per account and per IP, check new passwords against breached-password lists, support **MFA** (passkeys and TOTP over SMS), and give the same error for "no such user" and "wrong password".

```calc
title: Why slow hashes matter
prompt: An attacker has one bcrypt hash and tries every 8-letter lowercase password (26^8, about 2.1 × 10^11 candidates). Their GPU rig manages 20,000 bcrypt guesses per second at this cost factor. How many days does an exhaustive search take?
answer: 121
unit: days
tolerance: 1.2
steps: |
  26^8 = 208,827,064,576 ≈ 2.09 × 10^11 candidates.

  2.09 × 10^11 ÷ 20,000 per second ≈ 1.04 × 10^7 seconds ≈ **121 days**, for one user. The same rig computes around 10^10 unsalted SHA-256 hashes a second, which finishes in about 21 seconds and cracks every user with that password at once. Salting stops the "every user at once" part; the slow hash stops the 21 seconds.
```

## Sessions or tokens

After login the server must recognise the caller on every request. Two designs:

**Server-side sessions.** The server stores `{session_id → user, expiry, …}` (in Redis or the database) and sends the browser an opaque random ID in a cookie. Every request costs a lookup, but logout and "sign out everywhere" are a delete, and the cookie reveals nothing.

**Self-contained tokens (JWT).** The server signs the claims (`sub`, `exp`, `aud`, roles) and hands them to the client. Any service with the public key can verify a token without a lookup, which suits many services and third-party APIs. The cost: **you can't easily revoke one**. It's valid until `exp`. So access tokens are short-lived (5 to 15 minutes) and paired with a **refresh token** that is stored server-side, rotated on every use, and revocable. A JWT is signed, not encrypted: anyone can base64-decode the payload, so never put secrets in it.

Where the browser keeps them matters:

| Storage | XSS can steal it? | Sent automatically (CSRF risk)? |
|---|---|---|
| `HttpOnly; Secure; SameSite=Lax` cookie | No (scripts can't read it) | Yes, but SameSite blocks most cross-site sends |
| `localStorage` / JS memory | Yes | No |

A common safe pattern for single-page apps is a **backend-for-frontend**: the browser holds only an HttpOnly session cookie, and a small server keeps the OAuth tokens.

## What a JWT verifier must check

A token is just three base64url strings: `header.payload.signature`. The header names its own algorithm, which is the root of the classic bugs. A verifier must:

1. **Verify the signature** with a key you trust, never just decode.
2. **Pin the algorithm** (for example, RS256 only). Trusting the header's `alg` lets an attacker send `alg: none` or switch RS256 to HS256 and sign with your *public* key.
3. **Check `exp`** (and `nbf`), with a little clock-skew allowance.
4. **Check `iss` and `aud`**, so a token minted for another service, or by another issuer, isn't accepted here.

```sim
name: jwt
title: A JWT verifier, one check at a time
intro: 'Pick a token an attacker might send, and the checks your verifier makes. The server issues RS256 tokens for the audience "api".'
challenges:
  - {text: 'Get a forged admin token accepted', metric: breach, op: '==', value: 1}
  - {text: 'Make "alg: none" work against a server that does verify signatures', metric: noneSigned, op: '==', value: 1}
  - {text: 'Find checks that reject every attack and still accept the genuine token', metric: safeAll, op: '==', value: 1}
takeaway: |
  Verify the signature with a pinned algorithm and a trusted key, then check exp, iss and aud. Each missing check is one specific attack that works. Use a maintained library and configure it explicitly rather than trusting the token's header.
```

## Authorisation models

- **RBAC** (role-based): users get roles, roles get permissions (`editor` can `post:update`). Simple and auditable; it explodes when every exception becomes a new role.
- **ABAC** (attribute-based): rules over attributes of user, resource and context ("managers in the same department, during business hours"). Flexible; harder to audit. Policy engines such as OPA or Cedar keep rules out of handler code.
- **ReBAC** (relationship-based): access follows a graph ("can view a doc if you're a member of a group that is a viewer of its folder"). Google's **Zanzibar** (and open-source clones such as SpiceDB and OpenFGA) does this at scale; it's the model behind Docs-style sharing.

Whatever the model, three rules:

- **Check the object, not just the endpoint.** "Is the user logged in" and "does the user have the `invoice:read` role" both pass for someone else's invoice. Load the object and check `invoice.owner_id == caller` (or the tenant, or the relationship). Scoping the query itself (`WHERE id = $1 AND tenant_id = $2`) makes the mistake hard to make.
- **Deny by default**, centrally. A new endpoint should be locked until someone grants access, not open until someone remembers.
- **Never trust client-supplied identity or permissions**: the user ID, role or tenant comes from the verified session or token, never from the request body. Bind request bodies to an explicit allow list of fields (no mass assignment).

```bug
title: An invoice endpoint
prompt: This Flask handler passed code review. Which lines are security bugs?
lang: python
code: |
  @app.get("/api/invoices/<int:invoice_id>")
  def get_invoice(invoice_id):
      token = request.headers["Authorization"].removeprefix("Bearer ")
      claims = jwt.decode(token, options={"verify_signature": False})
      user = User.get(claims["sub"])
      invoice = Invoice.get(invoice_id)
      if invoice is None:
          abort(404)
      return jsonify(invoice.to_dict())

  @app.patch("/api/me")
  def update_me():
      user = current_user()
      for field, value in request.json.items():
          setattr(user, field, value)
      user.save()
      return jsonify(user.to_dict())
bug: [4, 9, 15]
explain: |
  Line 4 decodes the token without verifying it, so anyone can write their own claims and become any user. Line 9 returns the invoice without checking it belongs to `user`: a textbook broken object-level authorisation (BOLA/IDOR) bug, exploitable by counting IDs. Line 15 copies every field from the request onto the user, so `{"role": "admin"}` or `{"email_verified": true}` is saved (mass assignment). Fixes: verify with a pinned algorithm, issuer and audience; load with `Invoice.get(id, owner=user.id)` or check ownership and return 404; update only an allow-listed set of fields.
```

```sort
prompt: Which authorisation model fits each product most naturally?
buckets: [RBAC (roles), ABAC (attribute rules), ReBAC (relationships)]
items:
  - {text: 'An internal admin tool with viewer, operator and admin', bucket: 0, why: 'A handful of fixed roles.'}
  - {text: 'Docs shared with people, groups and whole folders, inherited down the tree', bucket: 2, why: 'Access follows a graph of memberships and parents.'}
  - {text: 'Doctors may read records of patients in their own ward, only while on shift', bucket: 1, why: 'Rules over user, resource and time attributes.'}
  - {text: 'A GitHub-style app: org members, teams and per-repository permissions', bucket: 2, why: 'Org, team and repo relationships decide access.'}
  - {text: 'Expense approval above $10k requires a director in the same cost centre', bucket: 1, why: 'Thresholds and matching attributes.'}
```

```recall
prompt: An interviewer asks, "Should we use JWTs or server-side sessions for our web app's login?" Give a reasoned answer.
points:
  - Sessions are an opaque ID in an HttpOnly cookie with state on the server; revocation and logout are easy, at the cost of a lookup per request
  - JWTs are verified without a lookup and suit many services or third parties, but can't be revoked before expiry
  - So JWT access tokens should be short-lived with rotating, revocable refresh tokens kept server-side
  - Keep tokens out of localStorage where XSS can read them; HttpOnly, Secure, SameSite cookies or a backend-for-frontend
  - Whichever is used, the verifier pins the algorithm and checks signature, exp, iss and aud
model: |
  For a single web app talking to its own backend, I'd default to server-side sessions: a random session ID in an `HttpOnly; Secure; SameSite=Lax` cookie, with the session in Redis. Logout, "sign out everywhere" and banning a user are a delete, and the cookie carries nothing an attacker can read. The lookup per request is cheap. JWTs earn their place when many services or third parties must verify identity without calling a central store. Then I'd keep access tokens short-lived, five to fifteen minutes, with refresh tokens stored server-side, rotated on every use and revoked on reuse, because a JWT can't be revoked before it expires. I'd keep tokens out of localStorage, since any XSS can read it; for an SPA, a backend-for-frontend holds the tokens and the browser only has a session cookie. And the verifier pins the algorithm and checks the signature, exp, iss and aud.
```

```questions
- kind: check
  prompt: A logged-in user requests another customer's order and should not see it. Which response is most appropriate?
  choices:
    - text: 404 Not Found, so the existence of the order isn't revealed
      correct: true
    - text: 401 Unauthorized, so the client knows to log in again
      why: They are authenticated; logging in again changes nothing.
    - text: 200 with an empty body, so the client handles it gracefully
      why: That hides an access decision behind a success code.
    - text: 500, because the server should never reach this state
      why: It's a normal, expected authorisation decision.
  explanation: 403 is also correct in principle; 404 avoids confirming the object exists and blunts ID enumeration.
- kind: check
  prompt: Why is SHA-256 a poor choice for storing passwords, even with a salt?
  choices:
    - text: It's designed to be fast, so attackers can test billions of guesses per second
      correct: true
    - text: It has known collisions that let attackers log in with a different password
      why: No practical SHA-256 collisions exist, and collisions are not the issue.
    - text: Its output is too short to store safely in a database column
      why: Length isn't the problem; speed is.
    - text: It can be reversed with a rainbow table even when salted
      why: Salts defeat precomputed tables; the problem is brute force speed.
  explanation: Use a slow, memory-hard password hash such as Argon2id, scrypt or bcrypt.
- kind: check
  prompt: Your API trusts the `alg` field in each JWT's header. An attacker changes it from RS256 to HS256 and signs with your RSA public key. What happens?
  choices:
    - text: The public key is used as the HMAC secret, so the forged signature verifies
      correct: true
    - text: Verification fails, because HS256 needs a secret the attacker doesn't have
      why: The "secret" the verifier uses is your public key, which the attacker has.
    - text: The token is accepted but its claims are ignored
      why: Verified claims are used as normal.
  explanation: Pin the accepted algorithm in configuration; never let the token choose it.
- kind: check
  prompt: Which is the main operational drawback of stateless JWT access tokens compared with server-side sessions?
  choices:
    - text: They can't be revoked before they expire without adding server-side state
      correct: true
    - text: They are slower to verify than looking a session up in Redis
      why: Signature verification is usually faster than a network lookup.
    - text: They can't carry the user's ID
      why: The `sub` claim carries it.
    - text: Browsers refuse to store them in cookies
      why: They can be stored in cookies.
  explanation: Short expiry plus revocable refresh tokens is the usual compromise.
- kind: fire
  prompt: Which status code means "authenticated, but not allowed to do this"?
  choices:
    - text: '403'
      correct: true
    - text: '401'
      why: 401 means missing or invalid credentials.
    - text: '400'
      why: 400 is a malformed request.
  explanation: 401 is about identity, 403 about permission.
- kind: fire
  prompt: Which password hash is the current first recommendation?
  choices:
    - text: Argon2id
      correct: true
    - text: SHA-512 with a salt
      why: Too fast.
    - text: MD5 with a pepper
      why: Broken and fast.
  explanation: Argon2id, then scrypt or bcrypt; PBKDF2 where FIPS compliance requires it.
- kind: fire
  prompt: Where should a web app keep its session token so XSS can't read it?
  choices:
    - text: An HttpOnly, Secure cookie
      correct: true
    - text: localStorage
      why: Any script on the page can read it.
    - text: A global JavaScript variable
      why: Any injected script can read it.
  explanation: HttpOnly hides the cookie from scripts; SameSite limits cross-site sending.
- kind: fire
  prompt: A user changes the ID in /api/invoices/1001 to 1002 and gets someone else's invoice. What is this bug called?
  choices:
    - text: Broken object-level authorisation (IDOR)
      correct: true
    - text: Cross-site request forgery (CSRF)
      why: CSRF tricks a victim's browser into sending a request.
    - text: Session fixation through a crafted login link
      why: That forces a known session ID on a victim.
  explanation: The fix is a per-object ownership check, or scoping the query by owner or tenant.
- kind: fire
  prompt: Google's Zanzibar is an example of which authorisation model?
  choices:
    - text: Relationship-based access control (ReBAC)
      correct: true
    - text: Role-based access control (RBAC) at global scale
      why: Zanzibar evaluates a graph of relationships, not flat roles.
    - text: Mandatory access control (MAC)
      why: MAC is label-based, as in SELinux.
  explanation: Tuples like "user U is a viewer of doc D" plus inheritance rules.
```
