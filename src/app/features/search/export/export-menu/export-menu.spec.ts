import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { makePaper } from '../../../../../testing/paper.fixture';
import { FileDownload } from '../file-download';
import { ExportMenu } from './export-menu';

describe('ExportMenu', () => {
  let fixture: ComponentFixture<ExportMenu>;
  let el: HTMLElement;
  let save: jasmine.Spy<FileDownload['save']>;

  const toggle = () => el.querySelector<HTMLButtonElement>('button[aria-controls]')!;
  const options = () => el.querySelector<HTMLElement>('#export-options')!;
  const option = (name: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('.option')].find((b) =>
      b.textContent?.includes(name),
    )!;

  beforeEach(async () => {
    save = jasmine.createSpy('save');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: FileDownload, useValue: { save } }],
    });
    fixture = TestBed.createComponent(ExportMenu);
    fixture.componentRef.setInput('papers', [
      makePaper({ title: 'Drone delivery', authors: ['Doe, Jane'], year: 2020 }),
    ]);
    fixture.componentRef.setInput('query', 'drone delivery');
    fixture.componentRef.setInput('page', 2);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  });

  afterEach(() => el.remove());

  const openMenu = async () => {
    toggle().click();
    await fixture.whenStable();
  };

  it('opens and closes the options with the toggle', async () => {
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(options().hidden).toBeTrue();

    await openMenu();
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(options().hidden).toBeFalse();
    expect(options().textContent).toContain('This page (1 paper)');

    await openMenu();
    expect(options().hidden).toBeTrue();
  });

  it('saves the page as CSV', async () => {
    await openMenu();
    option('CSV').click();
    await fixture.whenStable();

    const [name, content, type] = save.calls.mostRecent().args;
    expect(name).toBe('core-papers-drone-delivery-page-2.csv');
    expect(type).toBe('text/csv;charset=utf-8');
    expect(content).toMatch(/^\uFEFFTitle,Authors,/);
    expect(content).toContain('Drone delivery,"Doe, Jane",2020');
    expect(options().hidden).toBeTrue();
    expect(document.activeElement).toBe(toggle());
  });

  it('saves the page as BibTeX', async () => {
    await openMenu();
    option('BibTeX').click();

    const [name, content, type] = save.calls.mostRecent().args;
    expect(name).toBe('core-papers-drone-delivery-page-2.bib');
    expect(type).toBe('application/x-bibtex;charset=utf-8');
    expect(content).toMatch(/^@misc\{doe2020,/);
  });

  it('closes on Escape, returning focus to the toggle', async () => {
    await openMenu();
    option('CSV').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();

    expect(options().hidden).toBeTrue();
    expect(document.activeElement).toBe(toggle());
  });

  it('closes on a click elsewhere on the page', async () => {
    await openMenu();
    document.body.click();
    await fixture.whenStable();

    expect(options().hidden).toBeTrue();
    expect(save).not.toHaveBeenCalled();
  });
});
