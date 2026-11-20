import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyTheme, storedTheme } from './app/core/theme/theme-preference';

applyTheme(document.documentElement, storedTheme());

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
