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
  // Bump the version on each release. `purgePrefixes` lets activate delete
  // caches left by older versions (e.g. "sw-1-img" once "sw-2-" is live).
  cachePrefix: "sw-1-",
  activate: { purgePrefixes: ["sw-"] },
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

Middleware packages list `@work-bee/core` as a peer dependency, so keep `@work-bee/core` installed next to them.

```js
import { compileConfig, strategyNetworkOnly } from "@work-bee/core";
import fallbackMiddleware from "@work-bee/fallback";

const fallback = fallbackMiddleware({ path: "/offline.html" });

const config = compileConfig({
  // Fetched and stored during install
  precache: {
    routes: [{ path: "/offline.html" }],
  },
  strategy: strategyNetworkOnly,
  middlewares: [fallback],
});
```

When a request fails with a network error, the fallback middleware serves `/offline.html` from the cache.
