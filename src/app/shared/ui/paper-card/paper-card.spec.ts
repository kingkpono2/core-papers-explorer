import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Paper } from '../../../core/models/paper';
import { makePaper } from '../../../../testing/paper.fixture';
import { PaperCard } from './paper-card';

describe('PaperCard', () => {
  let fixture: ComponentFixture<PaperCard>;
  let el: HTMLElement;

  const text = (selector: string) => el.querySelector(selector)?.textContent?.trim() ?? null;
  const link = (name: string) =>
    [...el.querySelectorAll<HTMLAnchorElement>('a')].find((a) => a.textContent?.includes(name));

  const render = async (overrides: Partial<Paper> = {}) => {
    fixture.componentRef.setInput('paper', makePaper(overrides));
    await fixture.whenStable();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PaperCard],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(PaperCard);
    el = fixture.nativeElement;
  });

  it('renders the paper details', async () => {
    await render({
      title: 'Drone delivery',
      authors: ['Ada Lovelace', 'Alan Turing'],
      year: 2021,
      publishedDate: '2021-03-15',
      journal: 'Journal of Drones',
      publisher: 'Elsevier',
      citationCount: 1204,
      documentType: 'research',
      language: 'English',
      abstract: 'A short abstract.',
    });

    expect(el.querySelector('article h3')?.textContent).toContain('Drone delivery');
    expect(text('.authors')).toBe('Ada Lovelace, Alan Turing');
    expect(el.querySelector('time')?.getAttribute('datetime')).toBe('2021-03-15');
    const meta = [...el.querySelectorAll('.meta li')].map((li) => li.textContent?.trim());
    expect(meta).toEqual(['2021', 'Journal of Drones', 'Elsevier', '1,204 citations']);
    const tags = [...el.querySelectorAll('.tag')].map((tag) => tag.textContent?.trim());
    expect(tags).toEqual(['research', 'English']);
    expect(text('.abstract')).toBe('A short abstract.');
  });

  it('leaves out missing fields instead of showing placeholders', async () => {
    await render({ title: 'Bare paper', citationCount: 0 });

    for (const selector of ['.authors', '.meta', '.abstract', '.toggle', '.tags']) {
      expect(el.querySelector(selector)).withContext(selector).toBeNull();
    }
    expect(link('DOI')).toBeUndefined();
    expect(link('Full text')).toBeUndefined();
    expect(link('View on CORE')).toBeDefined();
    expect(el.textContent).not.toMatch(/null|undefined/);
  });

  it('does not repeat a publisher that matches the journal', async () => {
    await render({ journal: 'Drones', publisher: 'drones' });

    expect(el.querySelectorAll('.meta li').length).toBe(1);
  });

  it('shows three authors and "et al." with the full list in the title', async () => {
    const authors = ['A. One', 'B. Two', 'C. Three', 'D. Four'];
    await render({ authors });

    expect(text('.authors')).toMatch(/^A\. One, B\. Two, C\. Three\s+et al\.$/);
    expect(el.querySelector('.authors')?.getAttribute('title')).toBe(authors.join(', '));

    await render({ authors: authors.slice(0, 3) });

    expect(text('.authors')).toBe('A. One, B. Two, C. Three');
    expect(el.querySelector('.authors')?.hasAttribute('title')).toBeFalse();
  });

  it('clamps a long abstract behind a toggle', async () => {
    await render({ abstract: 'word '.repeat(100) });
    const abstract = el.querySelector<HTMLElement>('.abstract')!;
    const toggle = el.querySelector<HTMLButtonElement>('button.toggle')!;

    expect(toggle.getAttribute('aria-controls')).toBe(abstract.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent?.trim()).toBe('Show more');
    expect(abstract.classList).toContain('abstract--clamped');

    toggle.click();
    await fixture.whenStable();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(toggle.textContent?.trim()).toBe('Show less');
    expect(abstract.classList).not.toContain('abstract--clamped');
  });

  it('opens every link in a new tab without exposing window.opener', async () => {
    await render({
      title: 'Linked paper',
      sourceUrl: 'https://core.ac.uk/works/1',
      doi: '10.1/x',
      doiUrl: 'https://doi.org/10.1/x',
      downloadUrl: 'https://core.ac.uk/download/1.pdf',
    });

    expect(link('Linked paper')?.href).toBe('https://core.ac.uk/works/1');
    expect(link('DOI')?.href).toBe('https://doi.org/10.1/x');
    expect(link('Full text (PDF)')?.href).toBe('https://core.ac.uk/download/1.pdf');
    expect(link('View on CORE')?.href).toBe('https://core.ac.uk/works/1');
    for (const a of el.querySelectorAll('a')) {
      expect(a.target).toBe('_blank');
      expect(a.relList).toContain('noopener');
    }
  });
});
