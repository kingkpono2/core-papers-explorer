import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SearchPage } from './search-page';

describe('SearchPage', () => {
  it('renders a labelled search field with an example boolean query', async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPage],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const fixture = TestBed.createComponent(SearchPage);
    await fixture.whenStable();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input#query',
    );

    expect(input?.labels?.[0]?.textContent).toContain('Keywords');
    expect(input?.placeholder).toBe('(drone AND (package OR delivery))');
  });
});
