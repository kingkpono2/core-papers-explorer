# Walkthrough

Notes on how the app is put together and why, written phase by phase. Each section ends with
questions I'd expect in a review and how I'd answer them.

## Phase 1: Project setup

### What was set up

- An Angular 20 app generated with the CLI: standalone components, routing, SCSS, no SSR, strict
  mode, zoneless change detection.
- Pinned dependencies: Angular CLI/build 20.3.42, framework 20.3.35, TypeScript 5.9.
- ESLint (angular-eslint 20, typescript-eslint 8, ESLint 9 flat config) and Prettier.
- Karma + Jasmine, configured to run in headless Chrome by default.
- Environment files with an optional CORE API key, plus a gitignored local override.
- A GitHub Actions workflow that runs lint, format check, tests and a production build.
- An app shell: header, a placeholder search panel, and a footer crediting CORE.

### Why these choices

**Standalone components instead of NgModules.** Standalone is the default since Angular 17 and the
direction the framework is going. Each component declares its own imports, so dependencies are
visible in the file that uses them, and lazy loading is a one-liner (`loadComponent`) rather than a
separate routing module. For an app this size, NgModules would only add files.

**Zoneless change detection and signals.** Zoneless is stable in Angular 20.2+, and the CLI offers
it at `ng new`. Without zone.js, Angular no longer patches every async browser API to guess when to
re-render; it re-renders when a signal it reads changes, an event handler in a template fires, or
`markForCheck` is called. The result is a smaller bundle (no zone.js), fewer wasted
change-detection passes and simpler stack traces. The cost is discipline: state that the template
reads has to live in signals (or come through the `async` pipe). Every component is also `OnPush`,
which is enforced by lint, so the code behaves the same way it would under zones.

**Strict mode.** `strict`, `noImplicitReturns`, `noPropertyAccessFromIndexSignature` and
`strictTemplates` are on. The main payoff comes in phase 2: API responses are typed, and the
template compiler will catch a template that reads a field that might be `null`, rather than
showing `undefined` on screen.

**Folder structure.**

- `core/` holds things that exist once per app: layout now, API service, models and interceptors
  next.
- `features/search/` holds the search page and anything only it uses. It is lazy loaded, so it can
  grow without affecting the initial bundle.
- `shared/ui/` is for small presentational components that take inputs and emit outputs (paper
  card, spinner, empty state). It is empty for now on purpose.

Code is grouped by feature, as the Angular style guide recommends, with `core` and `shared` as
the two common exceptions. It scales without becoming a deep tree.
File names follow the Angular 20 convention (`search-page.ts`, class `SearchPage`) without the
`.component` suffix.

**Lint and format.** Prettier handles formatting so code review can focus on logic. ESLint uses
the recommended presets plus a few rules that match how the app is written:

- `prefer-on-push-component-change-detection`: every component is OnPush.
- `prefer-signals`: inputs, queries and state use the signal APIs.
- `template/prefer-control-flow`: `@if`/`@for` instead of `*ngIf`/`*ngFor`.
- `templateAccessibility`: catches missing labels, alt text and similar issues early.

ESLint is on 9.x because angular-eslint 20 supports ESLint 8 and 9 only. ESLint 9 is past its
end-of-support date, so upgrading Angular and angular-eslint together is on the list after the
assessment.

**Tests.** I kept the Karma + Jasmine runner that `ng new` generates in Angular 20; it is the stable,
documented option for this version. The only change is a custom `ChromeHeadlessCI` launcher
(`--no-sandbox`, `--disable-dev-shm-usage`) set as the default browser, so `npm test` works on a
laptop, in a container running as root and on GitHub Actions without extra flags. `CHROME_BIN` picks
a specific browser if needed.

**CI.** One job on Node 22: `npm ci`, lint, format check, tests, build. It runs on pushes to `main`
and on pull requests, and is short enough to read at a glance. `npm ci` installs exactly what is in
the lockfile, so CI tests the same dependency tree as local development.

**Environment config and the API key.** `environment.ts` holds the API base URL and an empty
`coreApiKey`. A typed `AppEnvironment` interface keeps all environment files in sync. To use a key,
copy `environment.local.example.ts` to `environment.local.ts` (gitignored) and run
`npm run start:local`, which uses an Angular `fileReplacements` configuration. That keeps real keys
out of git.

The honest caveat: anything shipped to a browser is public. A key in the bundle can be read from
the network tab. For CORE this is acceptable because keys are free and only raise rate limits, but
a production app would put the key behind a small server-side proxy.

