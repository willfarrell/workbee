---
title: Concepts
description: Architecture and core concepts of WorkBee.
---

# Concepts

## Request Flow

When a ServiceWorker intercepts a fetch event, WorkBee processes it through this pipeline:

1. **Route matching** — `eventFetch` finds the first route where `pathPattern` matches the request URL and `methods` includes the request method. If none matches, the top-level config is used. If that top-level config is the bare default (`strategyNetworkOnly`, no `middlewares`, `passthrough` not `false`), `eventFetch` doesn't call `respondWith` and the browser handles the request itself.
2. **Middleware `before`** — Each middleware's `before` hook runs in registration order, receiving and possibly replacing the request. If one throws, the strategy is skipped and the error is passed on to the `after` hooks.
3. **Strategy execution** — The configured strategy (e.g. `strategyCacheFirst`) handles the fetch/cache logic.
   - **`beforeNetwork`** — runs in registration order just before the network request.
   - **`afterNetwork`** — runs in reverse registration order right after the network response (or network error), and can replace it.

   These two hooks are called by `strategyNetworkOnly`, which the other network strategies use to fetch. They only run when the network is actually hit: a cache hit in `strategyCacheFirst` skips them, and `strategyCacheOnly`, `strategyIgnore` and `strategyStatic` never run them.
4. **Middleware `after`** — Each middleware's `after` hook runs last, in reverse registration order, and can replace the response (e.g. with a fallback). It receives an `Error` instead of a `Response` when the strategy failed.

Reverse order means the first middleware in `middlewares` wraps the others: its `before` runs first and its `after` runs last.

## Strategies

Strategies determine how a request is fulfilled:

| Strategy | Behavior |
|----------|----------|
| `strategyNetworkOnly` | Always fetches from network (the default) |
| `strategyCacheOnly` | Only returns cached responses; a miss rejects |
| `strategyNetworkFirst` | Tries network, falls back to cache on a network error |
| `strategyCacheFirst` | Returns a fresh cached response; otherwise uses `strategyNetworkFirst` |
| `strategyStaleWhileRevalidate` | Returns the cached response immediately; refreshes it in the background if it has expired |
| `strategyStaleIfError` | Like `strategyNetworkFirst`, and also serves the cached copy when the network returns a 5xx |
| `strategyPrecache` | Fetches and stores every 2xx response (except `206` and `Vary: *`), ignoring `Cache-Control`. The default for `precache` |
| `strategyIgnore` | Returns a synthetic `504` response |
| `strategyCacheFirstIgnore` | Tries cache, returns `504` if missing or expired |
| `strategyStatic(response)` | Always returns a clone of the given response (rejects if given an `Error`) |
| `strategyHTMLPartition(options)` | Breaks HTML into parts with individual strategies |
| `strategyPartition(options)` | Breaks request into sub-requests with individual strategies |

The network strategies only store a response when it has a freshness lifetime: `Cache-Control: max-age` (minus the `Age` header) is converted into an `Expires` header, or an existing `Expires` is kept. `s-maxage` is ignored because a ServiceWorker cache is private. Responses without either header, `206` responses and `Vary: *` responses are not stored. [@work-bee/cache-control](/docs/packages/cache-control) can set `Cache-Control` for you.

Cache entries are keyed by URL plus only the request headers named in the response's `Vary` header. `Authorization` and `Cookie` are never stored in the key.

## Configuration

`compileConfig()` merges your partial config with defaults and normalizes the structure. It:

- Builds the `before`, `beforeNetwork`, `afterNetwork` and `after` arrays from the `middlewares` array (`false` hooks are skipped)
- Applies the same normalization to each route in `routes`, which inherit `cachePrefix`, `cacheName`, `methods`, `strategy` and `middlewares` from the top level
- Throws if a route has neither a RegExp `pathPattern` nor a `path`
- Sets up `precache` and `activate` configuration, merged with their defaults

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
import { compileConfig, strategyNetworkFirst } from "@work-bee/core";
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

Some middleware also returns a `postMessageEvent` handler that must be wired up to the ServiceWorker's `message` event. `@work-bee/offline/client` posts `{ type: "online" }` when the page comes back online:

```js
import offlineMiddleware from "@work-bee/offline";

const offline = offlineMiddleware({ pollDelay: 0 });

addEventListener("message", (event) => {
  if (event.data?.type === "online") {
    event.waitUntil(offline.postMessageEvent());
  }
});
```

## Precache

Resources listed in `precache.routes` are fetched and stored during the `install` event with `strategyPrecache`. Precached files are replaced when the ServiceWorker version (`cachePrefix`) changes, not according to their `Cache-Control`:

```js
const config = compileConfig({
  precache: {
    routes: ["/offline.html", "/styles.css"],
    eventType: "precache", // posts one message when all routes are done (false to disable)
  },
});
```

## Activate

On `activate`, WorkBee deletes caches left by older versions and claims open clients. It only deletes caches whose name starts with a configured `cachePrefix` (top-level, `precache`, or any route) or with a prefix in `activate.purgePrefixes`, and never a cache the current config uses. Other caches on the origin are left alone.

If you put a version in the prefix, add the unversioned part to `purgePrefixes`, otherwise the previous version's caches are kept:

```js
const config = compileConfig({
  cachePrefix: "sw-2-",
  activate: { purgePrefixes: ["sw-"] },
});
```

## postMessage Communication

WorkBee uses `postMessage` for ServiceWorker-to-client communication:

```js
import { postMessageToAll, postMessageToFocused } from "@work-bee/core";

// Notify all open tabs
await postMessageToAll({ type: "cache-updated", url: "/data" });

// Notify only the focused tab (or the first open tab if none is focused)
await postMessageToFocused({ type: "session-expired" });
```
