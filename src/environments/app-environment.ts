export interface AppEnvironment {
  production: boolean;
  coreApiBaseUrl: string;
  /** Optional CORE API key. Leave empty to use the anonymous rate limit. */
  coreApiKey: string;
}
