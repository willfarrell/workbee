---
title: "@work-bee/cache-control"
description: HTTP Cache-Control header middleware for WorkBee.
---

# @work-bee/cache-control

Middleware that respects HTTP `Cache-Control` headers to determine caching behavior.

## Install

```bash
npm install @work-bee/cache-control
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
| `cacheControl` | `string` | Yes | Cache-Control header value (e.g. `"max-age=60"`, `"no-cache"`) |

## Returns

`{ afterNetwork }`

## Behavior

- `max-age=0` or `no-cache` - bypasses cache, fetches from network
- `max-age=N` - uses cached response if not expired
- No `Cache-Control` header - falls through to default strategy
