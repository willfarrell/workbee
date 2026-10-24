---
title: "@work-bee/inactivity"
description: User inactivity detection middleware for WorkBee.
---

# @work-bee/inactivity

Detects when the user has been inactive for a set time, for example to log them out or show a "still there?" prompt.

The countdown runs in the page, not the ServiceWorker. Browsers stop an idle ServiceWorker after about 30 seconds, which cancels any timer it set, so a ServiceWorker timer can't measure minutes of inactivity. The package has two parts:

- `@work-bee/inactivity/client` runs in the page. It counts DOM events (key presses, pointer and touch input, scrolling, page visibility changes) as activity and calls `inactivityEvent` when there has been none for `inactivityAllowedInMin` minutes.
- `@work-bee/inactivity` is ServiceWorker middleware. It posts `{ type: "inactivity-activity" }` to the pages when a request starts and when it finishes (at most once per second), so network activity, such as polling or a long upload, also resets the countdown.

## Install

```bash
npm install @work-bee/core @work-bee/inactivity
```

## Usage

### Page

```js
import inactivityClient from "@work-bee/inactivity/client";

const cleanup = inactivityClient({
  inactivityAllowedInMin: 30,
  inactivityEvent: () => {
    window.location.assign("/logout");
  },
});

// Call cleanup() to stop the timer and remove all listeners
```

### ServiceWorker

```js
import { compileConfig, strategyNetworkFirst } from "@work-bee/core";
import inactivityMiddleware from "@work-bee/inactivity";

const config = compileConfig({
  strategy: strategyNetworkFirst,
  middlewares: [inactivityMiddleware()],
});
```

The middleware is optional: without it, only DOM activity counts.

## Client Options

`inactivityClient(options)` returns a cleanup function.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inactivityAllowedInMin` | `number` | `15` | Minutes without activity before `inactivityEvent` runs |
| `inactivityEvent` | `() => void` | logs a warning | Called once when the limit is reached. Activity afterwards starts a new countdown |
| `events` | `string[]` | `["load", "keydown", "mousedown", "mousemove", "scroll", "touchmove", "touchstart", "visibilitychange", "wheel"]` | DOM events (listened for on `document`) that count as activity |

## Middleware Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `postMessage` | `(message) => Promise<void>` | `postMessageToAll` | Sends `{ type: "inactivity-activity" }` to pages |

Returns `{ before, after }`.

## Notes

- Each tab runs its own countdown. DOM activity is shared with the other tabs over a `BroadcastChannel` (at most once a second), and with the default `postMessageToAll` network activity from any tab resets every tab's countdown, so a user active in one tab is not timed out in another.
- The countdown starts when `inactivityClient` is called.
