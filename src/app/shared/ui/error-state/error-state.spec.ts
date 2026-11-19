import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiError, ApiErrorKind } from '../../../core/api/api-error';
import { ErrorState } from './error-state';

describe('ErrorState', () => {
  let fixture: ComponentFixture<ErrorState>;
  let el: HTMLElement;

  const render = async (kind: ApiErrorKind) => {
    fixture.componentRef.setInput('error', new ApiError(kind));
    await fixture.whenStable();
  };
  const retryButton = () => el.querySelector<HTMLButtonElement>('button');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ErrorState],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(ErrorState);
    el = fixture.nativeElement;
  });

  it('shows the error message in an alert and emits retry', async () => {
    await render('network');
    const retried = jasmine.createSpy('retry');
    fixture.componentInstance.retry.subscribe(retried);

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Search failed');
    expect(alert?.textContent).toContain(new ApiError('network').message);

    retryButton()?.click();

    expect(retried).toHaveBeenCalledTimes(1);
  });

  it('uses rate-limit wording when CORE is throttling', async () => {
    await render('rate-limit');

    expect(el.querySelector('.heading')?.textContent).toBe('Too many searches');
    expect(el.textContent).toContain('limiting how often we can search');
    expect(retryButton()).not.toBeNull();
  });

  it('offers no retry for a query CORE rejected', async () => {
    await render('bad-query');

    expect(retryButton()).toBeNull();
  });
});
