<div align="center">
  <h1>Workbee <code>inactivity</code></h1>
  <img alt="workbee logo" src="https://raw.githubusercontent.com/willfarrell/workbee/main/docs/img/workbee-logo.svg"/>
  <p><strong>inactivity workbee service worker middleware</strong></p>
<p>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-unit.yml/badge.svg" alt="GitHub Actions unit test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-sast.yml/badge.svg" alt="GitHub Actions SAST test status"></a>
  <a href="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml"><img src="https://github.com/willfarrell/workbee/actions/workflows/test-lint.yml/badge.svg" alt="GitHub Actions lint test status"></a>
  <br/>
  <a href="https://www.npmjs.com/package/@work-bee/inactivity"><img alt="npm version" src="https://img.shields.io/npm/v/@work-bee/inactivity.svg"></a>
  <a href="https://packagephobia.com/result?p=@work-bee/inactivity"><img src="https://packagephobia.com/badge?p=@work-bee/inactivity" alt="npm install size"></a>
  <a href="https://www.npmjs.com/package/@work-bee/inactivity"><img alt="npm weekly downloads" src="https://img.shields.io/npm/dw/@work-bee/inactivity.svg"></a>
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
npm install @work-bee/inactivity
```

## Usage

```js
// service worker
import inactivityMiddleware from "@work-bee/inactivity";

const inactivity = inactivityMiddleware({
  inactivityAllowedInMin: 15,
  inactivityEvent: () => postMessageToFocused({ type: "inactive" }),
});

// Reset the timer when the page reports activity.
addEventListener("message", (event) => {
  if (event.data?.type === "inactivity") inactivity.postMessageEvent();
});
```

```js
// page — companion client posts `{ type: "inactivity" }` on DOM activity
import registerInactivity from "@work-bee/inactivity/client";
const unregister = registerInactivity();
```

## Options

`inactivityMiddleware(options?)` returns `{ before, after, postMessageEvent }`. The timer only fires while no requests are in flight; `postMessageEvent()` resets it (wire it to an activity message from the page).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `inactivityAllowedInMin` | `number` | `15` | Minutes without activity (no in-flight requests / activity messages) before `inactivityEvent` fires. |
| `inactivityEvent` | `() => void` | warns to console | Called once the inactivity window elapses. Typically posts a message to the page. |

## License

Licensed under [MIT License](LICENSE). Copyright (c) 2026 [will Farrell](https://github.com/willfarrell) and the [Workbee contributors](https://github.com/willfarrell/workbee/graphs/contributors).
