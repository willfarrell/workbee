---
title: Concepts
description: Architecture and core concepts of WorkBee.
---

# Concepts

## Request Flow

When a ServiceWorker intercepts a fetch event, WorkBee processes it through this pipeline:

1. **Route matching** — `eventFetch` finds the first route where `pathPattern` matches the request URL and `methods` includes the request method.
2. **Middleware `before`** — Each middleware's `before` hook runs in order, receiving and potentially modifying the request.
3. **Middleware `beforeNetwork`** — Each middleware's `beforeNetwork` hook runs before the strategy makes a network request.
4. **Strategy execution** — The configured strategy (e.g. `strategyCacheFirst`) handles the actual fetch/cache logic.
5. **Middleware `afterNetwork`** — Each middleware's `afterNetwork` hook runs after the network response, and can modify the response.
6. **Middleware `after`** — Each middleware's `after` hook runs last, and can replace the response (e.g. with a fallback).

## Strategies

Strategies determine how a request is fulfilled:

| Strategy | Behavior |
|----------|----------|
| `strategyNetworkOnly` | Always fetches from network |
| `strategyCacheOnly` | Only returns cached responses |
| `strategyNetworkFirst` | Tries network, falls back to cache |
| `strategyCacheFirst` | Tries cache, falls back to network |
| `strategyStaleWhileRevalidate` | Returns cache immediately, revalidates in background |
| `strategyIgnore` | Returns a 408 response |
| `strategyCacheFirstIgnore` | Tries cache, returns 408 if not cached |
| `strategyStatic(response)` | Always returns the given static response |
| `strategyHTMLPartition(options)` | Breaks HTML into parts with individual strategies |
| `strategyPartition(options)` | Breaks request into sub-requests with individual strategies |

## Configuration

`compileConfig()` merges your partial config with defaults and normalizes the structure. It:

- Ensures all middleware arrays (`before`, `beforeNetwork`, `afterNetwork`, `after`) are populated from the `middlewares` array
- Applies the same normalization to each route in `routes`
- Sets up `precache` configuration

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";

const config = compileConfig({
  cachePrefix: "v1-",
  routes: [
    {
      pathPattern: new RegExp("/api/(.+)$"),
      cacheName: "api",
      strategy: strategyCacheFirst,
    },
  ],
});
```

## Middleware

Middleware packages return objects with lifecycle hooks. Add them to a route's `middlewares` array and `compileConfig` distributes them to the correct phase:

```js
import loggerMiddleware from "@work-bee/logger";
import fallbackMiddleware from "@work-bee/fallback";

const config = compileConfig({
  strategy: strategyNetworkFirst,
  middlewares: [
    loggerMiddleware(),
    fallbackMiddleware({ path: "/offline.html" }),
  ],
});
```

Some middleware also returns a `postMessageEvent` handler that must be wired up to the ServiceWorker's `message` event:

```js
import offlineMiddleware from "@work-bee/offline";

const offline = offlineMiddleware({ pollDelay: 0 });

addEventListener("message", (event) => {
  const { data } = event;
  if (data.type === "offline") {
    event.waitUntil(offline.postMessageEvent());
  }
});
```

## Precache

Resources listed in `precache.routes` are cached during the `install` event:

```js
const config = compileConfig({
  precache: {
    routes: ["/offline.html", "/styles.css"],
    strategy: strategyCacheOnly,
    eventType: "precache", // posts progress to clients (false to disable)
  },
});
```

## postMessage Communication

WorkBee uses `postMessage` for ServiceWorker-to-client communication:

```js
import { postMessageToAll, postMessageToFocused } from "@work-bee/core";

// Notify all open tabs
await postMessageToAll({ type: "cache-updated", url: "/data" });

// Notify only the focused tab
await postMessageToFocused({ type: "session-expired" });
```
