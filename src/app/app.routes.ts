import { Routes } from '@angular/router';
import { APP_TITLE } from './core/routing/app-title-strategy';

export const routes: Routes = [
  {
    path: '',
    title: APP_TITLE,
    loadComponent: () =>
      import('./features/search/search-page/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'compare',
    title: `Compare trends — ${APP_TITLE}`,
    loadComponent: () =>
      import('./features/compare/compare-page/compare-page').then((m) => m.ComparePage),
  },
  {
    path: 'galaxy',
    title: `Research galaxy — ${APP_TITLE}`,
    loadComponent: () =>
      import('./features/galaxy/galaxy-page/galaxy-page').then((m) => m.GalaxyPage),
  },
  { path: '**', redirectTo: '' },
];
