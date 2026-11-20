import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { RetryPolicy } from './retry-transient';

/** CORE answers `400` for `limit` above 100 or `offset` above 10,000 (checked November 2026). */
export const CORE_MAX_LIMIT = 100;
export const CORE_MAX_OFFSET = 10_000;

/**
 * The two endpoints the app uses, below the base URL. The trailing slash on the search path matters:
 * without it CORE answers with a 301 that costs a rate-limit token.
 */
export const SEARCH_PATH = '/search/works/';
export const AGGREGATE_PATH = '/search/works/aggregate';

export interface CoreApiConfig {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  retry: RetryPolicy;
}

export const CORE_API_CONFIG = new InjectionToken<CoreApiConfig>('CORE_API_CONFIG', {
  providedIn: 'root',
  factory: () => ({
    baseUrl: environment.coreApiBaseUrl,
    apiKey: environment.coreApiKey,
    // Cold searches on CORE have taken up to 45 s; 30 s covers most of them without a frozen page.
    timeoutMs: 30_000,
    retry: { maxRetries: 3, baseDelayMs: 1_000, maxTotalDelayMs: 10_000 },
  }),
});
