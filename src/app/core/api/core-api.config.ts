import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { RetryPolicy } from './retry-transient';

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
