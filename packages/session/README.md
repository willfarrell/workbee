<div align="center">
  <h1>Workbee <code>session</code></h1>
  <img alt="workbee logo" src="https://raw.githubusercontent.com/willfarrell/workbee/main/docs/img/workbee-logo.svg"/>
  <p><strong>session workbee service worker middleware</strong></p>
<p>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@work-bee/session"><img alt="npm version" src="https://img.shields.io/npm/v/@work-bee/session.svg"></a>
  <a href="https://packagephobia.com/result?p=@work-bee/session"><img src="https://packagephobia.com/badge?p=@work-bee/session" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@work-bee/session"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@work-bee/session.svg"></a>
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
npm install @work-bee/session
```

## Session lifecycle & SW termination

The session token is held in the service worker's in-memory state only. Browsers
terminate idle service workers aggressively (typically after ~30 seconds of
inactivity, or across SW updates), and on restart the middleware starts with no
token. This affects applications that rely on the SW to inject `Authorization`
on every request:

- After SW termination, subsequent requests go out unauthenticated until the
  user re-authenticates or the client replays an auth call that matches
  `authnPathPattern`.
- Timers for inactivity / session expiry are also reset on restart; the hard
  session timeout effectively resumes from the next successful auth response.
- If you need session continuity across SW restarts, persist the token yourself
  on `afterNetwork` (e.g. into a dedicated Cache Storage entry) and restore it
  before the first `before` call runs.

The middleware deliberately never writes tokens to IndexedDB or Cache Storage
by default — doing so turns a short-lived credential into one that survives
device restarts, which changes the risk profile.

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
