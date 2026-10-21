---
title: "@work-bee/save-data"
description: Save-Data header middleware for WorkBee.
---

# @work-bee/save-data

Middleware that adjusts caching strategy based on the `Save-Data` request header.

## Install

```bash
npm install @work-bee/core @work-bee/save-data
```

## Usage

```js
import { compileConfig, strategyNetworkFirst } from "@work-bee/core";
import saveDataMiddleware from "@work-bee/save-data";

// Serve from cache only when the user asked to save data
const saveData = saveDataMiddleware();

const config = compileConfig({
  strategy: strategyNetworkFirst,
  middlewares: [saveData],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `saveDataStrategy` | `Strategy` | `strategyCacheOnly` | The strategy to use when the request has `Save-Data: on` |

## Returns

`{ before }`

## Behavior

When a `GET` or `HEAD` request has the `Save-Data: on` header, the middleware swaps the route's strategy for `saveDataStrategy` for that request only. Other requests, including a `POST` with `Save-Data: on`, use the route's normal strategy. With the default `strategyCacheOnly`, an uncached resource fails instead of being fetched; pass `strategyCacheFirst` if you want a network fallback.

Only Chromium browsers (Chrome, Edge, Opera) send `Save-Data`, and only when the user has turned on a data-saving setting. Elsewhere the middleware does nothing.
