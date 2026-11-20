// Vercel Node.js function: GET /core-api/v3/search/works/?q=... is rewritten here by vercel.json.
// It forwards the search to CORE with the server-side CORE_API_KEY, if set, and lets Vercel's CDN
// cache successful answers. See api/_lib/core-search.mjs.
import { createHandler } from './_lib/core-search.mjs';

export default createHandler();
