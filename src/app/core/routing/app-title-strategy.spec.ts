import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { routes } from '../../app.routes';
import { APP_TITLE, AppTitleStrategy } from './app-title-strategy';

describe('AppTitleStrategy', () => {
  let router: Router;
  const title = () => TestBed.inject(Title).getTitle();

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: TitleStrategy, useClass: AppTitleStrategy },
      ],
    });
    router = TestBed.inject(Router);
  });

  it('shows the app name without a search', async () => {
    await router.navigateByUrl('/');
    expect(title()).toBe(APP_TITLE);
  });

  it('puts the search first and follows it as it changes', async () => {
    await router.navigateByUrl('/?q=drone%20AND%20delivery&size=10');
    expect(title()).toBe('drone AND delivery — CORE Papers Explorer');

    await router.navigateByUrl('/?q=%20%20');
    expect(title()).toBe(APP_TITLE);
  });

  it('sends unknown paths to the search page', async () => {
    await router.navigateByUrl('/no/such/page');

    expect(router.url).toBe('/');
    expect(title()).toBe(APP_TITLE);
  });
});
