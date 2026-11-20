import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { TitleStrategy, provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { apiKeyInterceptor } from './core/interceptors/api-key.interceptor';
import { AppTitleStrategy } from './core/routing/app-title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideHttpClient(withFetch(), withInterceptors([apiKeyInterceptor])),
  ],
};
