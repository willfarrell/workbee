<div align="center">
  <h1>Workbee <code>fallback</code></h1>
  <img alt="workbee logo" src="https://raw.githubusercontent.com/willfarrell/workbee/main/docs/img/workbee-logo.svg"/>
  <p><strong>fallback workbee service worker middleware</strong></p>
<p>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@work-bee/fallback"><img alt="npm version" src="https://img.shields.io/npm/v/@work-bee/fallback.svg"></a>
  <a href="https://packagephobia.com/result?p=@work-bee/fallback"><img src="https://packagephobia.com/badge?p=@work-bee/fallback" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@work-bee/fallback"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@work-bee/fallback.svg"></a>
  <br/>
  <a href="https://scorecard.dev/viewer/?uri=github.com/willfarrell/workbee"><img src="https://api.scorecard.dev/projects/github.com/willfarrell/workbee/badge" alt="Open Source Security Foundation (OpenSSF) Scorecard"></a>
  <a href="https://github.com/willfarrell/workbee/blob/main/CONTRIBUTING.md"><img src="https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg"></a>
  <a href="https://biomejs.dev"><img alt="Checked with Biome" src="https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome"></a>
  <a href="https://conventionalcommits.org"><img alt="Conventional Commits" src="https://img.shields.io/badge/Conventional%20Commits-1.0.0-%23FE5196?logo=conventionalcommits&logoColor=white"></a>
</p>
<p>You can read the documentation at: <a href="https://workbee.js.org">https://workbee.js.org</a></p>
</div>

## Install

```bash
npm install @work-bee/fallback
```

## Usage

```js
import fallbackMiddleware from "@work-bee/fallback";
import { strategyCacheFirst } from "@work-bee/core";

// Serve a precached offline page when a navigation fails.
fallbackMiddleware({
  path: "/offline.html",
  statusCodes: [503, 504],
  fallbackStrategy: strategyCacheFirst, // default
});
```

## Options

`fallbackMiddleware(options?)` returns `{ after }`. The fallback resource is always fetched as a `GET` (the original request's method/body are not copied).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `path` | `string` | — (**required**) | Fallback resource path. Any `{status}` token is replaced with the failed response's status code. Throws if missing or empty. |
| `pathPattern` | `RegExp` | — | When set, the fallback URL is derived from `request.url.replace(pathPattern, path)`, so `path` may reference capture groups (e.g. `$1`). |
| `statusCodes` | `number[]` | — | HTTP status codes that trigger the fallback. With no `statusCodes`, only a thrown/non-`Response` error (e.g. a network failure) falls back — an HTTP error response passes through unless its status is listed. |
| `fallbackStrategy` | `Strategy` | `strategyCacheFirst` | Strategy used to fetch the fallback resource. |

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
