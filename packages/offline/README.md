<div align="center">
  <h1>Workbee <code>offline</code></h1>
  <img alt="workbee logo" src="https://raw.githubusercontent.com/willfarrell/workbee/main/docs/img/workbee-logo.svg"/>
  <p><strong>offline workbee service worker middleware</strong></p>
<p>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@work-bee/offline"><img alt="npm version" src="https://img.shields.io/npm/v/@work-bee/offline.svg"></a>
  <a href="https://packagephobia.com/result?p=@work-bee/offline"><img src="https://packagephobia.com/badge?p=@work-bee/offline" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@work-bee/offline"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@work-bee/offline.svg"></a>
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
npm install @work-bee/offline
```

## Data & Privacy

The offline middleware queues failed requests in IndexedDB for replay when connectivity returns. Understanding what is stored is important for privacy compliance.

**What is stored:** The full request (method, URL, headers, body) is serialized to IndexedDB. Headers listed in `redactHeaders` (defaults to `["authorization"]`) are stripped before storage — session middleware re-adds credentials on retry.

**Why:** Requests must be stored faithfully so they can be replayed without data loss when the network is available again.

**Retention:** Queued requests persist in IndexedDB until they are successfully replayed or the user clears browser data.

**Developer responsibility:**
- Use the `redactHeaders` option to control which headers are stripped before storage (defaults to `["authorization"]`)
- Use the `methods` option to limit which HTTP methods are queued (defaults to POST, PUT, PATCH, DELETE)
- Avoid queuing routes that carry highly sensitive data in the request body if persistence is not acceptable
- Consider calling `indexedDB.deleteDatabase('sw')` on user logout to clear any queued requests

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