### Trade-offs

- **No SSR.** This is a client-side search tool with no SEO requirement. SSR would add a server
  build and hydration concerns for no real benefit.
- **No UI library.** Angular Material would speed up some components but adds weight and its own
  look. The UI here is small enough that plain SCSS with CSS variables stays readable, and it makes
  dark mode a matter of swapping variables.
- **Karma over the newer test builders.** Karma is officially deprecated upstream, and Angular is
  moving towards Vitest. In Angular 20 the Vitest builder is still experimental, so I chose the
  stable option and kept the specs framework-agnostic enough to migrate later.
- **Pinned tool versions.** The CLI and build packages are pinned exactly, and I avoided releases
  younger than about two weeks. Builds are reproducible and fresh releases have time to settle.

### Likely questions

**Why zoneless? Isn't it risky?**
It has been stable since Angular 20.2, and new apps can start with it. The risk is mostly in
migrating old code that relies on zone.js to notice changes. A new app that uses signals and OnPush
from day one doesn't have that code.

**What actually triggers change detection without zone.js?**
Signal updates that a template reads, template event listeners, the `async` pipe, and explicit
`markForCheck()`. A `setTimeout` that mutates a plain field will not update the view, which is why
state lives in signals.

**Why OnPush everywhere if you are zoneless already?**
It keeps a component from being checked just because a parent was. It also keeps the code
correct if zone.js were ever reintroduced. Lint enforces it, so it never comes down to remembering.

**Where would you put the HTTP service and interceptor?**
In `core/`: `core/api/core-api.service.ts`, `core/models/` for the response types, and
`core/interceptors/` for the API key header. They are provided once at the root through
`app.config.ts`.

**How do you keep the API key out of the repo?**
It is empty in committed files. Locally it goes into a gitignored `environment.local.ts`, selected by
an Angular build configuration. I'd also say plainly that a browser app cannot keep a key secret;
the real fix is a proxy.

**Why lazy load a single feature?**
It costs one line and keeps the initial bundle to the shell. When the chart library or export
code arrives, it only loads with the search page.

**What does CI protect against?**
Formatting drift, lint violations, failing tests, and builds that only work on my machine, since it
installs from the lockfile with `npm ci`.

### API notes

Checked from the server with curl before writing any API code (19 November 2026).

- **Endpoint.** `GET https://api.core.ac.uk/v3/search/works/?q=...&limit=...&offset=...`. The URL
  without the trailing slash returns a `301` redirect to the slashed one, and the redirect costs a
  rate-limit token, so the client should always use the trailing slash.
- **Auth.** Works anonymously. An API key is optional and is sent as `Authorization: Bearer <key>`;
  it raises the rate limit.
- **Rate limits.** Every response carries `X-RateLimit-Limit` (10 anonymously),
  `X-RateLimit-Remaining` and `X-RateLimit-Retry-After` (a timestamp). Over the limit the API
  returns `429`, so the client needs retry with backoff and should honour `Retry-After`.
- **CORS.** Browser use works. The API reflects the request origin in
  `Access-Control-Allow-Origin`, and a preflight allows the `authorization` header (max-age one hour),
  so the key header will not break cross-origin calls.
- **Response shape.** Top level: `totalHits`, `limit`, `offset`, `results`, `searchId`. Each result
  includes `id`, `title`, `authors` (`[{ name }]`), `abstract`, `yearPublished`, `publishedDate`,
  `doi`, `downloadUrl`, `links`, `publisher`, `journals`, `documentType`, `citationCount`,
  `fieldOfStudy`, `language`, `dataProviders`, `identifiers` and `fullText`. Many of these can be
  `null` or empty, and `fullText` can be large.
- **Volume.** `q=(drone)` reported `totalHits: 71213`. A page of 10 results is about 40 KB, mostly
  because of `fullText` and abstracts.
- **Counts for the chart.** Fielded queries work: `(drone) AND yearPublished:2020` returned
  `totalHits: 5626`. That allows a per-year chart built from counts across all matches, without
  downloading every paper. `limit=0` is ignored and falls back to 10 results, so count queries
  should use `limit=1`.

## Phase 2: CORE API layer

### What was built

- `core/models/`: the raw response types (`CoreWork`, `CoreSearchResponse`), the app's own
  `Paper` and `SearchResult` models, and a pure mapper (`toPaper`, `toSearchResult`) between them.
