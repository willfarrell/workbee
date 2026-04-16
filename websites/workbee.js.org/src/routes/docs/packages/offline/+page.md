---
title: "@work-bee/offline"
description: Offline request queueing middleware for WorkBee.
---

# @work-bee/offline

Middleware that queues failed requests when offline and replays them when connectivity returns.

## Install

```bash
npm install @work-bee/offline
```

## Usage

### ServiceWorker

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";
import offlineMiddleware from "@work-bee/offline";

const offline = offlineMiddleware({ pollDelay: 0 });

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [offline],
});

addEventListener("message", (event) => {
  const { data } = event;
  event.waitUntil(messageEvents[data.type](data));
});

const messageEvents = {
  online: offline.postMessageEvent,
};
```

### Client

When the browser comes back online, notify the ServiceWorker:

```js
navigator.serviceWorker.controller.postMessage({ type: "online" });
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `methods` | `string[]` | — | HTTP methods to queue when offline |
| `statusCodes` | `number[]` | — | Status codes that indicate offline state |
| `pollDelay` | `number` | — | Delay in ms between retry polls (0 to disable) |
| `postMessage` | `(message) => Promise<void>` | `postMessageToAll` | Function to send messages to clients |
| `enqueueEventType` | `string` | — | Event type posted when a request is enqueued |
| `quotaExceededEventType` | `string` | — | Event type posted when IndexedDB quota exceeded |
| `dequeueEventType` | `string` | — | Event type posted when requests are dequeued |
| `objectStoreName` | `string` | — | IndexedDB object store name |

## Returns

`{ afterNetwork, postMessageEvent }`

## Utility Exports

```js
import { idbSerializeRequest, idbDeserializeRequest } from "@work-bee/offline";
```

- `idbSerializeRequest(request)` — Serializes a Request for IndexedDB storage
- `idbDeserializeRequest(data)` — Deserializes stored data back into a Request

## Client Integration

```js
import initOfflineClient from "@work-bee/offline/client.js";

const cleanup = initOfflineClient();

// Call cleanup() to remove the event listener when no longer needed
// cleanup();
```

This listens for the browser's `online` event and posts `{ type: "online" }` to the ServiceWorker when connectivity returns. The returned function removes the listener.
