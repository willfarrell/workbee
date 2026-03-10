<div align="center">
  <h1>Workbee <code>core</code></h1>
  <img alt="workbee logo" src="https://raw.githubusercontent.com/willfarrell/workbee/main/docs/img/workbee-logo.svg"/>
  <p><strong>Core component of the workbee framework, the tiny ServiceWorker for secure web applications</strong></p>
<p>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@work-bee/core"><img alt="npm version" src="https://img.shields.io/npm/v/@work-bee/core.svg"></a>
  <a href="https://packagephobia.com/result?p=@work-bee/core"><img src="https://packagephobia.com/badge?p=@work-bee/core" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@work-bee/core"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@work-bee/core.svg"></a>
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
npm install @work-bee/core
```

## Data & Privacy

The core module uses the Cache API to store HTTP responses for performance. Understanding what is cached is important for privacy compliance.

**What is stored:** Full HTTP responses, which may contain user-specific data depending on the API.

**Retention:** Controlled by `Cache-Control` response headers and the `cacheControlMaxAge` config option.

**Cleanup:**
- Call `cachesDelete()` on user logout to clear cached data for authenticated routes
- Call `cachesDeleteExpired()` periodically to remove stale cache entries
- Users can manually purge via browser DevTools > Application > Storage > Clear site data

**Developer responsibility:**
- Be aware that cached responses for authenticated endpoints may contain user-specific data
- Use appropriate `Cache-Control` headers to limit retention of sensitive responses
- Implement logout cleanup by calling `cachesDelete()` when the user's session ends

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
