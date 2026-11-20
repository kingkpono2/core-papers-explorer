import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import {
  MAX_BODY_BYTES,
  NO_CACHE,
  SUCCESS_CACHE_CONTROL,
  UPSTREAM_AGGREGATE_URL,
  UPSTREAM_URL,
  buildUpstreamHeaders,
  cacheControlFor,
  createHandler,
  isAggregatePath,
  isSearchPath,
  pickResponseHeaders,
  redactKey,
  validateAggregateBody,
  validateQuery,
} from './core-search.mjs';

const KEY = 'test-key-123';
const SEARCH = '/core-api/v3/search/works/?q=drone&limit=10&offset=0&exclude=fullText';

/** A minimal stand-in for Node's ServerResponse. */
function fakeResponse() {
  return {
    statusCode: 200,
    headers: /** @type {Record<string, string>} */ ({}),
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body = '') {
      this.body = body;
    },
  };
}

/** Records upstream calls and answers with the given response. */
function fakeFetch(respond) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { calls, fetchImpl };
}

function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const AGGREGATE = '/core-api/v3/search/works/aggregate';
const YEARS_BODY = JSON.stringify({
  q: 'drone AND (package OR delivery)',
  aggregations: ['yearPublished'],
});

async function run(handler, { method = 'GET', url = SEARCH, body = '', headers = {} } = {}) {
  const res = fakeResponse();
  const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), {
    method,
    url,
    headers,
  });
  await handler(req, res);
  return res;
}

function aggregate(handler, body = YEARS_BODY, headers = { 'content-type': 'application/json' }) {
  return run(handler, { method: 'POST', url: AGGREGATE, body, headers });
}

const silent = { error() {} };

describe('isSearchPath', () => {
  it('accepts the public search path and the function path', () => {
    assert.equal(isSearchPath('/core-api/v3/search/works/'), true);
    assert.equal(isSearchPath('/api/core-search'), true);
  });

  it('rejects every other path', () => {
    for (const path of [
      '/core-api/v3/search/works',
      '/core-api/v3/search/works/extra',
      '/core-api/v3/works/123',
      '/core-api/v3/search/outputs/',
      '/core-api/',
      '/api/core-search/',
      '/',
    ]) {
      assert.equal(isSearchPath(path), false, path);
    }
  });
});

describe('isAggregatePath', () => {
  it('accepts only the works aggregation path', () => {
    assert.equal(isAggregatePath(AGGREGATE), true);
    assert.equal(isAggregatePath(`${AGGREGATE}/`), false);
    assert.equal(isAggregatePath('/core-api/v3/search/outputs/aggregate'), false);
  });
});

describe('validateAggregateBody', () => {
  it('accepts a query with allowed aggregations and rebuilds the body', () => {
    assert.deepEqual(validateAggregateBody(YEARS_BODY), {
      ok: true,
      body: { q: 'drone AND (package OR delivery)', aggregations: ['yearPublished'] },
    });
  });

  for (const [name, text] of [
    ['invalid JSON', '{"q":'],
    ['a non-object', '["drone"]'],
    ['an unknown field', '{"q":"drone","aggregations":["yearPublished"],"limit":5}'],
    ['a missing query', '{"aggregations":["yearPublished"]}'],
    ['a blank query', '{"q":"  ","aggregations":["yearPublished"]}'],
    ['a field that is not allowed', '{"q":"drone","aggregations":["authors"]}'],
    ['no aggregations', '{"q":"drone","aggregations":[]}'],
    ['a repeated aggregation', '{"q":"drone","aggregations":["yearPublished","yearPublished"]}'],
  ]) {
    it(`rejects ${name}`, () => {
      const result = validateAggregateBody(text);
      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
    });
  }
});

describe('validateQuery', () => {
  it('accepts what the app sends', () => {
    assert.deepEqual(validateQuery('q=drone&limit=100&offset=10000&exclude=fullText'), {
      ok: true,
    });
    assert.deepEqual(validateQuery('q=%28drone%20AND%20delivery%29&sort=recency'), { ok: true });
  });

  it('requires a non-empty q', () => {
    assert.equal(validateQuery('').ok, false);
    assert.equal(validateQuery('limit=10').ok, false);
    assert.equal(validateQuery('q=%20%20').ok, false);
  });

  it('rejects unknown and repeated parameters', () => {
    assert.deepEqual(validateQuery('q=drone&scroll_id=abc'), {
      ok: false,
      status: 400,
      error: 'Unsupported query parameter: scroll_id',
    });
    assert.equal(validateQuery('q=drone&q=other').ok, false);
  });

  it('rejects limits and offsets CORE would refuse', () => {
    for (const query of [
      'q=a&limit=101',
      'q=a&limit=-1',
      'q=a&limit=ten',
      'q=a&limit=',
      'q=a&offset=10001',
      'q=a&offset=1e3',
    ]) {
      assert.equal(validateQuery(query).ok, false, query);
    }
  });

  it('rejects query strings over the length limit with 414', () => {
    const result = validateQuery(`q=${'a'.repeat(2_000)}`);
    assert.equal(result.ok, false);
    assert.equal(result.ok || result.status, 414);
  });
});

