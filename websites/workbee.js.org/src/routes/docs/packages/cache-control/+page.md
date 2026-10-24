---
title: "@work-bee/cache-control"
description: HTTP Cache-Control header middleware for WorkBee.
---

# @work-bee/cache-control

Middleware that sets (overwrites) the `Cache-Control` header on network responses. The network strategies (`strategyNetworkFirst`, `strategyCacheFirst`, `strategyStaleWhileRevalidate`, `strategyStaleIfError`) only store responses that have a freshness lifetime, so this lets you cache responses from a server that doesn't send `Cache-Control` (or sends one you want to replace) for a fixed `max-age`.

## Install

```bash
npm install @work-bee/core @work-bee/cache-control
```

## Usage

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";
import cacheControlMiddleware from "@work-bee/cache-control";

const cacheControl = cacheControlMiddleware({
  cacheControl: "max-age=60",
});

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [cacheControl],
});
```

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `cacheControl` | `string` | Yes | `Cache-Control` value to set (e.g. `"max-age=60"`). Throws if missing or empty |

## Returns

`{ afterNetwork }`

## Behavior

- Runs in `afterNetwork`, so it only changes responses that came from the network. Cache reads are not affected and the cache is never bypassed.
- Replaces any `Cache-Control` header the server sent. Network errors and opaque responses (status `0`, from `no-cors` requests or `opaqueredirect`) are passed through unchanged, because their headers can't be changed.
- The page receives the response with the new header too.
- The strategy then decides whether to store it: with `max-age=N` (N > 0) the response gets an `Expires` of N seconds (minus any `Age` header) and is stored; with `max-age=0` it is not stored; with no `max-age` at all (e.g. `"no-cache"`) it is stored only if the server sent an `Expires` header.
- A stored response is served by `strategyCacheFirst` until it expires, then fetched again.
