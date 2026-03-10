---
title: Documentation
description: WorkBee documentation - a tiny ServiceWorker for secure web applications.
---

# WorkBee Documentation

WorkBee is a tiny, modular ServiceWorker library for secure web applications.

## Features

- **Small and modular** - up to 1KB minified + brotli
- **Tree-shaking supported** - only include what you use
- **Zero dependencies** - no external dependencies
- **GDPR Compliant** - privacy-first design
- **MIT Licensed** - free to use

## Architecture

WorkBee is split into a core package that provides caching strategies and event handling, plus middleware packages that add specific functionality.

### Core

The `@work-bee/core` package provides:

- **Strategies** - CacheFirst, CacheOnly, NetworkFirst, NetworkOnly, StaleWhileRevalidate, Partition, HTMLPartition
- **Events** - install, activate, fetch event handlers
- **Configuration** - `compileConfig()` for building route configurations

### Middleware

Middleware packages hook into the request/response lifecycle with `before`, `beforeNetwork`, `afterNetwork`, and `after` hooks:

- `@work-bee/cache-control` - Respects HTTP Cache-Control headers
- `@work-bee/fallback` - Provides fallback responses
- `@work-bee/inactivity` - Detects user inactivity
- `@work-bee/logger` - Logs requests and responses
- `@work-bee/offline` - Queues requests when offline
- `@work-bee/save-data` - Respects the Save-Data header
- `@work-bee/session` - Session management
