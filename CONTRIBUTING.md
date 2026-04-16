# Contributing to WorkBee

Thank you for your interest in contributing to WorkBee!

## Prerequisites

- **Node.js >= 24** is required (see `engines` in package.json)

## Development Setup

1. Clone the repository:

```bash
git clone https://github.com/willfarrell/workbee.git
cd workbee
```

2. Install dependencies:

```bash
npm install
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
- `packages/save-data` — Save-Data header middleware
- `packages/session` — Session management middleware
- `websites/workbee.js.org` — Documentation website

## Making Changes

1. Create a branch from `main`
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

## Developer Certificate of Origin (DCO)

This project requires a [DCO sign-off](https://developercertificate.org/) on all commits. Add `-s` to your commit command:

```bash
git commit -s -m "feat: add new feature"
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
