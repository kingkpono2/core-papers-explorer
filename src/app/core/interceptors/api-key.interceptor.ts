import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CORE_API_CONFIG } from '../api/core-api.config';

/** Adds the optional CORE API key, and only to requests for the CORE API itself. */
export const apiKeyInterceptor: HttpInterceptorFn = (req, next) => {
  const { baseUrl, apiKey } = inject(CORE_API_CONFIG);
  if (!apiKey || !req.url.startsWith(`${baseUrl}/`)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${apiKey}` } }));
};
