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

A strategy is `(request, event, config) => Promise<Response>`. Set it on the top-level config or on a route.

### Network Only

Fetches from network, never uses cache. This is the default strategy. The `beforeNetwork` and `afterNetwork` middleware hooks run inside this strategy, so they run for every strategy that reaches the network through it.

```js
import { strategyNetworkOnly } from "@work-bee/core";
```

### Cache Only

Returns the cached response, never fetches from network. A miss rejects.

```js
import { strategyCacheOnly } from "@work-bee/core";
```

### Network First

Tries network first and falls back to the cache when the fetch fails (network error). HTTP error responses such as `404` or `500` are returned as-is.

A successful response is stored only if it has a freshness lifetime: `Cache-Control: max-age` (minus the response's current age, the larger of `Age` and the time since `Date`; `s-maxage` is ignored) is converted into an `Expires` header, or an existing `Expires` is kept. `max-age` overrides `Expires`. Not stored: responses without either header, non-`GET` requests, `206`, `Vary: *`, a `Vary` on `Authorization` or `Cookie`, and `Cache-Control: no-store` or `no-cache`. Use [@work-bee/cache-control](/docs/packages/cache-control) to set `Cache-Control` when the server doesn't.

```js
import { strategyNetworkFirst } from "@work-bee/core";
```

### Cache First

Returns a fresh cached response. On a miss, or when the cached entry has expired (including an invalid `Expires` value), it uses Network First, so an expired entry is still served if the network fails.

```js
import { strategyCacheFirst } from "@work-bee/core";
```

### Stale While Revalidate

Returns the cached response immediately. If the entry has expired, it is refreshed from the network in the background. On a miss it waits for Network First.

```js
import { strategyStaleWhileRevalidate } from "@work-bee/core";
```

### Stale If Error

Like Network First, and also serves the cached copy (even if expired) when the network returns a 5xx. Rejects with the original error only when both network and cache fail.

```js
import { strategyStaleIfError } from "@work-bee/core";
```

### Precache

The default strategy for `precache`. Fetches and stores every 2xx `GET` response whatever its freshness. Not stored: `206`, `Vary: *`, a `Vary` on `Authorization` or `Cookie`, and `Cache-Control: no-store`. Precached files are replaced when the ServiceWorker version (`cachePrefix`) changes.

```js
import { strategyPrecache } from "@work-bee/core";
```

### Ignore

Returns a synthetic `504` response without touching the cache or network.

```js
import { strategyIgnore } from "@work-bee/core";
```

### Cache First Ignore

Returns a fresh cached response, or the same synthetic `504` as Ignore when the entry is missing or expired. Never fetches.

```js
import { strategyCacheFirstIgnore } from "@work-bee/core";
```

### Static

`strategyStatic(response)` returns a clone of `response` for every request. Passing an `Error` makes the strategy reject, so the error flows through the `after` middleware.

```js
import { strategyStatic } from "@work-bee/core";

const strategy = strategyStatic(new Response("offline", { status: 503 }));
```

### Partition

`strategyPartition({ routes, makeRequest, headers })` breaks a request into sub-requests, one per entry in `routes` (each with its own strategy), runs them in parallel and streams the bodies back in order as one response. `makeRequest(request, config, routeConfig)` builds each sub-request. Without `headers`, the combined response takes its headers, status and status text from the first sub-response, minus per-fragment headers (`Content-Length`, `Content-Encoding`, `Content-Range`, `ETag`, `Last-Modified`). Pass `routes` through `compileConfig` so they have a strategy and cache key.

```js
import { strategyPartition } from "@work-bee/core";
```

### HTML Partition

Breaks an HTML page into parts (head, header, main, footer) that can each have their own caching strategy. Each sub-request URL is the request URL (without its hash) with the route's `pathPattern` replaced by the partition route's `path`, so `$1`-style references work. Method and headers are copied; the body is not.

```js
import { compileConfig, pathPattern, strategyHTMLPartition, strategyNetworkFirst } from "@work-bee/core";

const route = {
  pathPattern: pathPattern("(.+)\\.html$"),
  strategy: strategyHTMLPartition(
    compileConfig({
      routes: [{ path: "$1.header.html" }, { path: "$1.main.html" }],
      strategy: strategyNetworkFirst,
    }),
  ),
};
```

## Events

### compileConfig(options)

Compiles a configuration object. Routes inherit `cachePrefix`, `cacheName`, `methods`, `strategy` and `middlewares` from the top level. Throws a `TypeError` if `routes` or `middlewares` isn't an array, or if a route has neither a RegExp `pathPattern` nor a `path`.

```js
import { compileConfig } from "@work-bee/core";

const config = compileConfig({
  cachePrefix: "sw-1-",
  activate: { purgePrefixes: ["sw-"] },
  routes: [...],
  precache: { routes: [...] },
  middlewares: [...],
});
```

### eventInstall(event, config)

Handles the ServiceWorker `install` event. Pre-caches `precache.routes` (with `strategyPrecache` unless you set `precache.strategy`). Install fails if any route does not return a 2xx response, so the previous version keeps running with its caches. Calls `skipWaiting()` unless `skipWaiting: false`. If `precache.eventType` is set, posts `{ type: eventType }` once, after all routes finish.

### eventActivate(event, config)

Handles the `activate` event. Deletes caches from older versions and calls `clients.claim()`. Only caches whose name starts with a configured `cachePrefix` (top-level, `precache`, or any route) or with a prefix in `activate.purgePrefixes` are deleted, and never one the current config uses, including the caches of `strategyPartition` / `strategyHTMLPartition` routes. Other caches on the origin are not touched. If `activate.eventType` is set, posts `{ type: eventType }` when done.

When `cachePrefix` includes a version (`"sw-2-"`), add the unversioned part to `purgePrefixes` (`["sw-"]`); otherwise caches from the previous version (`"sw-1-…"`) are kept.

### eventFetch(event, config)

Handles the `fetch` event. Routes requests to the appropriate strategy.

When a request matches no route and the top-level config is the bare default
proxy (`strategyNetworkOnly` with no `middlewares`), `eventFetch` skips
`respondWith` so the browser handles the request natively — unmatched traffic
is never piped through the worker. Set `passthrough: false` on the top-level
config to force every request through the worker instead.

### backgroundFetchSuccessEvent(event, config)

Handles `backgroundfetchsuccess` (Chromium only). Stores each downloaded record in the cache of the route that matches its request, then posts `{ stored: true }` on a `BroadcastChannel` named after the registration id.

```js
self.addEventListener("backgroundfetchsuccess", (event) => {
  backgroundFetchSuccessEvent(event, config);
});
self.addEventListener("backgroundfetchfail", (event) => {
  backgroundFetchFailEvent(event); // logs the event
});
```

<h3>cacheOverrideEvent(config, &#123; allowedOrigins &#125;)</h3>

Returns a `message` event handler that writes `{ request, response }` from a page into the cache of the matching route. `allowedOrigins` is required and messages from unlisted senders are dropped. A ServiceWorker only receives messages from same-origin pages, so this check does not protect against script on your own origin. Pass the whole message event (the handler reads `event.source.url` and calls `event.waitUntil`). Use URL and body strings: `Request` and `Response` objects can't be posted.

```js
const cacheOverride = cacheOverrideEvent(config, {
  allowedOrigins: [self.location.origin],
});
addEventListener("message", (event) => {
  if (event.data?.type === "cache") cacheOverride(event);
});
```

Any script on an allowed origin, including injected script (XSS), can write lasting cache entries through this handler. `allowedOrigins` only checks the sending page's origin.

### fetchStrategy / fetchInlineStrategy

`fetchStrategy(request, event, config)` runs the `before` hooks, the strategy and the `after` hooks for one request. `fetchInlineStrategy` does the same but waits for any `event.waitUntil` work before resolving. Both resolve `Response | Error` when the strategy or a hook fails. `fetchInlineStrategy` rejects if a promise passed to `event.waitUntil` rejects.

## Configuration

Top-level options (all optional):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `cachePrefix` | `string` | `"sw-"` | Prefix prepended to cache names |
| `cacheName` | `string` | `"default"` | Cache used by the top-level strategy |
| `strategy` | `Strategy` | `strategyNetworkOnly` | Strategy for requests no route matches |
| `middlewares` | `Middleware[]` | `[]` | Middleware for the top level; inherited by routes |
| `routes` | `Route[]` | `[]` | Matched in order; the first match wins |
| `skipWaiting` | `boolean` | `true` | Call `skipWaiting()` on install |
| `passthrough` | `boolean` | `true` | Let unmatched requests bypass the worker when the top level is the bare default (see `eventFetch`) |
| `precache.routes` | `string[]`, `{ path }[]` or `string` | `[]` | Files to fetch on install, or a manifest URL (needs `extract`) |
| `precache.strategy` | `Strategy` | `strategyPrecache` | Strategy used to fetch precache routes |
| `precache.extract` | `(response) => Route[]` | — | Parses a manifest when `routes` is a URL |
| `precache.eventType` | `string` or `false` | `false` | Message type posted once precaching finishes |
| `precache.postMessage` | `(message) => Promise<void>` | `postMessageToFocused` | Sends the precache message |
| `activate.eventType` | `string` or `false` | `false` | Message type posted once activate finishes |
| `activate.postMessage` | `(message) => Promise<void>` | `postMessageToAll` | Sends the activate message |
| `activate.purgePrefixes` | `string[]` | `[]` | Extra cache-name prefixes activate may delete (must be an array) |

`precache` inherits `cachePrefix`, `cacheName` and `middlewares` from the top level; `activate` options are merged with the defaults above.

## RouteConfig

Each route in the `routes` array can have these properties:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pathPattern` | `RegExp` | — | Required for matched routes. Tested against the full request URL |
| `path` | `string` | — | Sub-request path for partition routes, which are never matched |
| `methods` | `string[]` | inherited, else `["GET"]` | HTTP methods this route handles |
| `cacheName` | `string` | inherited (`"default"`) | Name for the cache storage |
| `cachePrefix` | `string` | inherited (`"sw-"`) | Prefix prepended to cache names |
| `strategy` | `Strategy` | inherited (`strategyNetworkOnly`) | Caching strategy for this route |
| `middlewares` | `Middleware[]` | inherited (`[]`) | Middleware to apply to this route |

The cache name used is `cachePrefix + cacheName`.

## Middleware Lifecycle

A middleware is an object with any of `before`, `beforeNetwork`, `afterNetwork` and `after`. A hook set to `false` is skipped. Hooks run in this order for each request:

1. **`before`** — Runs before anything else, in registration order. Can replace the request. If it throws, the strategy is skipped and the `after` hooks get the error.
2. **`beforeNetwork`** — Runs just before the network fetch, in registration order.
3. *Network fetch*
4. **`afterNetwork`** — Runs after the network response (or error), in reverse registration order. Can replace the response.
5. **`after`** — Runs last, in reverse registration order. Can replace the final response (e.g. fallback on error). Receives an `Error` when the strategy failed.

`beforeNetwork` and `afterNetwork` are called by `strategyNetworkOnly`, so they only run when the network is actually hit. A cache hit skips them, and `strategyCacheOnly`, `strategyIgnore`, `strategyCacheFirstIgnore` and `strategyStatic` never run them.

## Precache

Configure precaching in the top-level config:

```js
const config = compileConfig({
  precache: {
    routes: ["/path/to/file.html", { path: "/other/file.js" }],
    eventType: "precache", // posts one message when all routes are done (false to disable)
  },
});
```

`routes` may also be a URL pointing at a remote route manifest. Core ships no
default parser for that, so an `extract` function is required — see
[@work-bee/precache-json](/docs/packages/precache-json) for the JSON one.

```js
import { precacheExtractJSON } from "@work-bee/precache-json";

const config = compileConfig({
  precache: {
    routes: "/precache.json",
    extract: precacheExtractJSON,
  },
});
```

## postMessage Utilities

```js
import { postMessageToAll, postMessageToFocused } from "@work-bee/core";
```

- `postMessageToAll(message)` — Posts a message to every open window client, including ones this worker doesn't control yet
- `postMessageToFocused(message)` — Posts a message to the focused window client, or the first one if none is focused

## Cache Utilities

- `cacheMatch(cacheKey, request)` — `caches.match(request, { cacheName: cacheKey })`; resolves `undefined` if the cache or entry is missing
- `cachePut(cacheKey, request, response)` — Stores a response. Only the request headers named in the response's `Vary` are kept in the key (never `Authorization` or `Cookie`). On `QuotaExceededError` it deletes expired entries (first in that cache, then in all caches) and retries
- `cacheExpired(response)` — `true` if `Expires` is in the past or invalid
- `applyExpires(response)` — Converts `Cache-Control: max-age` (minus the current age, the larger of `Age` and the time since `Date`) into an `Expires` header counted from now
- `cachesDelete(exclude, prefixes)` — Deletes caches starting with one of `prefixes` (default: all) except those in `exclude`
