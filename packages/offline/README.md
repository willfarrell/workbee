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

**What is stored:** The full request (method, URL, headers, body) is serialized to IndexedDB. Headers listed in `redactHeaders` (defaults to `["authorization", "cookie", "set-cookie", "proxy-authorization"]`) are stripped before storage.

**Replays are unauthenticated:** Because the credential headers above are stripped before the request is persisted, queued requests are replayed **without** their original authentication — the queue does not re-inject session credentials on retry. Routes that require authentication should not rely on the offline queue; a replayed request will reach the server stripped of its auth headers (and is likely to be rejected). Use the queue only for endpoints that accept the replayed request on its own (e.g. cookie-bound same-origin requests where the browser re-attaches the cookie, or routes that do not require per-request credentials).

**Why:** Requests must be stored faithfully so they can be replayed without data loss when the network is available again.

**Retention:** Queued requests persist in IndexedDB until they are successfully replayed, evicted as a permanent failure (see below), or the user clears browser data.

**Permanent failures are evicted, not retried forever:** When a queued request is replayed, the response decides its fate. A `2xx` is dequeued. A retryable status (any code in `statusCodes`, default `503`/`504`) is left queued and retried on the next poll. Any other non-`2xx` (e.g. a `4xx` or `410`) is treated as a permanent failure and **evicted** from the queue — otherwise a request the server will never accept would wedge the head of the queue and block every entry behind it forever. So that the eviction does not silently lose data, set the `failedEventType` option to a string: the middleware then `postMessage`s an event of that type carrying the entry metadata (method, URL, redacted headers — the body is stripped, exactly like the enqueue/dequeue events) whenever a request is evicted. A fetch that throws (a transient network error with no response) keeps the entry queued for a later retry.

**Developer responsibility:**
- Use the `redactHeaders` option to control which headers are stripped before storage (defaults to `["authorization", "cookie", "set-cookie", "proxy-authorization"]`)
- Use the `methods` option to limit which HTTP methods are queued (defaults to POST, PUT, PATCH, DELETE)
- Set the `failedEventType` option and listen for it on the client so permanently-failing (evicted) requests can be reported to the user instead of being dropped unnoticed
- Avoid queuing routes that carry highly sensitive data in the request body if persistence is not acceptable
- Consider calling `indexedDB.deleteDatabase('sw')` on user logout to clear any queued requests

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
