# Contributing to WorkBee

Thank you for your interest in contributing to WorkBee!

## Prerequisites

- **Node.js >= 26** is required (see `engines` in package.json); `npm run test:bench` uses the experimental `node:bench` runner added in 26.
- `npm test` also runs the SAST checks, which need these tools on your `PATH`:
  [semgrep](https://semgrep.dev/docs/getting-started/),
  [trufflehog](https://github.com/trufflesecurity/trufflehog),
  [gitleaks](https://github.com/gitleaks/gitleaks),
  [actionlint](https://github.com/rhysd/actionlint),
  [zizmor](https://docs.zizmor.sh/installation/), and
  [trivy](https://trivy.dev/latest/getting-started/installation/)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/willfarrell/workbee.git
cd workbee
```

2. Install dependencies and the git hooks (`.npmrc` sets `ignore-scripts`, so `prepare` doesn't run on install):

```bash
npm install
npm run prepare
```

3. Run tests:

```bash
npm test
```

## Project Structure

WorkBee is a monorepo managed with [npm workspaces](https://docs.npmjs.com/cli/using-npm/workspaces):

- `packages/core` — Core library with strategies, events, and configuration
- `packages/cache-control` — Cache-Control header middleware
- `packages/fallback` — Fallback response middleware
- `packages/inactivity` — User inactivity detection middleware
- `packages/logger` — Logging middleware
- `packages/offline` — Offline request queueing middleware
- `packages/precache-json` — JSON precache manifest extractor
- `packages/save-data` — Save-Data header middleware
- `packages/session` — Session management middleware
- `websites/workbee.js.org` — Documentation website

## Making Changes

1. Create a branch from `develop`
2. Make your changes
3. Ensure tests pass: `npm test`
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/) format
5. Open a pull request

## Commit Messages

This project uses [commitlint](https://commitlint.js.org/) to enforce commit message format:

```
type(scope): description
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`

## Code Style

This project uses [Biome](https://biomejs.dev/) for formatting and linting. Run:

```bash
npx biome check .
```

## Pre-commit hook

Husky runs `npm run git:pre-commit` on every commit, which:

1. `npm run git:lint-staged` — Biome lint on staged files
2. `npm run git:test-staged` — runs every `packages/**/*.test.js` with `node --test`

The package-wide test step currently runs across every package, so a commit can
take several seconds even when only docs change. Use `git commit --no-verify`
only when you are certain the change is hooks-irrelevant (docs, CI-only
changes) — CI still enforces the full suite on every PR.

## Developer Certificate of Origin (DCO)

This project requires a [DCO sign-off](https://developercertificate.org/) on all commits. Add `-s` to your commit command:

```bash
git commit -s -m "feat: add new feature"
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
