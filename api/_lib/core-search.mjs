// The CORE search proxy behind /core-api/v3/search/works/ on Vercel. Everything that can be tested
// without a network lives here; api/core-search.mjs only creates the handler. Vercel does not turn
// files under a folder starting with `_` into functions, so this module is only ever imported.

/** The only upstream URL this proxy ever calls. Nothing from the request path reaches it. */
export const UPSTREAM_URL = 'https://api.core.ac.uk/v3/search/works/';

/** Below the app's 30 s per-attempt timeout, so the browser gets a clean 504 rather than giving up. */
export const UPSTREAM_TIMEOUT_MS = 25_000;

export const MAX_QUERY_STRING_LENGTH = 2_000;

/** Mirrors CORE's own limits (see CORE_MAX_LIMIT and CORE_MAX_OFFSET in the app). */
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;

/** Query parameters the app sends today, plus `sort` for later phases. */
export const ALLOWED_PARAMS = new Set(['q', 'limit', 'offset', 'exclude', 'sort']);

/**
 * Paths that reach the search. The first is the public one, rewritten here by vercel.json; Vercel
 * passes the original path to the function. The second is the function's own URL.
 */
const SEARCH_PATHS = new Set(['/core-api/v3/search/works/', '/api/core-search']);

/** Vercel's CDN caches per full URL, query included; browsers do not see `s-maxage`. */
export const SUCCESS_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';
export const NO_CACHE = 'no-store';

const JSON_TYPE = 'application/json; charset=utf-8';

/** @param {string} pathname */
export function isSearchPath(pathname) {
  return SEARCH_PATHS.has(pathname);
}

/**
 * Checks the raw query string (without `?`) before any upstream request is made, so bad requests
 * cost no rate-limit token.
 *
 * @param {string} rawQuery
 * @returns {{ ok: true } | { ok: false, status: number, error: string }}
 */
export function validateQuery(rawQuery) {
  if (rawQuery.length > MAX_QUERY_STRING_LENGTH) {
    return { ok: false, status: 414, error: 'Query string is too long.' };
  }
  const params = new URLSearchParams(rawQuery);
  const seen = new Set();
  for (const name of params.keys()) {
    if (!ALLOWED_PARAMS.has(name)) {
      return { ok: false, status: 400, error: `Unsupported query parameter: ${name}` };
    }
    if (seen.has(name)) {
      return { ok: false, status: 400, error: `Repeated query parameter: ${name}` };
    }
    seen.add(name);
  }
  if (!params.get('q')?.trim()) {
    return { ok: false, status: 400, error: 'The q parameter is required.' };
  }
  for (const [name, max] of [
    ['limit', MAX_LIMIT],
    ['offset', MAX_OFFSET],
  ]) {
    const value = params.get(name);
    if (value !== null && (!/^\d{1,6}$/.test(value) || Number(value) > max)) {
      return { ok: false, status: 400, error: `${name} must be a whole number up to ${max}.` };
    }
  }
  return { ok: true };
}

/**
 * Headers for the upstream request. Nothing is copied from the browser's request; the key comes
 * only from the server's environment.
 *
 * @param {string | undefined} apiKey
 * @returns {Record<string, string>}
 */
export function buildUpstreamHeaders(apiKey) {
  const headers = { Accept: 'application/json' };
  const key = apiKey?.trim();
  return key ? { ...headers, Authorization: `Bearer ${key}` } : headers;
}

/**
 * Upstream response headers worth passing on: the content type and CORE's rate-limit headers,
 * which the app's retry logic reads on a 429.
 *
 * @param {Headers} headers
 * @returns {Record<string, string>}
 */
export function pickResponseHeaders(headers) {
  /** @type {Record<string, string>} */
  const picked = {};
  for (const [name, value] of headers) {
    if (name === 'content-type' || name === 'retry-after' || name.startsWith('x-ratelimit-')) {
      picked[name] = value;
    }
  }
  return picked;
}

/** @param {number} status */
export function cacheControlFor(status) {
  return status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : NO_CACHE;
}

/**
 * Removes the key from text that is about to leave the server. CORE has no reason to echo it, but
 * this makes sure an upstream error message never can.
 *
 * @param {string} text
 * @param {string | undefined} apiKey
 */
export function redactKey(text, apiKey) {
  const key = apiKey?.trim();
  return key ? text.split(key).join('[redacted]') : text;
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} body
 * @param {Record<string, string>} headers
 */
function send(res, status, body, headers) {
  res.statusCode = status;
  for (const [name, value] of Object.entries(headers)) {
    res.setHeader(name, value);
  }
  res.end(body);
}

/**
 * @param {import('node:http').ServerResponse} res
 * @param {number} status
 * @param {string} error
 * @param {Record<string, string>} [headers]
 */
function sendError(res, status, error, headers = {}) {
  send(res, status, JSON.stringify({ error }), {
    ...headers,
    'content-type': JSON_TYPE,
    'cache-control': NO_CACHE,
  });
}

/**
 * Creates the request handler. Dependencies are parameters so tests can run it without a network.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   getApiKey?: () => string | undefined,
 *   timeoutMs?: number,
 *   log?: Pick<Console, 'error'>,
 * }} [options]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createHandler({
  fetchImpl = globalThis.fetch,
  getApiKey = () => process.env.CORE_API_KEY,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
  log = console,
} = {}) {
  return async function coreSearch(req, res) {
    const rawUrl = req.url ?? '/';
    const queryStart = rawUrl.indexOf('?');
    const pathname = new URL(rawUrl, 'http://localhost').pathname;
    const rawQuery = queryStart === -1 ? '' : rawUrl.slice(queryStart + 1);

    if (!isSearchPath(pathname)) {
      return sendError(res, 404, 'Not found.');
    }
    if (req.method !== 'GET') {
      return sendError(res, 405, 'Only GET is supported.', { allow: 'GET' });
    }
    const validation = validateQuery(rawQuery);
    if (!validation.ok) {
      return sendError(res, validation.status, validation.error);
    }

    const apiKey = getApiKey();
    let upstream;
    let body;
    try {
      upstream = await fetchImpl(`${UPSTREAM_URL}?${rawQuery}`, {
        method: 'GET',
        headers: buildUpstreamHeaders(apiKey),
        // The URL is fixed and already has its trailing slash, so a redirect is unexpected; refusing
        // it also means the Authorization header can never follow one.
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = await upstream.text();
    } catch (error) {
      const name = error instanceof Error ? error.name : 'Error';
      const timedOut = name === 'TimeoutError' || name === 'AbortError';
      // Only the error's name: never the request, its headers or the key.
      log.error(`CORE search request failed: ${timedOut ? 'timeout' : name}`);
      return timedOut
        ? sendError(res, 504, 'CORE did not respond in time.')
        : sendError(res, 502, 'Could not reach CORE.');
    }

    const headers = pickResponseHeaders(upstream.headers);
    if (!/\bjson\b/i.test(headers['content-type'] ?? '')) {
      delete headers['content-type'];
      const status = upstream.status >= 400 ? upstream.status : 502;
      return sendError(res, status, `CORE answered ${upstream.status} without JSON.`, headers);
    }
    send(res, upstream.status, redactKey(body, apiKey), {
      ...headers,
      'cache-control': cacheControlFor(upstream.status),
    });
  };
}