describe('buildUpstreamHeaders', () => {
  it('adds the bearer token only when a key is set', () => {
    assert.deepEqual(buildUpstreamHeaders(KEY), {
      Accept: 'application/json',
      Authorization: `Bearer ${KEY}`,
    });
    assert.deepEqual(buildUpstreamHeaders(undefined), { Accept: 'application/json' });
    assert.deepEqual(buildUpstreamHeaders('  '), { Accept: 'application/json' });
  });
});

describe('pickResponseHeaders', () => {
  it('keeps the content type and rate-limit headers only', () => {
    const picked = pickResponseHeaders(
      new Headers({
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '9',
        'X-RateLimit-Retry-After': '2026-11-20T10:00:00+0000',
        'Retry-After': '30',
        'Set-Cookie': 'session=1',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, private',
      }),
    );
    assert.deepEqual(picked, {
      'content-type': 'application/json',
      'retry-after': '30',
      'x-ratelimit-limit': '10',
      'x-ratelimit-remaining': '9',
      'x-ratelimit-retry-after': '2026-11-20T10:00:00+0000',
    });
  });
});

describe('cacheControlFor', () => {
  it('never marks a POST as cacheable', () => {
    assert.equal(cacheControlFor(200, 'POST'), NO_CACHE);
  });

  it('caches successful responses only', () => {
    assert.equal(cacheControlFor(200), SUCCESS_CACHE_CONTROL);
    for (const status of [301, 400, 401, 404, 429, 500, 502, 504]) {
      assert.equal(cacheControlFor(status), NO_CACHE, String(status));
    }
  });
});

describe('redactKey', () => {
  it('removes every occurrence of the key', () => {
    assert.equal(redactKey(`bad key ${KEY}, ${KEY}`, KEY), 'bad key [redacted], [redacted]');
    assert.equal(redactKey('nothing to hide', undefined), 'nothing to hide');
  });
});