- `core/api/CoreApiService`: one method, `searchWorks({ query, limit, offset })`, returning
  `Observable<SearchResult>`. It adds a 15 second timeout, retries transient failures with backoff
  and turns every failure into an `ApiError`.
- `core/api/retry-transient.ts`: the retry policy as a small RxJS operator.
- `core/api/api-error.ts`: `ApiError` with a `kind` (`rate-limit`, `network`, `timeout`,
  `bad-query`, `server`) and a message that can be shown to users as is.
- `core/api/core-api.config.ts`: an injection token holding the base URL, key, timeout and retry
  settings. Its default comes from the environment file; tests provide their own.
- `core/interceptors/api-key.interceptor.ts`: a functional interceptor that adds
  `Authorization: Bearer <key>` when a key is configured, and only for CORE API URLs.
- `app.config.ts`: `provideHttpClient(withFetch(), withInterceptors([apiKeyInterceptor]))`.
- A temporary search form on the search page: a query field defaulting to `drone`, a Search button,
  the total number of hits and a plain list of titles, years and authors. Phase 3 replaces the
  list with proper paper cards.

No new npm packages.

### What I found while building it

- `exclude=fullText` works on `/search/works/` and drops the full text from each result. The app
  never shows it, and for some papers it is megabytes, so every search sends it.
- Abstracts sometimes arrive as escaped HTML, for example `&lt;p&gt;This is the first
release&lt;/p&gt`, note the missing final semicolon. Others contain JATS tags like `<jats:p>`.
- CORE's CORS response only exposes `link` and `collection-length`. The `X-RateLimit-*` headers
  are sent, but a browser cannot read them. The retry code still honours `X-RateLimit-Retry-After`
  (and the standard `Retry-After`) when they are readable, which matters if the app is ever put
  behind a proxy, but in the browser today the exponential backoff is what actually runs.
- A malformed query such as `drone AND (` returns `200` with results rather than `400`, so query
  validation has to happen on the client (phase 5). The service still maps `400`/`422` to
  `bad-query` in case CORE changes this.

### Why it is built this way

**Raw model, app model and a mapper.** The raw types describe what CORE sends: nearly everything
optional or nullable, numeric ids, nested `authors`, `journals` and `links`. The `Paper` model
describes what the UI needs: a string id, a title that is never empty, authors as a clean
`string[]`, explicit `null` for anything missing, a ready-made `doiUrl` and a `sourceUrl` that is
always set. The mapper is the single place where CORE's quirks are handled: trimming, decoding
entities and stripping tags, removing duplicate authors (case-insensitive), normalising DOIs given
as URLs, rejecting non-http links, and picking a landing page (`display` link, then `reader`, then
the DOI, then the CORE work page). Components never see raw API data, so a change in the API means
changing one function and its tests. Because the mapper is pure, it is tested without TestBed.

**Retry only on 429, 5xx and network errors.** Those are the failures where trying again can give
a different answer. A `400` or `404` will fail the same way every time, so retrying only burns
rate-limit tokens and makes the user wait longer for the same error. Timeouts are not retried
either: CORE has already taken 15 seconds, and three more attempts could leave the user waiting
a minute. Better to say so and let them retry or narrow the search.

**Backoff.** Delays are 1 s, 2 s and 4 s, up to three retries. For a `429` the delay is the larger
of the backoff and the server's `Retry-After`, so a reset time that is already in the past (clock
skew, for example) still waits the normal backoff. The total wait per request is capped at 10 seconds; if the server asks for
more, the request fails at once with a `rate-limit` error instead of keeping a spinner up for a
minute. The waiting budget is kept per subscription (`defer`), so resubscribing starts clean. There
is no jitter: jitter spreads out many clients hitting one server, while this rate limit applies to
a single browser, so it would only make the tests less predictable.

**Timeout.** HttpClient has no default timeout, and a hung request leaves the page stuck in
"Searching". The RxJS `timeout` sits before the retry, so it applies per attempt, and when it fires
it unsubscribes, which aborts the underlying fetch.

**Error model.** Components get one error type with a `kind` they can switch on (phase 3 can
show a retry button for `network` but not for `bad-query`) and a message ready to display. The
original `HttpErrorResponse` is kept as `cause` for debugging. Mapping happens once in the
service, so components never inspect HTTP status codes.

**Interceptor.** Adding the key in the service would work, but the interceptor keeps auth out of
the request code and covers any future CORE endpoint, such as the per-year counts in phase 6. It
checks that the URL starts with the configured base URL plus `/`, so the key only goes to CORE: not
to other hosts, not to look-alike hosts such as `https://api.core.ac.uk.example.com/`, and not to
paths that merely share the prefix.

