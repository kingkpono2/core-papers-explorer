export interface AppEnvironment {
  production: boolean;
  /**
   * Same-origin path that is proxied to https://api.core.ac.uk: by the dev server locally
   * (proxy.conf.json) and by a Vercel rewrite in production (vercel.json). CORE's CORS policy only
   * allows localhost and core.ac.uk origins, so the browser cannot call the API directly.
   */
  coreApiBaseUrl: string;
  /** Optional CORE API key. Leave empty to use the anonymous rate limit. */
  coreApiKey: string;
}