describe('createHandler', () => {
  it('forwards the query string unchanged to the fixed search URL', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, { totalHits: 1, results: [] }));
    const handler = createHandler({ fetchImpl, getApiKey: () => undefined, log: silent });

    const res = await run(handler, { url: '/core-api/v3/search/works/?q=%28drone%29&limit=10' });

    assert.equal(res.statusCode, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${UPSTREAM_URL}?q=%28drone%29&limit=10`);
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.redirect, 'error');
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  it('works anonymously without a key', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, { results: [] }));
    const handler = createHandler({ fetchImpl, getApiKey: () => undefined, log: silent });

    const res = await run(handler);

    assert.equal('Authorization' in calls[0].init.headers, false);
    assert.equal(res.headers['x-core-auth'], 'anonymous');
  });

  it('sends the key upstream but never back to the browser', async () => {
    const { calls, fetchImpl } = fakeFetch(() =>
      json(401, { message: `Invalid key ${KEY}` }, { 'X-Echo': KEY }),
    );
    const handler = createHandler({ fetchImpl, getApiKey: () => KEY, log: silent });

    const res = await run(handler);

    assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.includes(KEY), false);
    assert.equal(JSON.stringify(res.headers).includes(KEY), false);
  });

  it('passes a success through with its rate-limit headers and CDN caching', async () => {
    const payload = { totalHits: 71213, results: [{ id: 1 }] };
    const { fetchImpl } = fakeFetch(() =>
      json(200, payload, { 'X-RateLimit-Remaining': '9', 'Set-Cookie': 'a=b' }),
    );
    const handler = createHandler({ fetchImpl, getApiKey: () => KEY, log: silent });

    const res = await run(handler);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), payload);
    assert.equal(res.headers['cache-control'], SUCCESS_CACHE_CONTROL);
    assert.equal(res.headers['content-type'], 'application/json');
    assert.equal(res.headers['x-ratelimit-remaining'], '9');
    assert.equal(res.headers['set-cookie'], undefined);
    assert.equal(res.headers['x-core-auth'], 'key');
  });

  it('passes a 429 through uncached with its retry headers', async () => {
    const { fetchImpl } = fakeFetch(() =>
      json(429, { message: 'Too many requests' }, { 'X-RateLimit-Retry-After': 'soon' }),
    );
    const handler = createHandler({ fetchImpl, getApiKey: () => undefined, log: silent });

    const res = await run(handler);

    assert.equal(res.statusCode, 429);
    assert.equal(res.headers['cache-control'], NO_CACHE);
    assert.equal(res.headers['x-ratelimit-retry-after'], 'soon');
  });

  it('turns a non-JSON upstream error into a JSON error with the same status', async () => {
    const { fetchImpl } = fakeFetch(
      () =>
        new Response('<html>Bad gateway</html>', {
          status: 503,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const handler = createHandler({ fetchImpl, getApiKey: () => undefined, log: silent });

    const res = await run(handler);

    assert.equal(res.statusCode, 503);
    assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    assert.equal(res.headers['cache-control'], NO_CACHE);
    assert.deepEqual(JSON.parse(res.body), { error: 'CORE answered 503 without JSON.' });
  });

  it('answers 504 when CORE is too slow', async () => {
    const fetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        // AbortSignal.timeout does not keep Node's event loop alive on its own; a real socket would.
        const pending = setTimeout(() => {}, 1_000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(pending);
          reject(init.signal.reason);
        });
      });
    const logged = [];
    const handler = createHandler({
      fetchImpl,
      getApiKey: () => KEY,
      timeoutMs: 10,
      log: { error: (message) => logged.push(message) },
    });

    const res = await run(handler);

    assert.equal(res.statusCode, 504);
    assert.equal(res.headers['cache-control'], NO_CACHE);
    assert.deepEqual(JSON.parse(res.body), { error: 'CORE did not respond in time.' });
    assert.deepEqual(logged, ['CORE search request failed: timeout']);
  });

  it('answers 502 on a network error without logging the key', async () => {
    const fetchImpl = async () => {
      throw new TypeError(`fetch failed for Bearer ${KEY}`);
    };
    const logged = [];
    const handler = createHandler({
      fetchImpl,
      getApiKey: () => KEY,
      log: { error: (message) => logged.push(message) },
    });

    const res = await run(handler);

    assert.equal(res.statusCode, 502);
    assert.deepEqual(JSON.parse(res.body), { error: 'Could not reach CORE.' });
    assert.equal(res.body.includes(KEY), false);
    assert.equal(logged.join('\n').includes(KEY), false);
  });

  it('rejects other methods, paths and bad queries without calling CORE', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, {}));
    const handler = createHandler({ fetchImpl, getApiKey: () => KEY, log: silent });

    const post = await run(handler, { method: 'POST' });
    assert.equal(post.statusCode, 405);
    assert.equal(post.headers.allow, 'GET');

    const head = await run(handler, { method: 'HEAD' });
    assert.equal(head.statusCode, 405);

    const otherPath = await run(handler, { url: '/core-api/v3/works/123?q=x' });
    assert.equal(otherPath.statusCode, 404);

    const badQuery = await run(handler, { url: '/core-api/v3/search/works/?q=a&callback=x' });
    assert.equal(badQuery.statusCode, 400);

    const noQuery = await run(handler, { url: '/core-api/v3/search/works/' });
    assert.equal(noQuery.statusCode, 400);

    for (const res of [post, head, otherPath, badQuery, noQuery]) {
      assert.equal(res.headers['cache-control'], NO_CACHE);
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    }
    assert.equal(calls.length, 0);
  });

  it('posts a rebuilt aggregation body to the fixed aggregation URL, uncached', async () => {
    const payload = { aggregations: { yearPublished: { 2020: 354 } } };
    const { calls, fetchImpl } = fakeFetch(() => json(200, payload));
    const handler = createHandler({ fetchImpl, getApiKey: () => KEY, log: silent });

    const res = await aggregate(handler);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), payload);
    assert.equal(res.headers['cache-control'], NO_CACHE);
    assert.equal(calls[0].url, UPSTREAM_AGGREGATE_URL);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.body, YEARS_BODY);
    assert.equal(calls[0].init.headers['Content-Type'], 'application/json');
    assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(calls[0].init.redirect, 'error');
  });

  it('rejects bad aggregation requests without calling CORE', async () => {
    const { calls, fetchImpl } = fakeFetch(() => json(200, {}));
    const handler = createHandler({ fetchImpl, getApiKey: () => KEY, log: silent });

    const get = await run(handler, { url: `${AGGREGATE}?q=drone` });
    assert.equal(get.statusCode, 405);
    assert.equal(get.headers.allow, 'POST');

    const inUrl = await run(handler, { method: 'POST', url: `${AGGREGATE}?q=drone` });
    assert.equal(inUrl.statusCode, 400);

    const notJson = await aggregate(handler, YEARS_BODY, { 'content-type': 'text/plain' });
    assert.equal(notJson.statusCode, 415);

    const tooLarge = await aggregate(handler, JSON.stringify({ q: 'x'.repeat(MAX_BODY_BYTES) }));
    assert.equal(tooLarge.statusCode, 413);

    const badField = await aggregate(handler, '{"q":"drone","aggregations":["authors"]}');
    assert.equal(badField.statusCode, 400);

    for (const res of [get, inUrl, notJson, tooLarge, badField]) {
      assert.equal(res.headers['cache-control'], NO_CACHE);
    }
    assert.equal(calls.length, 0);
  });
});
