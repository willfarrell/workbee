---
title: Quick Start
description: Get started with WorkBee in minutes.
---

# Quick Start

## Install

```bash
npm install @work-bee/core
```

## Basic Setup

Create a `sw.js` file for your ServiceWorker:

```js
import {
  compileConfig,
  eventInstall,
  eventActivate,
  eventFetch,
  strategyCacheFirst
} from "@work-bee/core";

const config = compileConfig({
  cachePrefix: "sw-",
  routes: [
    {
      methods: ["GET"],
      pathPattern: new RegExp("/img/(.+)$"),
      cacheName: "img",
      strategy: strategyCacheFirst,
    },
  ],
});

addEventListener("install", (event) => {
  eventInstall(event, config);
});

addEventListener("activate", (event) => {
  eventActivate(event, config);
});

addEventListener("fetch", (event) => {
  eventFetch(event, config);
});
```

## Register the ServiceWorker

In your main application code:

```js
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js");
}
```

## Adding Middleware

Install a middleware package and add it to your config:

```bash
npm install @work-bee/fallback
```

```js
import { strategyNetworkOnly, strategyCacheOnly } from "@work-bee/core";
import fallbackMiddleware from "@work-bee/fallback";

const fallback = fallbackMiddleware({ path: "/offline.html" });

const config = compileConfig({
  precache: {
    routes: [{ path: "/offline.html" }],
    strategy: strategyCacheOnly,
  },
  strategy: strategyNetworkOnly,
  middlewares: [fallback],
});
```
