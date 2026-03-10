---
title: "@work-bee/fallback"
description: Fallback response middleware for WorkBee.
---

# @work-bee/fallback

Middleware that provides a fallback response when the primary strategy fails.

## Install

```bash
npm install @work-bee/fallback
```

## Usage

```js
import {
  compileConfig,
  strategyNetworkOnly,
  strategyCacheOnly,
} from "@work-bee/core";
import fallbackMiddleware from "@work-bee/fallback";

const fallback = fallbackMiddleware({
  path: "/offline.html",
  statusCodes: [503, 504],
});

const config = compileConfig({
  precache: {
    routes: [{ path: "/offline.html" }],
    strategy: strategyCacheOnly,
  },
  strategy: strategyNetworkOnly,
  middlewares: [fallback],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | — | Path to the fallback resource (should be pre-cached) |
| `pathPattern` | `RegExp` | — | Pattern to match for fallback (alternative to `path`) |
| `statusCodes` | `number[]` | Error responses | HTTP status codes that trigger the fallback |
| `fallbackStrategy` | `Strategy` | `strategyCacheFirst` | Strategy used to fetch the fallback resource |

## Returns

`{ after }`
