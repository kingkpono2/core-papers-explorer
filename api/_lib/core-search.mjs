// The CORE search proxy behind /core-api/v3/search/works/ on Vercel. Everything that can be tested
// without a network lives here; api/core-search.mjs only creates the handler. Vercel does not turn
// files under a folder starting with `_` into functions, so this module is only ever imported.

/** The only upstream URLs this proxy ever calls. Nothing from the request path reaches them. */
export const UPSTREAM_URL = 'https://api.core.ac.uk/v3/search/works/';
export const UPSTREAM_AGGREGATE_URL = 'https://api.core.ac.uk/v3/search/works/aggregate';

/** Below the app's 30 s per-attempt timeout, so the browser gets a clean 504 rather than giving up. */
export const UPSTREAM_TIMEOUT_MS = 25_000;

export const MAX_QUERY_STRING_LENGTH = 2_000;

/** An aggregation body is a query and a field name or two; anything bigger is not from the app. */
export const MAX_BODY_BYTES = 4_096;

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

/** CORE only offers aggregation as a POST to this path, so the app sends the same. */
const AGGREGATE_PATH = '/core-api/v3/search/works/aggregate';

/** Fields the app aggregates on. CORE supports more; each one added here should be a choice. */
export const ALLOWED_AGGREGATIONS = new Set(['yearPublished']);

/** Vercel's CDN caches per full URL, query included; browsers do not see `s-maxage`. */
export const SUCCESS_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=600';
export const NO_CACHE = 'no-store';

const JSON_TYPE = 'application/json; charset=utf-8';

/** @param {string} pathname */
export function isSearchPath(pathname) {
  return SEARCH_PATHS.has(pathname);
}

/** @param {string} pathname */
export function isAggregatePath(pathname) {
  return pathname === AGGREGATE_PATH;
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
 * Checks an aggregation request body and rebuilds it from the allowed fields only, so nothing else
 * the browser sends reaches CORE.
 *
 * @param {string} text
 * @returns {{ ok: true, body: { q: string, aggregations: string[] } }
 *   | { ok: false, status: number, error: string }}
 */
export function validateAggregateBody(text) {
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return { ok: false, status: 400, error: 'The body must be JSON.' };
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, status: 400, error: 'The body must be a JSON object.' };
  }
  const unknown = Object.keys(body).find((name) => name !== 'q' && name !== 'aggregations');
  if (unknown) {
    return { ok: false, status: 400, error: `Unsupported field: ${unknown}` };
  }
  const { q, aggregations } = body;
  if (typeof q !== 'string' || !q.trim() || q.length > MAX_QUERY_STRING_LENGTH) {
    return { ok: false, status: 400, error: 'q must be a non-empty string.' };
  }
  const valid =
    Array.isArray(aggregations) &&
    aggregations.length > 0 &&
    new Set(aggregations).size === aggregations.length &&
    aggregations.every((name) => ALLOWED_AGGREGATIONS.has(name));
  if (!valid) {
    const allowed = [...ALLOWED_AGGREGATIONS].join(', ');
    return { ok: false, status: 400, error: `aggregations must list fields from: ${allowed}.` };
  }
  return { ok: true, body: { q, aggregations } };
}

/**
 * Reads the request body, giving up once it passes `limit` bytes.
 *
 * @param {AsyncIterable<Buffer | string>} req
 * @param {number} limit
 * @returns {Promise<string | null>} null when the body is too large
 */
async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > limit) {
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
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

/**
 * Vercel's CDN only caches GET, so aggregation answers are never marked cacheable.
 *
 * @param {number} status
 * @param {string} method
 */
export function cacheControlFor(status, method = 'GET') {
  return method === 'GET' && status >= 200 && status < 300 ? SUCCESS_CACHE_CONTROL : NO_CACHE;
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

    let upstreamUrl;
    let upstreamBody;
    if (isSearchPath(pathname)) {
      if (req.method !== 'GET') {
        return sendError(res, 405, 'Only GET is supported.', { allow: 'GET' });
      }
      const validation = validateQuery(rawQuery);
      if (!validation.ok) {
        return sendError(res, validation.status, validation.error);
      }
      upstreamUrl = `${UPSTREAM_URL}?${rawQuery}`;
    } else if (isAggregatePath(pathname)) {
      if (req.method !== 'POST') {
        return sendError(res, 405, 'Only POST is supported.', { allow: 'POST' });
      }
      if (rawQuery) {
        return sendError(res, 400, 'Send the aggregation in the body, not the URL.');
      }
      if (!/^application\/json\b/i.test(req.headers?.['content-type'] ?? '')) {
        return sendError(res, 415, 'The body must be sent as application/json.');
      }
      const text = await readBody(req, MAX_BODY_BYTES);
      if (text === null) {
        return sendError(res, 413, 'The body is too large.');
      }
      const validation = validateAggregateBody(text);
      if (!validation.ok) {
        return sendError(res, validation.status, validation.error);
      }
      upstreamUrl = UPSTREAM_AGGREGATE_URL;
      upstreamBody = JSON.stringify(validation.body);
    } else {
      return sendError(res, 404, 'Not found.');
    }

    const apiKey = getApiKey();
    let upstream;
    let body;
    try {
      upstream = await fetchImpl(upstreamUrl, {
        method: req.method,
        headers: upstreamBody
          ? { ...buildUpstreamHeaders(apiKey), 'Content-Type': 'application/json' }
          : buildUpstreamHeaders(apiKey),
        body: upstreamBody,
        // The URLs are fixed, so a redirect is unexpected; refusing it also means the
        // Authorization header can never follow one.
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
      'cache-control': cacheControlFor(upstream.status, req.method),
      // Says whether a key was configured, never the key itself; handy when checking a deployment.
      'x-core-auth': apiKey?.trim() ? 'key' : 'anonymous',
    });
  };
}
