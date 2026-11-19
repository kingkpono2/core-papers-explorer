import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CORE_API_CONFIG, CoreApiConfig } from '../api/core-api.config';
import { CoreApiService } from '../api/core-api.service';
import { apiKeyInterceptor } from './api-key.interceptor';

describe('apiKeyInterceptor', () => {
  const searchUrl = '/core-api/v3/search/works/';
  let controller: HttpTestingController;

  const configure = (apiKey: string, baseUrl = '/core-api/v3') => {
    const config: CoreApiConfig = {
      baseUrl,
      apiKey,
      timeoutMs: 15_000,
      retry: { maxRetries: 0, baseDelayMs: 0, maxTotalDelayMs: 0 },
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([apiKeyInterceptor])),
        provideHttpClientTesting(),
        { provide: CORE_API_CONFIG, useValue: config },
      ],
    });
    controller = TestBed.inject(HttpTestingController);
  };

  const authorizationHeader = (url: string) => {
    const req = controller.expectOne((request) => request.url === url);
    req.flush({ totalHits: 0, limit: 10, offset: 0, results: [] });
    return req.request.headers.get('Authorization');
  };

  afterEach(() => controller.verify());

  it('adds the bearer key to CORE API requests when a key is configured', () => {
    configure('secret');
    TestBed.inject(CoreApiService).searchWorks({ query: 'drone', limit: 10 }).subscribe();

    expect(authorizationHeader(searchUrl)).toBe('Bearer secret');
  });

  it('sends no Authorization header when no key is configured', () => {
    configure('');
    TestBed.inject(CoreApiService).searchWorks({ query: 'drone', limit: 10 }).subscribe();

    expect(authorizationHeader(searchUrl)).toBeNull();
  });

  it('never sends the key to other hosts or paths', () => {
    configure('secret');
    const http = TestBed.inject(HttpClient);
    const others = [
      'https://example.com/core-api/v3/search/works/',
      '//example.com/core-api/v3/search/works/',
      '/core-api/v3x/search/works/',
      '/elsewhere/core-api/v3/search/works/',
    ];
    others.forEach((url) => http.get(url).subscribe());

    others.forEach((url) => expect(authorizationHeader(url)).withContext(url).toBeNull());
  });

  it('also works with an absolute base URL', () => {
    configure('secret', 'https://api.test/v3');
    const http = TestBed.inject(HttpClient);
    http.get('https://api.test/v3/search/works/').subscribe();
    http.get('https://api.test.example.com/v3/search/works/').subscribe();

    expect(authorizationHeader('https://api.test/v3/search/works/')).toBe('Bearer secret');
    expect(authorizationHeader('https://api.test.example.com/v3/search/works/')).toBeNull();
  });
});
