---
id: oauth-oidc
category: security
skill: security
title: OAuth 2.0 and OpenID Connect
minutes: 16
summary: OAuth 2.0 lets an app act on a user's behalf without seeing their password; it is delegated authorisation, not login. The authorization code flow with PKCE is the default for every kind of client, client credentials covers machine-to-machine calls, and the device flow covers TVs and CLIs; the implicit and password grants are retired. OpenID Connect adds login on top: an ID token that tells the client who signed in. Most real attacks target the redirect, so exact redirect URI matching, PKCE and state carry the security.
objectives:
  - Name the four OAuth roles and explain what an access token is for
  - Walk through the authorization code flow with PKCE and say what each step protects
  - Choose the right grant for a web app, an SPA, a mobile app, a backend job and a TV
  - Explain what OpenID Connect adds and how ID tokens differ from access tokens
  - Spot redirect, code interception and login CSRF attacks and their defences
sources:
  - ['RFC 6749: The OAuth 2.0 Authorization Framework', 'https://datatracker.ietf.org/doc/html/rfc6749']
  - ['RFC 7636: Proof Key for Code Exchange (PKCE)', 'https://datatracker.ietf.org/doc/html/rfc7636']
  - ['RFC 9700: Best Current Practice for OAuth 2.0 Security', 'https://datatracker.ietf.org/doc/html/rfc9700']
  - ['OpenID Connect Core 1.0', 'https://openid.net/specs/openid-connect-core-1_0.html']
  - ['OAuth 2.0 for Browser-Based Applications (IETF draft)', 'https://datatracker.ietf.org/doc/draft-ietf-oauth-browser-based-apps/']
---

## What OAuth is for

Before OAuth, a photo-printing site that wanted your Google Photos asked for your Google password. OAuth replaces that with a **token**: a credential that grants a specific app specific access (**scopes**, such as `photos.read`) for a limited time, which the user can revoke without changing their password.

Four roles:

