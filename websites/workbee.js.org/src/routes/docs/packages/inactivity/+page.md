---
title: "@work-bee/inactivity"
description: User inactivity detection middleware for WorkBee.
---

# @work-bee/inactivity

Middleware that detects user inactivity and can trigger actions like cache cleanup.

## Install

```bash
npm install @work-bee/inactivity
```

## Usage

```js
import { compileConfig, strategyCacheFirst } from "@work-bee/core";
import inactivityMiddleware from "@work-bee/inactivity";

const inactivity = inactivityMiddleware({
  inactivityAllowedInMin: 30,
});

const config = compileConfig({
  strategy: strategyCacheFirst,
  middlewares: [inactivity],
});

addEventListener("message", (event) => {
  const { data } = event;
  if (data.type === "inactivity") {
    inactivity.postMessageEvent();
  }
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inactivityAllowedInMin` | `number` | — | Minutes of inactivity before triggering the event |
| `inactivityEvent` | `() => void` | — | Callback fired when inactivity threshold is reached |

## Returns

`{ before, after, postMessageEvent }`

## Client Integration

Import and initialize the client-side script to send activity events to the ServiceWorker:

```js
import initInactivityClient from "@work-bee/inactivity/client.js";

// Use default events (keypress, mousedown, mousemove, scroll, touch, etc.)
initInactivityClient();

// Or specify custom events
initInactivityClient(["keypress", "mousedown", "scroll"]);
```

This listens for user interaction events and posts `{ type: "inactivity" }` messages to the ServiceWorker.
