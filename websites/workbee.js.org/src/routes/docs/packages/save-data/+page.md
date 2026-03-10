---
title: "@work-bee/save-data"
description: Save-Data header middleware for WorkBee.
---

# @work-bee/save-data

Middleware that adjusts caching strategy based on the `Save-Data` request header.

## Install

```bash
npm install @work-bee/save-data
```

## Usage

```js
import {
  compileConfig,
  strategyCacheFirst,
  strategyCacheOnly,
} from "@work-bee/core";
import saveDataMiddleware from "@work-bee/save-data";

const saveData = saveDataMiddleware({
  saveDataStrategy: strategyCacheOnly,
});

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [saveData],
});
```

## Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `saveDataStrategy` | `Strategy` | Yes | The strategy to use when `Save-Data: on` header is present |

## Returns

`{ before }`

## Behavior

When the `Save-Data: on` header is present, the middleware can switch to a more cache-heavy strategy to reduce network usage.
