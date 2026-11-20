import { Routes } from '@angular/router';
import { APP_TITLE } from './core/routing/app-title-strategy';

export const routes: Routes = [
  {
    path: '',
    title: APP_TITLE,
    loadComponent: () =>
      import('./features/search/search-page/search-page').then((m) => m.SearchPage),
  },
  { path: '**', redirectTo: '' },
];
