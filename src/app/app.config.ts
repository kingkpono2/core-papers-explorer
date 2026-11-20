import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiKeyInterceptor } from './core/interceptors/api-key.interceptor';
import { underTheHoodInterceptor } from './core/interceptors/under-the-hood.interceptor';
import { AppTitleStrategy } from './core/routing/app-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    // Under the hood records what is actually sent, so it runs after the API key is added.
    provideHttpClient(withFetch(), withInterceptors([apiKeyInterceptor, underTheHoodInterceptor])),
  ],
};
