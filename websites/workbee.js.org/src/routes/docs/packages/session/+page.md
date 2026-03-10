---
title: "@work-bee/session"
description: Session management middleware for WorkBee.
---

# @work-bee/session

Middleware for managing user sessions within the ServiceWorker.

## Install

```bash
npm install @work-bee/session
```

## Usage

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";
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
});

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [session],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `authnMethods` | `string[]` | — | HTTP methods for authentication requests |
| `authnPathPattern` | `RegExp` | — | Pattern matching authentication endpoints |
| `authnGetToken` | `(response) => string` | — | Extract auth token from response |
| `authnGetExpiry` | `(response, token) => number` | — | Extract token expiry timestamp |
| `authzPathPattern` | `RegExp` | — | Pattern matching endpoints that need authorization |
| `authzSetToken` | `(request, token) => Request` | — | Attach auth token to outgoing request |
| `inactivityPromptEventType` | `string` | — | Event type posted before session expiry |
| `postMessage` | `(message) => Promise<void>` | — | Function to send messages to clients |
| `unauthnPathPattern` | `RegExp` | — | Pattern matching logout/unauthenticate endpoints |
| `expiryEventType` | `string` | — | Event type posted when session expires |

## Returns

`{ before, afterNetwork, after, activityEvent }`

## Helper Exports

```js
import {
  getTokenAuthorization,
  getExpiryJWT,
  getExpiryPaseto,
  setTokenAuthorization,
} from "@work-bee/session";
```

- `getTokenAuthorization(response)` — Extracts Bearer token from Authorization header
- `getExpiryJWT(response, token)` — Extracts expiry from a JWT token
- `getExpiryPaseto(response, token)` — Extracts expiry from a PASETO token
- `setTokenAuthorization(request, token)` — Sets the Authorization Bearer header on a request
