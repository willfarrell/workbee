---
title: "@work-bee/fallback"
description: Fallback response middleware for WorkBee.
---

# @work-bee/fallback

Middleware that provides a fallback response when the primary strategy fails.

## Install

```bash
npm install @work-bee/core @work-bee/fallback
```

## Usage

```js
import { compileConfig, strategyNetworkOnly } from "@work-bee/core";
import fallbackMiddleware from "@work-bee/fallback";

const fallback = fallbackMiddleware({
  path: "/offline.html",
  statusCodes: [503, 504],
});

const config = compileConfig({
  // Fetched and stored during install
  precache: {
    routes: [{ path: "/offline.html" }],
  },
  strategy: strategyNetworkOnly,
  middlewares: [fallback],
});
```

Per-status pages, using the `{status}` placeholder:

```js
const fallback = fallbackMiddleware({
  path: "/errors/{status}.html",
  statusCodes: [404, 500],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | — | Required. Path of the fallback resource (should be precached). `{status}` is replaced with the failed response's status code (empty for a network error). Throws if missing or empty |
| `pathPattern` | `RegExp` | — | When set, the fallback URL is the request URL with `pathPattern` replaced by `path` (so `$1` etc. work). When unset, `path` is used as-is |
| `statusCodes` | `number[]` | `undefined` | Response status codes that trigger the fallback. When unset, only network errors (a rejected fetch or a missing cache entry) trigger it |
| `fallbackStrategy` | `Strategy` | see below | Strategy used to fetch the fallback resource |

## Returns

`{ after }`

## Behavior

- Runs in `after`. An `ok` response is returned unchanged; so is any other response whose status isn't in `statusCodes`.
- The fallback is requested as a `GET` with the original request's headers (so `Accept` / `Accept-Language` still apply). The method, body and `mode` are not copied, so it works for navigation requests.
- The default fallback strategy looks for the fallback in every cache (`caches.match`), then fetches it. A page precached under another cache name is found from any route.
- The fallback request runs through the route's `before` hooks and its other `after` hooks, but not through this one again, so a fallback that also fails can't loop.
