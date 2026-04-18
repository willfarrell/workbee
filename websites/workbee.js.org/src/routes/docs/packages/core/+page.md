---
title: "@work-bee/core"
description: Core WorkBee package with caching strategies and event handlers.
---

# @work-bee/core

The core package provides caching strategies and ServiceWorker event handlers.

## Install

```bash
npm install @work-bee/core
```

## Strategies

### Network Only

Fetches from network, never uses cache.

```js
import { strategyNetworkOnly } from "@work-bee/core";
```

### Cache Only

Returns cached response, never fetches from network.

```js
import { strategyCacheOnly } from "@work-bee/core";
```

### Network First

Tries network first, falls back to cache on failure.

```js
import { strategyNetworkFirst } from "@work-bee/core";
```

### Cache First

Checks cache first, fetches from network if not found.

```js
import { strategyCacheFirst } from "@work-bee/core";
```

### Stale While Revalidate

Returns cached response immediately, then updates cache from network in the background.

```js
import { strategyStaleWhileRevalidate } from "@work-bee/core";
```

### Partition

Breaks a request into multiple sub-requests, each with their own strategy.

```js
import { strategyPartition } from "@work-bee/core";
```

### HTML Partition

Breaks an HTML page into parts (head, header, main, footer) that can each have their own caching strategy.

```js
import { strategyHTMLPartition } from "@work-bee/core";
```

## Events

### compileConfig(options)

Compiles a route configuration object.

```js
import { compileConfig } from "@work-bee/core";

const config = compileConfig({
  cachePrefix: "sw-1-",
  routes: [...],
  precache: { routes: [...], strategy: strategyCacheOnly },
  middlewares: [...],
});
```

### eventInstall(event, config)

Handles the ServiceWorker `install` event. Pre-caches resources if configured.

### eventActivate(event, config)

Handles the `activate` event. Cleans up old caches.

### eventFetch(event, config)

Handles the `fetch` event. Routes requests to the appropriate strategy.

## RouteConfig

Each route in the `routes` array can have these properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pathPattern` | `RegExp` | — | Pattern to match request URLs |
| `methods` | `string[]` | `["GET"]` | HTTP methods this route handles |
| `cacheName` | `string` | — | Name for the cache storage |
| `cachePrefix` | `string` | `""` | Prefix prepended to cache names |
| `cacheControlMaxAge` | `number` | — | Max age in seconds for cache entries |
| `strategy` | `Strategy` | — | Caching strategy for this route |
| `middlewares` | `Middleware[]` | `[]` | Middleware to apply to this route |

## Middleware Lifecycle

Middleware hooks run in this order for each request:

1. **`before`** — Runs before anything else. Can modify the request.
2. **`beforeNetwork`** — Runs before the network fetch (if the strategy fetches).
3. *Strategy executes* (fetch from network/cache)
4. **`afterNetwork`** — Runs after the network response is received. Can modify the response.
5. **`after`** — Runs last. Can modify the final response (e.g. fallback on error).

## Precache

Configure precaching in the top-level config:

```js
const config = compileConfig({
  precache: {
    routes: ["/path/to/file.html", { path: "/other/file.js" }],
    strategy: strategyCacheOnly,
    eventType: "precache", // postMessage event type (false to disable)
  },
});
```

## postMessage Utilities

```js
import { postMessageToAll, postMessageToFocused } from "@work-bee/core";
```

- `postMessageToAll(message)` — Posts a message to all controlled window clients
- `postMessageToFocused(message)` — Posts a message to the focused window client
