import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CORE_API_CONFIG } from './core-api.config';

describe('CORE_API_CONFIG', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('defaults to the same-origin proxy path, so the browser never calls CORE cross-origin', () => {
    const config = TestBed.inject(CORE_API_CONFIG);

    expect(config.baseUrl).toBe('/core-api/v3');
  });
});