- **Resource owner**: the user.
- **Client**: the app that wants access (the printing site).
- **Authorization server**: signs the user in, asks for consent, issues tokens (Google's accounts server, Okta, Auth0, Keycloak, Entra ID).
- **Resource server**: the API that accepts the token (Google Photos API).

OAuth on its own says nothing about *who* the user is. An access token is meant for the resource server; the client is not supposed to read it, and "I got an access token" does not prove the user's identity to the client. That gap is what OpenID Connect fills.

## The authorization code flow with PKCE

This is the flow to know cold. The current best-practice RFC (9700) and the draft OAuth 2.1 recommend it for every client, public or confidential.

```arch
title: Authorization code + PKCE
speed: 3400
nodes:
  - {id: user, label: 'User''s browser', kind: client, x: 0, y: 1}
  - {id: app, label: 'Client app', kind: service, x: 1, y: 0, note: 'holds code_verifier'}
  - {id: as, label: 'Authorization server', kind: service, x: 2, y: 1, note: 'login, consent, tokens'}
  - {id: api, label: 'Resource server (API)', kind: service, x: 2, y: 0, note: 'checks aud, scope, exp'}
edges:
  - [user, app, 'clicks "Connect"']
  - [app, as, 'authorise / token']
  - [as, user, 'login page, redirect']
  - [app, api, 'Bearer access token']
paths:
  - label: The whole flow
    steps:
      - [user, app, 'The user clicks "Connect Google Photos".']
      - [app, user, 'The app makes a random code_verifier, stores it, and redirects the browser to /authorize?response_type=code&client_id=…&redirect_uri=…&scope=photos.read&state=RANDOM&code_challenge=SHA256(verifier)']
      - [user, as, 'The user signs in at the authorization server (the app never sees the password) and approves the scopes.']
      - [as, user, 'The server redirects to the registered redirect_uri with ?code=ONE_TIME_CODE&state=RANDOM']
      - [user, app, 'The browser delivers the code. The app checks state matches what it stored.']
      - [app, as, 'Back channel: POST /token with the code and the code_verifier (plus the client secret for a backend client).']
      - [as, app, 'The server checks SHA256(verifier) equals the challenge it saw, then returns an access token (minutes) and a refresh token.']
      - [app, api, 'The app calls the API with Authorization: Bearer <access token>. The API checks signature, aud, scope and exp.']
caption: The code travels through the browser, where it can leak; the tokens travel only on the back channel. PKCE binds the code to whoever started the flow.
```

What each piece protects against:

- **The code is not the token.** The browser only ever sees a short-lived, single-use code. Tokens come back on a direct server-to-server (or app-to-server) call.
- **PKCE** (`code_challenge` up front, `code_verifier` at the exchange) means a stolen code is useless to anyone who didn't start the flow. It was built for mobile apps, where another app can register the same URL scheme, and it also defeats login CSRF.
- **`state`** ties the callback to a request this browser made. With PKCE it's belt and braces; without PKCE it's essential.
- **Exact `redirect_uri` matching** stops an attacker sending the code to their own page. PKCE does *not* help there: an attacker who starts the flow owns their own verifier.

```sim
name: oauth
title: OAuth flows under attack
intro: 'Pick a flow and an attack, and decide whether the client sends state and whether the authorization server matches redirect URIs exactly.'
challenges:
  - {text: 'Steal an access token from the implicit flow', metric: implicitLeak, op: '==', value: 1}
  - {text: 'Find the attack that PKCE alone does not stop', metric: pkceBeaten, op: '==', value: 1}
  - {text: 'Configure a public client that blocks all four attacks', metric: safeAll, op: '==', value: 1, and: [{metric: flow, op: '==', value: 'pkce'}]}
takeaway: |
  Authorization code with PKCE for every client, exact redirect URI matching on the server, and state (or PKCE) against login CSRF. The implicit flow puts tokens in URLs, where history, logs and other scripts can read them; it is retired.
```

## Choosing a grant

| Client | Grant |
|---|---|
| Server-rendered web app | Authorization code + PKCE, with a client secret (a *confidential* client) |
| Single-page app | Authorization code + PKCE (public client), ideally via a backend-for-frontend so tokens stay off the browser |
| Mobile or desktop app | Authorization code + PKCE through the system browser (not an embedded web view) |
| Backend service calling an API, no user | **Client credentials**: the service authenticates as itself |
| TV, CLI or device with no good browser | **Device authorization grant**: show a code, the user approves on their phone |
| Keeping a session alive | **Refresh token**, rotated on every use |

Retired: the **implicit** grant (token straight in the redirect URL fragment) and the **resource owner password** grant (the app collects the password, which is what OAuth was invented to avoid).

```sort
prompt: Which grant fits each client?
buckets: [Authorization code + PKCE, Client credentials, Device authorization]
items:
  - {text: 'A React SPA that reads the user''s calendar', bucket: 0, why: 'A user is present and a browser is available.'}
  - {text: 'A nightly billing job that calls the invoices API', bucket: 1, why: 'No user: the job authenticates as itself.'}
  - {text: 'A smart TV app signing in to a streaming account', bucket: 2, why: 'Typing a password on a TV remote is miserable; approve on a phone.'}
  - {text: 'An iOS app connecting to the user''s Dropbox', bucket: 0, why: 'Use the system browser and PKCE.'}
  - {text: 'A CLI tool like `gh auth login` on a headless server', bucket: 2, why: 'No local browser: show a code and a URL.'}
  - {text: 'A microservice calling another microservice with its own identity', bucket: 1, why: 'Service-to-service, no end user.'}
```

## Tokens in practice

- **Access tokens** are short-lived (minutes to an hour) and carry an **audience**: the API they are for. They may be opaque (the API asks the authorization server, via token **introspection**) or JWTs (the API verifies them itself with keys from the server's **JWKS** endpoint). A resource server must check `aud`, or a token issued for one API works on all of them.
- **Scopes** say what the *app* may do on the user's behalf. They are not the user's permissions: the API still checks that this user may touch this object.
- **Refresh tokens** are long-lived and powerful. Rotate them on every use, and if an old one is ever presented again, revoke the whole family: that reuse means one was stolen.
- **Sender-constrained tokens** (DPoP or mutual TLS) bind a token to a key the client holds, so a leaked bearer token alone isn't enough.

## OpenID Connect: login on top of OAuth

**OIDC** is a thin layer over the code flow. Add the `openid` scope and the token response also contains an **ID token**: a JWT *for the client* saying who signed in.

| | ID token | Access token |
|---|---|---|
| Audience | The client (`aud` = client_id) | The API |
| Says | "This is user 123, signed in at 10:02 with MFA" | "The bearer may do `photos.read`" |
| The client should | Verify it and read it | Send it to the API without reading it |
| Send to APIs? | No | Yes |

The client validates the ID token like any JWT (signature from the provider's JWKS, `iss`, `aud` = its own client_id, `exp`) plus the **`nonce`** it sent, which stops replay of an old ID token. Discovery (`/.well-known/openid-configuration`) publishes the endpoints and keys, which is why "Sign in with Google" takes a few lines with a library. In enterprises, **SAML** does the same job with XML assertions and is still common for workforce single sign-on.

```predict
prompt: A mobile app uses the authorization code flow without PKCE. A malicious app installed on the same phone registers the same custom URL scheme (myapp://callback). What can it do?
choices:
  - text: Nothing useful, because the code is single-use and short-lived
  - text: Receive the authorization code and redeem it, since a public client has no secret
  - text: Read the user's password as they type it on the login page
  - text: Only see the state parameter, which on its own grants no access
answer: 1
reveal: |
  The operating system may hand the redirect to either app. A public client has no client secret, so whoever holds the code can redeem it, and single-use only helps if the real app redeems it first. PKCE fixes this: the token endpoint demands the code_verifier, which never left the real app. Better still, use claimed HTTPS redirect links (Universal Links, App Links), which only the verified app can receive. The password is safe either way; the login happens in the system browser.
```

```incident
title: 'Social login signs people in to strangers'' accounts'
start: s0
nodes:
  s0:
    text: 'Support reports users finding someone else''s data after using "Sign in with" social login on your web app. The OAuth client is a confidential server-side app using the code flow. Logs show some callbacks arriving with a code whose login was started from a different browser. What do you suspect first?'
    options:
      - {label: 'Login CSRF: the callback isn''t tied to the browser that started the flow', next: s1, quality: good, note: 'Codes from another browser are the tell.'}
      - {label: 'The access tokens are too long-lived', next: bad1, quality: bad, note: 'Lifetime doesn''t explain the wrong account.'}
  bad1:
    text: 'You shorten token lifetimes. Reports keep coming.'
    verdict: bad
  s1:
    text: 'The client sends a fixed state value ("login") and never checks it. An attacker starts a login with their own account, stops at the callback URL and sends it to victims, who end up signed in to the attacker''s account and save their details there.'
    options:
      - {label: 'Generate a random state per login, store it in the session, reject callbacks that don''t match; add PKCE too', next: good, quality: good, note: 'Both bind the callback to the browser that started it.'}
      - {label: 'Block the attacker''s account', next: okay, quality: ok, note: 'Stops one attacker, not the bug.'}
  okay:
    text: 'That account is gone; a new one appears the next day.'
    verdict: ok
  good:
    text: 'Forged callbacks now fail the state check, and PKCE makes a code started elsewhere unredeemable. You also contact affected users about data saved in the wrong account.'
    verdict: good
debrief: Bind every authorization response to the session that requested it, with a random state, PKCE, and for OIDC a nonce. Libraries do all three when you let them.
```

```questions
- kind: check
  prompt: In the authorization code flow, why does the authorization server return a code to the browser rather than the access token itself?
  choices:
    - text: The browser channel can leak, so it only carries a single-use code; tokens go back-channel
      correct: true
    - text: Access tokens are too large to fit in a URL, which browsers cap at a few KB
      why: Size isn't the reason; exposure is.
    - text: Browsers can't store access tokens
      why: They can, which is part of the risk.
    - text: The code is encrypted end to end, while the access token is only signed
      why: The code isn't encrypted; it's useless on its own.
  explanation: URLs end up in history, logs and Referer headers. Keep tokens out of them.
- kind: check
  prompt: A public SPA uses authorization code + PKCE, but the authorization server accepts any redirect_uri that starts with https://app.example. What attack still works?
  choices:
    - text: The victim's code is sent to the attacker's lookalike URL, and they redeem it with their own verifier
      correct: true
    - text: None, because PKCE makes a code useless to anyone but the app that started the flow
      why: The attacker started that flow, so they hold its verifier.
    - text: Login CSRF, because PKCE doesn't protect against it
      why: PKCE does defeat login CSRF.
    - text: Code interception by another app
      why: PKCE stops interception of a flow the attacker didn't start.
  explanation: Exact redirect URI matching is the only fix for redirect manipulation.
- kind: check
  prompt: What does an OpenID Connect ID token tell the client?
  choices:
    - text: Who signed in, when and how, as a JWT whose audience is the client itself
      correct: true
    - text: Which APIs the client may call on the user's behalf
      why: That's the access token's job.
    - text: The user's password hash, so the client can verify future logins
      why: Passwords never leave the identity provider.
    - text: A long-lived credential to stay signed in
      why: That's a refresh token.
  explanation: Don't send ID tokens to APIs, and don't use access tokens as proof of identity in the client.
- kind: check
  prompt: A refresh token that was already used (and rotated) is presented again. What should the authorization server do?
  choices:
    - text: Treat it as theft and revoke the whole token family
      correct: true
    - text: Accept it, since the user is clearly still active and signed in
      why: Reuse means two parties hold it; one is an attacker.
    - text: Return the same new token it issued the first time
      why: That hands the attacker a live token.
  explanation: Rotation with reuse detection turns a stolen refresh token into an alarm.
- kind: fire
  prompt: Which grant should a backend job with no user use to call an API?
  choices:
    - text: Client credentials
      correct: true
    - text: Authorization code with PKCE
      why: That needs a user to sign in.
    - text: Implicit
      why: Retired, and for browsers anyway.
  explanation: The service authenticates as itself, with a secret or a signed assertion.
- kind: fire
  prompt: What does PKCE add to the authorization code flow?
  choices:
    - text: A per-flow secret: its hash goes in the request, and it must be shown to redeem the code
      correct: true
    - text: Encryption of the access token so that only the API can read it
      why: PKCE doesn't encrypt anything.
    - text: A second authentication factor for the user, such as a one-time code
      why: It's about the client, not the user.
  explanation: A stolen code is useless without the code_verifier.
- kind: fire
  prompt: Which OAuth grant is retired because it puts the access token in the redirect URL?
  choices:
    - text: Implicit
      correct: true
    - text: Device authorization
      why: The device flow polls for the token on a back channel.
    - text: Client credentials
      why: No redirect at all.
  explanation: Use authorization code with PKCE instead.
- kind: fire
  prompt: What stops an old ID token from being replayed into a new login?
  choices:
    - text: The nonce the client sent, which must appear in the ID token
      correct: true
    - text: The scope parameter, which lists exactly what the client asked for
      why: Scopes request access, not freshness.
    - text: The refresh token, which is rotated on every use
      why: Unrelated to ID token replay.
  explanation: The client stores a random nonce with the login and checks it on return.
- kind: fire
  prompt: A TV app needs the user to sign in. Which grant fits?
  choices:
    - text: Device authorization grant
      correct: true
    - text: Resource owner password grant
      why: Retired, and it hands the password to the app.
    - text: Client credentials
      why: That has no user.
  explanation: Show a short code; the user approves on their phone.
```
