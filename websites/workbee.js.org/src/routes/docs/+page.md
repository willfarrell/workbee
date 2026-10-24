---
title: Documentation
description: WorkBee documentation - a tiny ServiceWorker for secure web applications.
---

# WorkBee Documentation

WorkBee is a tiny, modular ServiceWorker library for secure web applications.

## Features

- **Small and modular** - all of core is ~3.7KB minified + brotli (a typical setup with one strategy ~2.4KB); most middleware is 0.1-0.9KB, `@work-bee/offline` ~1.6KB
- **Tree-shaking supported** - only include what you use
- **Zero dependencies** - no third-party dependencies; middleware packages list `@work-bee/core` as a peer dependency
- **GDPR Compliant** - privacy-first design
- **MIT Licensed** - free to use

## Architecture

WorkBee is split into a core package that provides caching strategies and event handling, plus middleware packages that add specific functionality.

### Core

The `@work-bee/core` package provides:

- **Strategies** - NetworkOnly, CacheOnly, NetworkFirst, CacheFirst, StaleWhileRevalidate, StaleIfError, Precache, Ignore, CacheFirstIgnore, Static, Partition, HTMLPartition
- **Events** - install, activate, fetch, background fetch handlers, and `cacheOverrideEvent` for writing cache entries from a page
- **Configuration** - `compileConfig()` for building route configurations

### Middleware

Middleware packages hook into the request/response lifecycle with `before`, `beforeNetwork`, `afterNetwork`, and `after` hooks:

- `@work-bee/cache-control` - Sets the `Cache-Control` header on network responses so network-first strategies store them
- `@work-bee/fallback` - Provides fallback responses
- `@work-bee/inactivity` - Detects user inactivity (timer in the page; the ServiceWorker reports network activity)
- `@work-bee/logger` - Logs requests and responses
- `@work-bee/offline` - Queues requests when offline
- `@work-bee/save-data` - Switches strategy for requests sent with `Save-Data: on`
- `@work-bee/session` - Keeps an auth token in the ServiceWorker and adds it to API requests

### Plugins

- `@work-bee/precache-json` - Extracts a precache route manifest from a JSON response
