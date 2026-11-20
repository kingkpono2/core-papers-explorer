# CORE Papers Explorer

Author: Kpono Akpabio, assisted by Claude Code

Live demo: https://core-papers-explorer.vercel.app

A small Angular app for searching open-access research papers through the
[CORE API v3](https://api.core.ac.uk/docs/v3). It lists matching papers, lets you choose how many
are returned, supports boolean keyword queries such as `(drone AND (package OR delivery))`, and
charts how all matching papers are distributed over time.

> Status: work in progress. See the [roadmap](#roadmap) for what is done.

## Features

- Keyword search against CORE with boolean queries: AND, OR, NOT, brackets, phrases, fields such
  as `title:` and `authors:`, year comparisons and wildcards
- The query is checked as you type: unbalanced brackets, dangling operators, unclosed quotes,
  unknown fields and other mistakes are explained under the search box, with the offending part
  marked, and a query with errors is never sent to CORE. Warnings, such as lowercase `and`, explain
  what CORE will do without blocking the search
- A "How to search" panel with the syntax, CORE's quirks, example queries that run with one click
  and buttons that insert a field at the cursor
- The last eight searches are kept as one-click chips, with a button to clear them
- Search terms are highlighted in titles and abstracts
- A chart of when all matching papers were published, not only the ones on the page, with
  tooltips, keyboard navigation, a table view, and a click on a bar to search that year only
  (see [Chart](#chart))
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
- One results request per user action, plus one chart request per new query; paging, changing the
  page size and repeated or cosmetic URL changes never trigger another search or chart request

CORE serves at most 100 results per request and only the first 10,000 results of any search, so
pagination stops at the 10,000th result and says so.

## Search syntax

| Write                                         | To find                                           |
| --------------------------------------------- | ------------------------------------------------- |
| `drone AND delivery`                          | papers with both words                            |
| `drone OR uav`, `drone uav`                   | papers with either word (CORE's default is OR)    |
| `drone NOT military`, `drone -military`       | drone papers that do not mention military         |
| `drone AND (package OR delivery)`             | brackets group parts of the query                 |
| `"drone delivery"`                            | the exact phrase                                  |
| `dron*`, `colo?r`                             | wildcards: any letters, or exactly one            |
| `title:drone`, `authors:"Jane Doe"`           | a word or phrase in one field                     |
| `yearPublished>=2019 AND yearPublished<=2021` | a range of years (CORE fails on `[2019 TO 2021]`) |

Other fields include `abstract`, `fullText`, `documentType`, `fieldOfStudy`, `publisher`, `doi`
and `language`. CORE also reads lowercase `and`, `or` and `not` as operators, and it ignores an
OR group nested inside other brackets; the app warns about both and removes brackets around the
whole query before sending it.

## Chart

Beside the results on wide screens, and above them on phones, a bar chart shows how many of the
papers matching the search were published in each year. It counts every match, not just the page
on screen: for `drone AND (package OR delivery)` it covers all 4,729 papers.

**How the counts are made.** CORE has an aggregation endpoint,
`POST /v3/search/works/aggregate` with `{ "q": "...", "aggregations": ["yearPublished"] }`, that
returns the number of matches per publication year in one request. The app sends it the same query
as the results request, so the chart and the result count always describe the same set of papers.
The alternative, one count request per year (`<query> AND yearPublished:2020` with `limit=1`),
would take 15 or more requests per search against a limit of about 10 per window, and composing
those queries is easy to get wrong (see below).

**What is drawn.** The individual years run back from the latest one until they cover 98% of the
dated papers, between 10 and 30 bars. Older papers are counted in one line under the chart, with a
link that searches them, rather than as a wider bar on the same axis. The current year is marked as
the year so far. Years after the current one and impossible years such as 1000 or 9999 are data
errors in CORE and are left out, and the chart says how many papers have no usable year. CORE
returns at most 100 years, the ones with the most papers; when it hits that cap the count for older
papers is shown as a lower bound.

**Narrowing to a year.** Selecting a bar searches that year only, by adding `yearPublished:YYYY` to
the query. The year is added to the query as CORE receives it (see
[Search syntax](#search-syntax)), not to the text as typed, because CORE ignores an OR group nested
in brackets: `(drone AND (package OR delivery)) AND yearPublished:2020` returns 5,626 papers, the
count for every drone paper from 2020, while `drone AND (package OR delivery) AND yearPublished:2020`
returns 354, the height of the bar. A query that is an OR at the top level is bracketed first
(`(drone OR quadcopter) AND yearPublished:2020`, 6,068, again the bar's height). When bracketing
would nest another OR group, or the query already filters by year, the bars are not selectable.

**Requests.** The chart asks CORE only after the results have arrived, so it never delays them.
Answers are kept for the session per query, so paging, changing the page size or going back to an
earlier search costs nothing; a request still in flight is cancelled when the query changes. Errors
are shown in the chart with a retry button and never affect the results. CORE only allows
aggregation as a `POST`, which Vercel's CDN does not cache, so unlike searches these requests always
reach CORE; in testing they did not use up the rate-limit allowance that searches count against.

The chart is hand-built SVG, measured to the width it is given: round tick values, compact numbers
on the axis above 10,000, year labels thinned to fit at phone width, a label on the highest bar, a
tooltip on hover and keyboard focus, and bars that form a single tab stop moved with the arrow
keys. A "Show as table" toggle gives the same numbers as a table. Bars grow in when drawn, unless
the system asks for reduced motion.

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

- only answers `GET` for the search endpoint and `POST` for the aggregation endpoint
  (`/core-api/v3/search/works/aggregate`), and always calls the same two upstream URLs. Other
  methods get `405`, other `/core-api/` paths `404`, and unknown query parameters, a missing `q` or
  a `limit`/`offset` beyond CORE's limits `400`, before any request to CORE. An aggregation body may
  only hold `q` and `aggregations` (and only `yearPublished` for now), is limited to 4 KB, and is
  rebuilt from those fields before it is sent. It is not an open proxy.
- forwards the query string unchanged and adds `Authorization: Bearer $CORE_API_KEY` when that
  environment variable is set. Without it, the function works anonymously. Nothing from the
  browser's request headers is forwarded.
- gives CORE 25 seconds (the app waits 30 per attempt) and turns a timeout into `504` and a network
  failure into `502`, both as JSON `{ "error": "..." }`.
- passes on CORE's status, JSON body, `Content-Type` and rate-limit headers (`X-RateLimit-*`,
  `Retry-After`), which the app's retry logic reads.
- marks successful searches `Cache-Control: public, s-maxage=300, stale-while-revalidate=600`, so
  Vercel's CDN serves the same search URL from its cache for five minutes and refreshes it in the
  background for ten more. Errors, including `429`, and aggregation answers are `no-store`.
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
status `200` on Vercel, because Vercel's Angular preset adds its own catch-all after these rules
(`"framework": null` does not change that). Leave Vercel's `trailingSlash` option unset: the search path keeps its trailing slash
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
      search/          the search page (lazy loaded), search bar, help panel, URL params, paging
                       maths, page size preference and recent searches
        query/         query analyser (tokenizer, parser, diagnostics) and the CORE workarounds
        chart/         the publication years chart, its per-query cache and year bucketing
    shared/
      ui/              presentational components: paper card, skeleton, empty and error states,
                       pagination, term highlighting, bar chart
    app.config.ts      application providers
    app.routes.ts      routes
  environments/        build-time configuration, including the optional API key
  testing/             test fixtures shared between specs
api/
  core-search.mjs      Vercel function: the production proxy for CORE search
  _lib/                its logic and tests (node --test); the leading underscore stops Vercel
                       from deploying these files as functions
proxy.conf.json        dev-server proxy for the CORE API
vercel.json            Vercel build settings, function rewrite, SPA fallback and headers
```

## How I built this

Built with Claude Code as an AI pair-programmer; I reviewed, tested and understand every change.

## Roadmap

- [x] 1. Project setup: Angular 20, strict mode, lint, format, CI, app shell
- [x] 2. CORE API layer: typed models, service, timeouts, retry with backoff on 429, error handling
- [x] 3. Paper cards with loading, empty and error states; responsive and accessible
- [x] 4. Results-per-page control, pagination and state in the URL
- [x] 5. Boolean keyword search with validation, help and search history
- [x] 6. Chart of papers per year across all matching results
- [ ] 7. Extras: response cache, CSV/BibTeX export, dark mode
