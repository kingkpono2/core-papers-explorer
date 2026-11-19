import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'CORE Papers Explorer',
    loadComponent: () =>
      import('./features/search/search-page/search-page').then((m) => m.SearchPage),
  },
  { path: '**', redirectTo: '' },
];
