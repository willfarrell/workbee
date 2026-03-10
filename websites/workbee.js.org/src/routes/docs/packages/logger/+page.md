---
title: "@work-bee/logger"
description: Logging middleware for WorkBee.
---

# @work-bee/logger

Middleware that logs ServiceWorker requests and responses for debugging.

## Install

```bash
npm install @work-bee/logger
```

## Usage

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";
import loggerMiddleware from "@work-bee/logger";

const logger = loggerMiddleware();

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [logger],
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `logger` | `(when, request, response, event, config) => void` | `console.log` | Custom logging function |
| `runOnBefore` | `boolean` | `true` | Log during the `before` middleware phase |
| `runOnBeforeNetwork` | `boolean` | `true` | Log during the `beforeNetwork` phase |
| `runOnAfterNetwork` | `boolean` | `true` | Log during the `afterNetwork` phase |
| `runOnAfter` | `boolean` | `true` | Log during the `after` phase |

## Returns

`{ before, beforeNetwork, afterNetwork, after }` (each is `false` when disabled)
