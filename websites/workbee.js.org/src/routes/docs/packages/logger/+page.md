---
title: "@work-bee/logger"
description: Logging middleware for WorkBee.
---

# @work-bee/logger

Middleware that logs ServiceWorker requests and responses for debugging.

## Install

```bash
npm install @work-bee/core @work-bee/logger
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
| `logger` | `(when, request, response, event, config, redactHeaders) => void` | structured formatter (see below) | Custom logging function. `response` is `undefined` in `before` / `beforeNetwork` and may be an `Error` after a failure |
| `redactHeaders` | `string[]` | `["authorization", "cookie", "set-cookie", "proxy-authorization"]` | Lower-case header names whose values the default logger replaces with `"[REDACTED]"`. Passed to a custom `logger` as its 6th argument |
| `runOnBefore` | `boolean` | `true` | Log during the `before` middleware phase |
| `runOnBeforeNetwork` | `boolean` | `true` | Log during the `beforeNetwork` phase |
| `runOnAfterNetwork` | `boolean` | `true` | Log during the `afterNetwork` phase |
| `runOnAfter` | `boolean` | `true` | Log during the `after` phase |

The default logger calls `console.log(when, url, strategyName, details)`, where `details` is `{ url, method, status, statusText, requestHeaders, responseHeaders, strategy }` with the `redactHeaders` values replaced. A custom `logger` gets the raw request and response, so redact there yourself if you log headers.

If `logger` throws, the error goes to `console.error` and the request or response passes through unchanged, so a broken logger can't fail a fetch.

## Returns

`{ before, beforeNetwork, afterNetwork, after }` (each is `false` when disabled)
