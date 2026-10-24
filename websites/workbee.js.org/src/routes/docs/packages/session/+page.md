---
title: "@work-bee/session"
description: Session management middleware for WorkBee.
---

# @work-bee/session

Middleware that keeps an auth token inside the ServiceWorker. It takes the token from the login response, removes it before the page sees it, and adds it to requests that need it. Page scripts never see the token.

## Install

```bash
npm install @work-bee/core @work-bee/session
```

## Usage

```js
import { compileConfig, strategyNetworkOnly } from "@work-bee/core";
import sessionMiddleware, {
  getTokenAuthorization,
  getExpiryJWT,
  setTokenAuthorization,
} from "@work-bee/session";

const session = sessionMiddleware({
  authnMethods: ["POST"],
  authnPathPattern: /\/auth\/login$/,
  authnGetToken: getTokenAuthorization,
  authnGetExpiry: getExpiryJWT,
  authzPathPattern: /\/api\//,
  authzSetToken: setTokenAuthorization,
  unauthnPathPattern: /\/auth\/logout$/,
  expiryEventType: "session-expired",
});

const config = compileConfig({
  strategy: strategyNetworkOnly,
  middlewares: [session],
});
```

## The token lives only in ServiceWorker memory

The token is never written to storage. Browsers stop an idle ServiceWorker after about 30 seconds, and it also restarts on update. **When the ServiceWorker restarts the token is gone and the user has to log in again.** Plan for this: when an `authzPathPattern` request comes back `401`, send the user to your login flow.

After a restart, entries matching `authzPathPattern` are deleted from the route's cache before it is next read, so responses cached for the old session are not served. Entries for other URLs in the same cache are kept. This happens once per cache per ServiceWorker start.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authnMethods` | `string[]` | `["POST"]` | HTTP methods of the login request |
| `authnPathPattern` | `RegExp` | — | Pattern matching the login endpoint. Only responses from the ServiceWorker's origin or `authzAllowedOrigins` are read |
| `authnGetToken` | `(response) => string` | `getTokenAuthorization` | Extracts the token from the login response. No session starts if it returns a falsy value |
| `authnGetExpiry` | `(response, token) => number` | 12 hours | Returns the time until the session expires, **in milliseconds from now** (not a timestamp). Values above 2^31-1 ms (about 24.8 days) work |
| `authzPathPattern` | `RegExp` | — | Pattern matching requests that get the token |
| `authzSetToken` | `(request, token) => Request` | `setTokenAuthorization` | Adds the token to an outgoing request |
| `authzAllowedOrigins` | `string[]` | the ServiceWorker's origin | The token is only added to requests to these origins, even when `authzPathPattern` matches |
| `inactivityPromptEventType` | `string` | — | Message type posted 60 s before expiry if there has been no activity in the last 60 s. Otherwise it waits until 60 s pass without activity, and is not posted if the session expires first |
| `postMessage` | `(message) => Promise<void>` | `postMessageToFocused` | Function to send messages to clients |
| `unauthnPathPattern` | `RegExp` | — | Pattern matching the logout endpoint |
| `expiryEventType` | `string` | — | Message type posted when the session expires |

## Returns

`{ before, afterNetwork, after, activityEvent, destroy }`

- `before` / `after` exist only when `authzPathPattern` is set; `afterNetwork` only when `authnPathPattern` or `unauthnPathPattern` is set.
- `activityEvent()` records activity. The inactivity prompt waits until 60 s have passed since the last activity. Requests through `after` call it too.
- `destroy()` ends the session (same as logout) and clears the timers.

## Behavior

- **Login:** when a request matching `authnMethods` and `authnPathPattern`, on the ServiceWorker's origin or in `authzAllowedOrigins`, gets a response, the token is read with `authnGetToken` and the expiry with `authnGetExpiry`. The `Authorization` header is always removed from the login response before it reaches the page.
- **Authorized requests:** `before` (async) adds the token with `authzSetToken` to requests matching `authzPathPattern` whose origin is in `authzAllowedOrigins`.
- **Logout and expiry:** a request to `unauthnPathPattern` (any outcome, including a network error), or the session timer running out, clears the token and deletes the entries matching `authzPathPattern` from every cache the session's routes wrote to. Other entries in those caches are kept. On expiry, `expiryEventType` is posted.
- `afterNetwork` runs only when the network is hit, so use a network strategy for the login and logout routes.
- **With `@work-bee/offline`:** call `offline.clear()` on logout. Otherwise requests queued while offline replay later with whatever token is current, which may belong to the next user.

## Helper Exports

```js
import {
  getTokenAuthorization,
  getExpiryJWT,
  getExpiryPaseto,
  setTokenAuthorization,
} from "@work-bee/session";
```

- `getTokenAuthorization(response)` — Returns the token from an `Authorization: Bearer <token>` response header
- `getExpiryJWT(response, token)` — Milliseconds until the JWT's `exp` claim. Reads the payload without verifying the signature. Returns `0` if it can't be parsed
- `getExpiryPaseto(response, token)` — Milliseconds until the `exp` date in the PASETO **footer** (the last `.`-separated part, JSON). Reads it without verifying the token. Returns `0` if it can't be parsed
- `setTokenAuthorization(request, token)` — Sets `Authorization: Bearer <token>` on a request

These helpers only parse; validate tokens on the server.
