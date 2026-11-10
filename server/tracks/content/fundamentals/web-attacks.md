---
id: web-attacks
category: security
skill: security
title: Web attacks and their defences
minutes: 20
summary: Most web vulnerabilities come from a handful of mistakes. XSS is data rendered as code, stopped by escaping output and a Content-Security-Policy. CSRF is a browser sending cookies on a request someone else started, stopped by SameSite cookies and tokens. CORS relaxes the same-origin policy for reads, and a misconfigured one hands your API to any site. SQL injection is data concatenated into a query, stopped by parameters. SSRF is your server fetching a URL an attacker chose, stopped by egress allow lists. And broken access control, the most common of all, is a missing check on the server.
objectives:
  - Explain the same-origin policy and the difference between an origin and a site
  - Describe stored, reflected and DOM XSS, and layer escaping, CSP and HttpOnly correctly
  - Explain why CSRF works and how SameSite cookies and CSRF tokens stop it
  - Read a CORS configuration and spot a dangerous one
  - Prevent SQL injection and SSRF, including the cloud metadata attack
  - Recognise broken access control in its common forms
sources:
  - ['OWASP Top 10 (2021)', 'https://owasp.org/Top10/']
  - ['OWASP Cross Site Scripting Prevention Cheat Sheet', 'https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html']
  - ['MDN: Cross-Origin Resource Sharing (CORS)', 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS']
  - ['OWASP SSRF Prevention Cheat Sheet', 'https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html']
  - ['web.dev: SameSite cookies explained', 'https://web.dev/articles/samesite-cookies-explained']
---

## The same-origin policy

Browsers keep sites apart with the **same-origin policy**: a script from one **origin** (scheme + host + port, such as `https://app.example:443`) can't read responses or the DOM of another origin. It can still *send* many requests to other origins (form posts, image loads, simple fetches), and the browser attaches that site's cookies by default. Most browser attacks either get code running *inside* your origin (XSS), or abuse the fact that cross-origin requests carry your cookies (CSRF), or trick your server into making requests for them (SSRF).

A **site** is looser than an origin: the registrable domain plus scheme, so `a.example.com` and `b.example.com` are different origins but the *same site*. SameSite cookies work on sites; CORS works on origins. That's why a compromised sibling subdomain is dangerous.

## Cross-site scripting (XSS)

XSS is attacker-controlled data that the browser runs as code in your origin, where it can do anything the user can.

- **Stored**: a comment containing `<script>` is saved and served to every reader.
- **Reflected**: a search page echoes `?q=<script>…` into the response; the attacker sends victims the link.
- **DOM-based**: your own JavaScript writes untrusted data into a dangerous sink (`innerHTML`, `eval`, `location = …`) with no server involved.

Defences, in order of importance:

1. **Contextual output encoding.** Escape data for where it goes: HTML body, attribute, JavaScript, URL. Templating systems (React, Jinja, Go templates) do it by default; the holes are the escape hatches (`dangerouslySetInnerHTML`, `|safe`, `v-html`). If you must accept HTML, sanitise it with a maintained library such as DOMPurify.
2. **Content-Security-Policy.** `script-src 'self'` (or nonces) tells the browser not to run inline or foreign scripts, so an injection that slips through doesn't execute. A strong second layer; it doesn't replace escaping.
3. **HttpOnly cookies** stop scripts reading the session cookie. They limit the damage; the injected script can still act as the user from inside the page.

## Cross-site request forgery (CSRF)

The victim is logged in to `bank.example`. They visit `evil.example`, which auto-submits a hidden form to `https://bank.example/transfer`. The browser attaches the bank's session cookie, so the bank sees an authenticated request. The attacker never reads the cookie; they don't need to.

- **SameSite cookies.** `SameSite=Lax` (the default in Chromium-based browsers for cookies that don't set it) withholds the cookie on cross-site subrequests and POSTs, which kills classic CSRF. `Strict` withholds it even on top-level links from other sites.
- **CSRF tokens.** A random value tied to the session, embedded in your own forms and checked on every state-changing request. A cross-site page can't read it.
- **Check `Origin`** (or `Sec-Fetch-Site`) on state-changing requests, and never change state on GET.

APIs authenticated by an `Authorization` header instead of cookies aren't vulnerable to CSRF, because browsers don't attach that header automatically.

## CORS: relaxing the policy on purpose

**CORS** lets a server say "scripts from these origins may *read* my responses". For non-simple requests (JSON bodies, custom headers, PUT and DELETE) the browser first sends an `OPTIONS` **preflight** and only proceeds if the reply allows it.

```text
Access-Control-Allow-Origin: https://app.example      # one exact origin, or * for public data
Access-Control-Allow-Credentials: true                 # cookies allowed (never with *)
Access-Control-Allow-Methods: GET, POST
```

The classic misconfiguration is reflecting whatever `Origin` arrives, together with `Allow-Credentials: true`: now any site can read your users' data with their cookies. Two misunderstandings to avoid in an interview: CORS is enforced by the *browser* (curl ignores it), so it is not access control on the server; and it governs *reading* responses. A simple cross-origin POST still reaches your server, which is why CSRF defences are separate.

## SQL injection

String-building a query lets data become SQL:

```python
# Vulnerable: name = "admin' --" comments out the password check
db.execute(f"SELECT * FROM users WHERE name = '{name}' AND pw_hash = '{h}'")
# Safe: the value travels separately from the statement
db.execute("SELECT * FROM users WHERE name = %s AND pw_hash = %s", (name, h))
```

Parameterised queries (prepared statements) are the fix, and ORMs use them, except in their raw-SQL escape hatches. Parameters can't stand in for identifiers (table or column names, `ORDER BY` direction), so map those through an allow list. Run the app as a database user with only the privileges it needs, so an injection can't `DROP` anything.

## Server-side request forgery (SSRF)

Any feature that fetches a URL the user supplies (link previews, webhooks, "import from URL", PDF renderers) runs from *inside* your network. The attacker asks for `http://169.254.169.254/…`, the cloud **instance metadata service**, and gets the server's temporary cloud credentials. This is the shape of the 2019 Capital One breach, which exposed over 100 million customers' records.

Defences:

- **Allow-list destinations** where you can. Otherwise block private, loopback and link-local ranges, and check the IP *after* DNS resolution, on every redirect, so DNS rebinding and `302` tricks fail.
- **Run fetchers in an isolated network** with no route to internal services.
- **IMDSv2** on AWS requires a session token obtained with a PUT, which a simple GET-only SSRF can't do. It protects the credentials, not the rest of your network.

## Broken access control

Top of the OWASP list since 2021. It's not one bug but a family of missing server-side checks (see [authentication and authorisation](#/fundamentals/lesson/auth-basics)):

- **IDOR / BOLA**: `/invoices/1002` works for anyone logged in.
- **Missing function-level checks**: the admin button is hidden in the UI, but the admin endpoint answers anyone.
- **Mass assignment**: `{"role": "admin"}` in a profile update is saved.
- **Trusting the client**: prices, user IDs or tenant IDs taken from the request.

Random UUIDs make IDs harder to guess but are not a fix: a leaked ID still opens the record.

```sim
name: websec
title: Six attacks against your defences
intro: 'Turn defences on and see which attacks still land. Pick an attack to see its steps.'
challenges:
  - {text: 'Stop the stored XSS with a single defence', metric: xss, op: '==', value: 'blocked', and: [{metric: used, op: '==', value: 1}]}
  - {text: 'See HttpOnly limit an XSS without stopping it', metric: httponlyOnly, op: '==', value: 1}
  - {text: 'Block all six attacks with only five defences', metric: allBlocked, op: '==', value: 1, and: [{metric: used, op: '<=', value: 5}]}
takeaway: |
  Each attack has a defence at its root: escaping for XSS, SameSite and tokens for CSRF, parameters for SQL injection, egress control for SSRF, per-object checks for access control, an exact allow list for CORS. Measures like HttpOnly, UUIDs and IMDSv2 limit damage; they are layers, not fixes.
```

```sort
prompt: Match each defence to the attack it is primarily for.
buckets: [XSS, CSRF, SQL injection, SSRF]
items:
  - {text: 'Content-Security-Policy with nonces', bucket: 0, why: 'Stops injected scripts from running.'}
  - {text: 'SameSite=Lax session cookies', bucket: 1, why: 'The browser withholds cookies on cross-site POSTs.'}
  - {text: 'Prepared statements', bucket: 2, why: 'The value is never parsed as SQL.'}
  - {text: 'Resolve the hostname and refuse private and link-local IPs', bucket: 3, why: 'The server can''t be pointed at internal addresses.'}
  - {text: 'Auto-escaping templates', bucket: 0, why: 'Data is rendered as text.'}
  - {text: 'A per-session token in every form', bucket: 1, why: 'A cross-site page can''t read it.'}
  - {text: 'Allow-listing sortable column names', bucket: 2, why: 'Identifiers can''t be parameters.'}
  - {text: 'IMDSv2 session tokens', bucket: 3, why: 'GET-only SSRF can''t reach the credentials.'}
```

```bug
title: A small API
prompt: Which lines contain security bugs?
lang: python
code: |
  @app.after_request
  def cors(resp):
      resp.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
      resp.headers["Access-Control-Allow-Credentials"] = "true"
      return resp

  @app.get("/search")
  def search():
      q = request.args.get("q", "")
      sort = request.args.get("sort", "created_at")
      rows = db.execute(
          f"SELECT id, title FROM posts WHERE title ILIKE %s ORDER BY {sort}",
          (f"%{q}%",))
      return render_template("results.html", q=q, rows=rows)

  @app.post("/preview")
  def preview():
      url = request.json["url"]
      return requests.get(url, timeout=3).text[:500]
bug: [3, 12, 19]
explain: |
  Line 3 reflects any Origin and line 4 allows credentials, so every website can read authenticated responses (line 3 is the root cause). Line 12 parameterises the search term correctly but interpolates `sort` into the SQL: `?sort=(SELECT pg_sleep(10))` or worse. Allow-list the column names. Line 19 fetches any URL from inside the network: SSRF to the metadata service or internal admin panels. Validate against an allow list and block private and link-local addresses after resolution. Line 14 is fine: Jinja escapes `q` by default.
```

```recall
prompt: Explain the difference between CSRF and XSS, and why defences against one don't stop the other.
points:
  - XSS runs attacker code inside your origin; CSRF makes the victim's browser send a request from another site with their cookies
  - XSS can read the page and tokens, so it defeats CSRF tokens; CSRF needs no code in your origin at all
  - XSS defences are output encoding, CSP and sanitising; HttpOnly limits cookie theft
  - CSRF defences are SameSite cookies, CSRF tokens and Origin checks, and no state changes on GET
model: |
  XSS gets the attacker's script running in your origin: it can read the DOM, call your API as the user and read anything the page can, including CSRF tokens. CSRF doesn't need any code in your origin: another site makes the victim's browser send a request to yours, and the browser attaches the cookies, so your server sees an authenticated action the user never meant. So CSRF defences (SameSite cookies, a per-session token in forms, checking Origin, never changing state on GET) do nothing against XSS, because the script is already same-origin and can read the token. And XSS defences (contextual escaping, sanitising HTML, a Content-Security-Policy) do nothing against CSRF, because no script is involved. HttpOnly only stops XSS reading the cookie; the script can still act as the user.
```

```questions
- kind: check
  prompt: Your session cookie is HttpOnly. A stored XSS bug is found. What can the injected script still do?
  choices:
    - text: Call your API as the user from inside the page and read whatever the page shows
      correct: true
    - text: Nothing, because without reading the cookie it has no way to authenticate
      why: The browser attaches the cookie to the script's same-origin requests anyway.
    - text: Only read the session cookie, not make requests
      why: That's exactly what HttpOnly prevents.
    - text: Nothing, as long as CORS is configured correctly
      why: The script is same-origin; CORS doesn't apply.
  explanation: HttpOnly limits cookie theft; escaping and CSP prevent XSS.
- kind: check
  prompt: An API returns `Access-Control-Allow-Origin` set to whatever Origin the request sent, with `Access-Control-Allow-Credentials: true`. What is the risk?
  choices:
    - text: Any website a logged-in user visits can read that user's API responses
      correct: true
    - text: None, since CORS only matters for public data
      why: With credentials allowed, it exposes private data.
    - text: Attackers can call the API from curl without authenticating
      why: CORS doesn't affect curl, and auth is unchanged.
    - text: The browser blocks every cross-origin request, breaking the app
      why: It allows them all.
  explanation: Allow an exact list of origins; never reflect Origin with credentials.
- kind: check
  prompt: Why don't CSRF attacks work against an API that authenticates with an `Authorization: Bearer` header?
  choices:
    - text: Browsers don't attach that header to cross-site requests on their own
      correct: true
    - text: Bearer tokens are encrypted, so the attacker can't forge them
      why: CSRF doesn't forge credentials; it borrows the ones the browser sends.
    - text: The same-origin policy blocks all cross-site requests
      why: It blocks reading responses, not sending many requests.
  explanation: CSRF relies on ambient credentials such as cookies.
- kind: check
  prompt: A link-preview feature fetches user-supplied URLs. Which check best prevents SSRF?
  choices:
    - text: Resolve the host, refuse private and link-local IPs, and re-check on every redirect
      correct: true
    - text: Reject any URL that contains the string "169.254" or the word metadata
      why: Decimal IPs, DNS names and redirects all get around string checks.
    - text: Only allow https:// URLs, since the metadata service speaks plain HTTP
      why: Internal services can serve HTTPS too.
    - text: Set a short timeout on the fetch
      why: The metadata service answers in milliseconds.
  explanation: Check the resolved address, not the string; isolate the fetcher's network where you can.
- kind: fire
  prompt: What is the root fix for SQL injection?
  choices:
    - text: Parameterised queries
      correct: true
    - text: Escaping HTML in the input
      why: That's for output into pages, not SQL.
    - text: A web application firewall
      why: A WAF is a filter that can be bypassed, not a fix.
  explanation: The value travels separately from the statement, so it can never become SQL.
- kind: fire
  prompt: Which cookie attribute withholds the cookie on cross-site POSTs?
  choices:
    - text: SameSite=Lax
      correct: true
    - text: HttpOnly
      why: HttpOnly hides it from scripts, not from cross-site requests.
    - text: Secure
      why: Secure only requires HTTPS.
  explanation: Strict also withholds it on cross-site top-level navigation.
- kind: fire
  prompt: Which OWASP Top 10 (2021) category is ranked first?
  choices:
    - text: Broken access control
      correct: true
    - text: Injection
      why: Injection is third.
    - text: Cryptographic failures
      why: That's second.
  explanation: Missing server-side checks on who may do what.
- kind: fire
  prompt: Which header policy stops inline scripts from running even if one is injected?
  choices:
    - text: Content-Security-Policy
      correct: true
    - text: Strict-Transport-Security
      why: HSTS forces HTTPS.
    - text: X-Frame-Options
      why: That stops your page being framed (clickjacking).
  explanation: script-src 'self' or nonce-based CSP.
- kind: fire
  prompt: Is CORS a server-side access control mechanism?
  choices:
    - text: No; the browser enforces it, and only for reading responses
      correct: true
    - text: Yes; the server rejects any request that comes from an unlisted origin
      why: The server answers; the browser hides the response.
    - text: Yes, for every HTTP client
      why: curl and servers ignore it.
  explanation: Authenticate and authorise on the server regardless of CORS.
```
