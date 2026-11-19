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
