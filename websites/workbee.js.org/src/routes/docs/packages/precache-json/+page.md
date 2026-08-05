---
title: "@work-bee/precache-json"
description: JSON precache manifest extractor for WorkBee.
---

# @work-bee/precache-json

Extracts a precache route manifest from a JSON response, for use as
`precache.extract` in `@work-bee/core`.

`@work-bee/core` deliberately ships no default extractor: the shape of a route
manifest is an application concern, so parsing it is a plugin rather than
something baked into the core bundle. When `precache.routes` is a URL, core
requires an explicit `extract`.

## Install

```bash
npm install @work-bee/precache-json
```

## Usage

```js
import { compileConfig, eventInstall, strategyCacheFirst } from "@work-bee/core";
import { precacheExtractJSON } from "@work-bee/precache-json";

const config = compileConfig({
  precache: {
    routes: "/precache.json",
    extract: precacheExtractJSON,
  },
  strategy: strategyCacheFirst,
});

addEventListener("install", (event) => {
  eventInstall(event, config);
});
```

Where `/precache.json` serves an array of routes:

```json
[{ "path": "/index.html" }, { "path": "/app.css" }, { "path": "/app.js" }]
```

Entries may be plain strings or route objects; both are compiled through the
same route pipeline as inline `precache.routes`.

## Behaviour

`precacheExtractJSON(response)` returns `Promise<Route[]>`.

| Response | Result |
|----------|--------|
| `Content-Type: application/json` (any parameters, e.g. `; charset=utf-8`) with an array body | the parsed array |
| Any other `Content-Type`, or no `Content-Type` | `[]` — nothing is precached |
| `application/json` with a non-array body | throws `TypeError` naming the received type |

The media type is matched by prefix on the type/subtype only, after trimming
and lowercasing, so `application/json5` also matches.

## Writing your own

`extract` is any `(response) => Route[] | Promise<Route[]>`. To read a manifest
in another format, pass your own:

```js
const config = compileConfig({
  precache: {
    routes: "/precache.txt",
    extract: async (response) =>
      (await response.text()).split("\n").filter(Boolean),
  },
});
```

## License

Licensed under [MIT License](https://github.com/willfarrell/workbee/blob/main/LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
