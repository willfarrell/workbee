---
title: "@work-bee/offline"
description: Offline request queueing middleware for WorkBee.
---

# @work-bee/offline

Middleware that queues failed requests when offline and replays them when connectivity returns.

When a request with a queued method (`POST`, `PUT`, `PATCH`, `DELETE` by default) fails with a network error or a `503` / `504`, it is saved to IndexedDB. The page gets a synthetic `202 Accepted` only after the save succeeds. If IndexedDB can't store it (for example the quota is full), the page gets the original response or error instead. Queued requests are replayed in order when the page reports it is online (`postMessageEvent()`), and by a timer every `pollDelay` ms while the queue is non-empty (polling stops once it drains and restarts on the next enqueue). A queue left over from an earlier ServiceWorker run is picked up when the middleware starts. The timer does not survive the browser stopping an idle ServiceWorker, so wire the offline client to replay on reconnect.

## Install

```bash
npm install @work-bee/core @work-bee/offline
```

## Usage

### ServiceWorker

```js
import { compileConfig, strategyNetworkOnly } from "@work-bee/core";
import offlineMiddleware from "@work-bee/offline";

const offline = offlineMiddleware({ pollDelay: 0 });

const config = compileConfig({
  strategy: strategyNetworkOnly,
  middlewares: [offline],
});

// Sent by @work-bee/offline/client when the browser comes back online
addEventListener("message", (event) => {
  if (event.data?.type === "online") {
    event.waitUntil(offline.postMessageEvent());
  }
});
```

### Page

```js
import initOfflineClient from "@work-bee/offline/client";

const cleanup = initOfflineClient();

// Call cleanup() to remove the event listener when no longer needed
// cleanup();
```

This listens for the browser's `online` event and posts `{ type: "online" }` to the ServiceWorker when connectivity returns. The returned function removes the listener.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `methods` | `string[]` | `["POST", "PUT", "PATCH", "DELETE"]` | HTTP methods to queue |
| `statusCodes` | `number[]` | `[503, 504]` | Response statuses that queue the request (network errors always do). On replay, these statuses leave the request queued for the next try |
| `pollDelay` | `number` | `60000` | Delay in ms before retrying the queue (`0` disables polling; replay then only happens on `postMessageEvent()`) |
| `postMessage` | `(message) => Promise<void>` | `postMessageToFocused` | Function to send messages to clients |
| `enqueueEventType` | `string` | — | Message type posted when a request is queued |
| `dequeueEventType` | `string` | — | Message type posted when a queued request is replayed successfully |
| `failedEventType` | `string` | — | Message type posted when a queued request is dropped: the replay got a status that isn't 2xx, a redirect, or in `statusCodes`, or the stored request can't be rebuilt |
| `quotaExceededEventType` | `string` | — | Message type posted when IndexedDB quota is exceeded (the request is not queued) |
| `databaseName` | `string` | `"sw"` for the default store, otherwise `` `sw-${objectStoreName}` `` | IndexedDB database name |
| `objectStoreName` | `string` | `"offline"` | IndexedDB object store name. Give each queue its own store |
| `redactHeaders` | `string[]` | `["authorization", "cookie", "set-cookie", "proxy-authorization"]` | Headers removed before a request is stored |

Enqueue, dequeue and failed messages are `{ type, method, url, headers, ... }` (the stored request without its body).

## Returns

`{ beforeNetwork, afterNetwork, postMessageEvent, destroy, clear }`

- `postMessageEvent()` — replays the queue now (if `navigator.onLine`)
- `destroy()` — stops polling and closes the database
- `clear()` — deletes every queued request and stops polling. Call `offline.clear()` on logout

## Notes

- The middleware hooks run only when the strategy hits the network (see [Middleware Lifecycle](/docs/packages/core#middleware-lifecycle)); use a network strategy for these routes.
- An identical request queued twice in a row is stored once.
- Request bodies are stored in IndexedDB unencrypted. Don't queue routes whose bodies hold sensitive data.
- Headers in `redactHeaders` are removed before storing and are not added back, so queued requests replay **without an `Authorization` header** (for example the token added by `@work-bee/session`). Routes that need a bearer token will fail on replay and be dropped.
- Cookies are not stored, but the browser attaches the cookies that are current **at replay time** (per the request's `credentials` mode). A request queued by one user can replay in the next user's session, so call `offline.clear()` on logout.
- Queued `navigate`-mode requests (HTML form posts) are replayed with `mode: "same-origin"`. A redirect after the replayed form post (status 0, `opaqueredirect`) counts as success.

## Utility Exports

```js
import { idbSerializeRequest, idbDeserializeRequest } from "@work-bee/offline";
```

- `idbSerializeRequest(request)` — Serializes a Request for IndexedDB storage
- `idbDeserializeRequest(data)` — Deserializes stored data back into a Request