**`withFetch()`.** This switches HttpClient from XMLHttpRequest to the Fetch API. Angular recommends
it for server-side rendering, so it keeps that option open, and it supports everything this app
needs, including cancellation. The main thing only the XHR backend offers is upload progress
events, which a search app never uses.

**Signals and RxJS.** RxJS is used where it is strong: the HTTP request, timeout, retry and
cancellation. Signals are used for what the template reads. The boundary is one `toSignal` in the
search page, which turns a stream of search states (`idle`, `loading`, `success`, `error`) into a
signal. The state is a discriminated union, and strict templates narrow it inside `@switch`, so the
template cannot read `result` while loading.

**Cancellation.** Each search goes through `switchMap`. Starting a new search unsubscribes from the
previous one, which aborts its request, so a slow earlier response can never overwrite a newer one.
I considered `rxResource` and `httpResource`, which handle this automatically, but both are marked
experimental in Angular 20.3. `switchMap` plus `toSignal` is stable, easy to test, and short.

### Trade-offs

- **Regex HTML stripping instead of `DOMParser`.** It keeps the mapper pure and runnable without a
  DOM, and covers the cases seen in real data. The trade-off is that it decodes only common
  entities, and text like `x<y and z>w` could be read as a tag. Angular escapes interpolated text,
  so neither case is a security problem, only a cosmetic one.
- **Retry-After is mostly theoretical in the browser** because of the CORS headers above. I kept
  the code because it is small, tested, and correct the day a proxy or a CORS change exposes them.
- **No cache yet.** Repeating a search costs another request. A small cache keyed by query and
  page is planned for phase 7.
- **The temporary UI is deliberately plain.** It proves the data flow end to end; layout, cards and
  empty states belong to phase 3.

### Likely questions

**Why not use the API response type directly in components?**
Because nearly every field can be null or oddly formatted. Mapping once means templates deal with
a predictable shape, and if CORE renames or reshapes a field, one function changes.

**Why don't you retry on a 400?**
It is deterministic. The same request will fail the same way, and each retry costs one of about 10
anonymous requests per window. Only 429, 5xx and network errors can succeed on a second try.

**How do you honour the rate limit if the browser can't read the headers?**
The backoff alone (1, 2, 4 s, capped at 10 s total) handles it. The header is used when it is
readable. If CORE still says no, the user gets a clear rate-limit message rather than an endless
spinner. An API key or a server-side proxy with a shared cache would be the real fix.

**Where does the timeout go, and why there?**
Before `retry`, so each attempt gets its own 15 seconds. When it fires, the subscription ends and
Angular aborts the request. Timeouts are not retried.

**What happens if the user searches twice quickly?**
`switchMap` unsubscribes from the first search, which cancels its HTTP request, and only the
second result is rendered.

**Why `switchMap` and not `rxResource`?**
`rxResource` would do the same cancellation, but it is experimental in Angular 20.3. For a
graded project I picked the stable API; switching later is a small change confined to one
component.

**How did you test the retry timing without waiting?**
Jasmine's mock clock. The test flushes a 429 with a `Retry-After` three seconds ahead, advances the
clock 2,999 ms and checks that no request was made, then 1 ms more and checks that the retry
happened. `HttpTestingController.verify()` fails any test that makes an unexpected request.

**Could the API key leak to another site?**
The interceptor only adds it when the URL starts with the CORE base URL followed by `/`, and there
is a test for both a different host and a look-alike URL. It is still visible in the browser's
network tab, which is why a production deployment would use a proxy.

### Explaining it in 60 seconds

All API access goes through one service, `CoreApiService.searchWorks`. It calls CORE's search
endpoint with the trailing slash, so there is no redirect wasting a rate-limit token, and excludes
full text, which can be huge. Each attempt has a 15 second timeout. Rate limits, server errors and
network failures are retried with exponential backoff, honouring the server's retry time when the
browser can see it, and never waiting more than 10 seconds in total. Anything else fails at once.
Every failure becomes an `ApiError` with a kind and a user-friendly message. The raw response is
mapped into a clean `Paper` model by a pure, well-tested function, so components never handle nulls
or HTML in abstracts. An interceptor adds the optional API key only for CORE URLs. The search page
turns a stream of searches into a signal with `switchMap` and `toSignal`, which gives loading and
error states and cancels the previous request when a new search starts.
