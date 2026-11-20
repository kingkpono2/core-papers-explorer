# CORE Papers Explorer

Author: Kpono Akpabio, assisted by Claude Code

Live demo: https://core-papers-explorer.vercel.app

A small Angular app for searching open-access research papers through the
[CORE API v3](https://api.core.ac.uk/docs/v3). It lists matching papers, lets you choose how many
are returned, supports boolean keyword queries such as `(drone AND (package OR delivery))`, and
charts how all matching papers are distributed over time.

> Status: work in progress. See the [roadmap](#roadmap) for what is done.

## Features

- Keyword search against CORE, including boolean queries
- A results-per-page choice (10, 25, 50 or 100), remembered for the next visit
- Pagination with Previous/Next and page numbers ("Showing 26–50 of 71,213"), compact on phones
- The query, page and page size live in the URL, so searches can be bookmarked and shared and the
  browser's Back and Forward buttons step through them
- Paper cards with title, authors, year, journal or publisher, document type, language, citation
  count and a collapsible abstract, plus links to the DOI, the full-text PDF and the CORE page
- Loading skeletons, a "search to begin" screen with example queries, a no-results screen and
  error messages with a retry button (with specific wording when CORE rate-limits the app)
- Responsive layout from phone to desktop, keyboard friendly, with screen reader announcements for
  result counts and focus moved to the results after each search
- Retries with backoff on rate limits and transient failures, and a 30 second timeout per request
- One request per user action; repeated or cosmetic URL changes never trigger a second search

CORE serves at most 100 results per request and only the first 10,000 results of any search, so
pagination stops at the 10,000th result and says so.

## Tech stack

- Angular 20 (standalone components, signals, zoneless change detection, built-in control flow)
- TypeScript 5.9 in strict mode, with strict template checking
- SCSS with CSS custom properties, no UI library
- Karma + Jasmine for unit tests, running in headless Chrome
- ESLint (angular-eslint, typescript-eslint) and Prettier
- Node's built-in test runner for the serverless function
- GitHub Actions for CI, Vercel for hosting and one Node.js serverless function in front of CORE

## Prerequisites

- Node.js 20.19+ or 22.12+ (22 LTS recommended, see `.nvmrc`)
- npm 10+
- Chrome or Chromium for running unit tests

## Getting started

```bash
npm install
npm start
```

Then open http://localhost:4200. The dev server proxies `/core-api` to the CORE API
(`proxy.conf.json`), so no other setup is needed.

## Commands

| Command                     | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `npm start`                 | Dev server on http://localhost:4200 with live reload  |
| `npm run start:local`       | Dev server using your local API key (see below)       |
| `npm run build`             | Production build into `dist/core-papers-explorer`     |
| `npm test -- --watch=false` | Run unit tests once in headless Chrome                |
| `npm test`                  | Run unit tests in watch mode                          |
| `npm run test:api`          | Test the serverless function (Node 22, `node --test`) |
| `npm run lint`              | Lint TypeScript and templates                         |
| `npm run format`            | Format the codebase with Prettier                     |
| `npm run format:check`      | Check formatting without writing (used in CI)         |

Tests launch headless Chrome by default. If Karma cannot find a browser, point it at one:

```bash
CHROME_BIN=/path/to/chrome npm test -- --watch=false
```

## CORE API key

The CORE API works without a key at a lower rate limit. A
[free API key](https://core.ac.uk/services/api) raises it. Where the key lives depends on where the
app runs.

**In production the key stays on the server.** The deployed app sends its searches to a Vercel
function (see [Deployment](#deployment)), which adds the key from the `CORE_API_KEY` environment
variable. The browser bundle has no key, and the function never sends it back, so it cannot be seen
in the network tab or the JavaScript.

**Locally the key is optional.** The dev server proxies to CORE directly, without the function. To
use your own key there:

```bash
cp src/environments/environment.local.example.ts src/environments/environment.local.ts
# edit environment.local.ts and paste your key into coreApiKey
npm run start:local
```

An HTTP interceptor then sends it as `Authorization: Bearer <key>`, and only on requests to the CORE
API base URL. `environment.local.ts` is gitignored, so the key never ends up in the repository. This
is for development only: a key built into a browser app is visible to anyone using it, which is why
production builds leave `coreApiKey` empty.

## Rate limits

Anonymous access allows about 10 requests per rate-limit window. When CORE answers `429 Too Many
Requests`, or a request fails with a 5xx or network error, the client retries up to three times
with exponential backoff (1 s, 2 s, 4 s), spending at most 10 seconds waiting. If the server says
to wait longer than that, the app stops and shows a message instead. Each attempt times out after
30 seconds, because cold searches on CORE can be slow; timeouts are not retried.

In production two things keep the app well inside the limit: the function sends the server-side API
key, so CORE no longer applies the anonymous limit shared by everyone behind Vercel's IP addresses,
and Vercel's CDN answers repeated searches from its cache for five minutes without calling CORE.

## Deployment

The live demo is hosted on [Vercel](https://vercel.com) and deploys automatically on every push to
`main`; other branches get preview deployments.

**Why a proxy is needed.** CORE's CORS policy only allows `http://localhost:*` and `core.ac.uk`
origins, so a browser on any other site cannot read its responses. The app therefore never calls
`api.core.ac.uk` directly. It calls the same-origin path `/core-api/v3/search/works/?q=...`, and:

- in development, the Angular dev server forwards `/core-api/*` to `https://api.core.ac.uk/*`
  (`proxy.conf.json`, wired in `angular.json`);
- in production, `vercel.json` rewrites `/core-api/v3/search/works/` to a Vercel Node.js function,
  `api/core-search.mjs`, which calls CORE server to server, so CORS never applies.

**The function** (`api/core-search.mjs`, logic in `api/_lib/core-search.mjs`):

- only answers `GET` for the search endpoint, and always calls the same upstream URL,
  `https://api.core.ac.uk/v3/search/works/`. Other methods get `405`, other `/core-api/` paths `404`,
  and unknown query parameters, a missing `q` or a `limit`/`offset` beyond CORE's limits `400`,
  before any request to CORE. It is not an open proxy.
- forwards the query string unchanged and adds `Authorization: Bearer $CORE_API_KEY` when that
  environment variable is set. Without it, the function works anonymously. Nothing from the
  browser's request headers is forwarded.
- gives CORE 25 seconds (the app waits 30 per attempt) and turns a timeout into `504` and a network
  failure into `502`, both as JSON `{ "error": "..." }`.
- passes on CORE's status, JSON body, `Content-Type` and rate-limit headers (`X-RateLimit-*`,
  `Retry-After`), which the app's retry logic reads.
- marks successful responses `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`, so
  Vercel's CDN serves the same search URL from its cache for five minutes and refreshes it in the
  background for ten more. Errors, including `429`, are `no-store`.
- never returns or logs the key: only selected headers are passed on, the body is scrubbed of it in
  case CORE ever echoed it, and errors are logged by name only.

**Setting the key.** In the Vercel project, open Settings → Environment Variables, add
`CORE_API_KEY` with your [CORE API key](https://core.ac.uk/services/api) for the Production (and,
if wanted, Preview) environment, and redeploy; environment variables apply to new deployments
only. The Angular build never reads it; only the function does, at request time.

`vercel.json` also sets the build command and output directory, gives the function a
`maxDuration` of 30 seconds, sends every other path without a file extension (outside `/api/` and
`/core-api/`) to `index.html` so deep links work, and adds `X-Content-Type-Options` and
`Referrer-Policy` headers. A missing file such as `/does-not-exist.js` still gets `index.html` with
status `200` on Vercel, because Vercel's Angular preset adds its own catch-all after these rules; see
the [walkthrough](docs/WALKTHROUGH.md#the-404-for-missing-files) for why `"framework": null` does
not fix that. Leave Vercel's `trailingSlash` option unset: the search path keeps its trailing slash
(`/v3/search/works/`), and `trailingSlash: false` would redirect it away from the function.

**Deploy your own copy.** Fork the repository, choose "Add New Project" in Vercel, import the fork
and accept the detected settings; `vercel.json` supplies the rest, and Vercel picks up the function
in `api/` by itself. `CORE_API_KEY` is optional but recommended, since without it every user of the
deployment shares CORE's anonymous limit. Another host works if it serves
`dist/core-papers-explorer/browser` with a fallback to `index.html` and can run the same proxy for
`/core-api/v3/search/works/`.

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
      search/          the search page (lazy loaded), URL params, paging maths, page size
                       preference
    shared/
      ui/              presentational components: paper card, skeleton, empty and error states,
                       pagination
    app.config.ts      application providers
    app.routes.ts      routes
  environments/        build-time configuration, including the optional API key
  testing/             test fixtures shared between specs
api/
  core-search.mjs      Vercel function: the production proxy for CORE search
  _lib/                its logic and tests (node --test); the leading underscore stops Vercel
                       from deploying these files as functions
docs/
  WALKTHROUGH.md       design decisions and notes, phase by phase
proxy.conf.json        dev-server proxy for the CORE API
vercel.json            Vercel build settings, function rewrite, SPA fallback and headers
```

## How I built this

Built with Claude Code as an AI pair-programmer; I reviewed, tested and understand every change.
Design decisions are explained in [docs/WALKTHROUGH.md](docs/WALKTHROUGH.md).

## Roadmap

- [x] 1. Project setup: Angular 20, strict mode, lint, format, CI, app shell
- [x] 2. CORE API layer: typed models, service, timeouts, retry with backoff on 429, error handling
- [x] 3. Paper cards with loading, empty and error states; responsive and accessible
- [x] 4. Results-per-page control, pagination and state in the URL
- [ ] 5. Boolean keyword search with validation, help and search history
- [ ] 6. Chart of papers per year across all matching results
- [ ] 7. Extras: response cache, CSV/BibTeX export, dark mode
