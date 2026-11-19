# CORE Papers Explorer

Author: Kpono Akpabio, assisted by Claude Code

Live demo: https://kingkpono2.github.io/core-papers-explorer/

A small Angular app for searching open-access research papers through the
[CORE API v3](https://api.core.ac.uk/docs/v3). It lists matching papers, lets you choose how many
are returned, supports boolean keyword queries such as `(drone AND (package OR delivery))`, and
charts how all matching papers are distributed over time.

> Status: work in progress. See the [roadmap](#roadmap) for what is done.

## Features

- Keyword search against CORE, including boolean queries
- Paper cards with title, authors, year, journal or publisher, document type, language, citation
  count and a collapsible abstract, plus links to the DOI, the full-text PDF and the CORE page
- Loading skeletons, a "search to begin" screen with example queries, a no-results screen and
  error messages with a retry button (with specific wording when CORE rate-limits the app)
- Responsive layout from phone to desktop, keyboard friendly, with screen reader announcements for
  result counts and focus moved to the results after each search
- Retries with backoff on rate limits and transient failures, and a 15 second timeout per request

## Tech stack

- Angular 20 (standalone components, signals, zoneless change detection, built-in control flow)
- TypeScript 5.9 in strict mode, with strict template checking
- SCSS with CSS custom properties, no UI library
- Karma + Jasmine for unit tests, running in headless Chrome
- ESLint (angular-eslint, typescript-eslint) and Prettier
- GitHub Actions for CI

## Prerequisites

- Node.js 20.19+ or 22.12+ (22 LTS recommended, see `.nvmrc`)
- npm 10+
- Chrome or Chromium for running unit tests

## Getting started

```bash
npm install
npm start
```

Then open http://localhost:4200.

## Commands

| Command                     | What it does                                         |
| --------------------------- | ---------------------------------------------------- |
| `npm start`                 | Dev server on http://localhost:4200 with live reload |
| `npm run start:local`       | Dev server using your local API key (see below)      |
| `npm run build`             | Production build into `dist/core-papers-explorer`    |
| `npm test -- --watch=false` | Run unit tests once in headless Chrome               |
| `npm test`                  | Run unit tests in watch mode                         |
| `npm run lint`              | Lint TypeScript and templates                        |
| `npm run format`            | Format the codebase with Prettier                    |
| `npm run format:check`      | Check formatting without writing (used in CI)        |

Tests launch headless Chrome by default. If Karma cannot find a browser, point it at one:

```bash
CHROME_BIN=/path/to/chrome npm test -- --watch=false
```

## CORE API key (optional)

The CORE API works without a key at a lower rate limit. To use your own
[free API key](https://core.ac.uk/services/api):

```bash
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
# edit environment.local.ts and paste your key into coreApiKey
npm run start:local
```

`environment.local.ts` is gitignored, so the key never ends up in the repository. Note that any key
used by a browser app is visible to its users; for a public deployment the key should sit behind a
small server-side proxy instead.

When a key is set, an HTTP interceptor sends it as `Authorization: Bearer <key>`, and only on
requests to the CORE API base URL.

## Rate limits

Anonymous access allows about 10 requests per rate-limit window. When CORE answers `429 Too Many
Requests`, or a request fails with a 5xx or network error, the client retries up to three times
with exponential backoff (1 s, 2 s, 4 s), spending at most 10 seconds waiting. If the server says
to wait longer than that, the app stops and shows a message instead. Each attempt times out after
15 seconds. Using an API key raises the limit.

## Project structure

```
src/
  app/
    core/              app-wide singletons
      api/             CoreApiService, retry policy, error model, API config token
      interceptors/    adds the optional API key to CORE requests
      layout/          site header and footer
      models/          raw CORE API types, the app's Paper model and the mapper between them
    features/
      search/          the search page (lazy loaded)
    shared/
      ui/              presentational components: paper card, skeleton, empty and error states
    app.config.ts      application providers
    app.routes.ts      routes
  environments/        build-time configuration, including the optional API key
  testing/             test fixtures shared between specs
docs/
  WALKTHROUGH.md       design decisions and notes, phase by phase
```

## How I built this

Built with Claude Code as an AI pair-programmer; I reviewed, tested and understand every change.
Design decisions are explained in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## Roadmap

- [x] 1. Project setup: Angular 20, strict mode, lint, format, CI, app shell
- [x] 2. CORE API layer: typed models, service, timeouts, retry with backoff on 429, error handling
- [x] 3. Paper cards with loading, empty and error states; responsive and accessible
- [ ] 4. Results-per-page control, pagination and state in the URL
- [ ] 5. Boolean keyword search with validation, help and search history
- [ ] 6. Chart of papers per year across all matching results
- [ ] 7. Extras: response cache, CSV/BibTeX export, dark mode
