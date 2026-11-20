import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { UnderTheHood } from './core/diagnostics/under-the-hood';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('renders the header, main landmark and CORE credit', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('header')?.textContent).toContain('CORE Papers Explorer');
    expect(el.querySelector('main#main-content')).not.toBeNull();
    expect(el.querySelector<HTMLAnchorElement>('footer a')?.href).toBe('https://core.ac.uk/');
  });

  it('loads Under the hood the first time it opens, and closes it with Escape', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('app-hood-drawer')).toBeNull();

    const button = el.querySelector<HTMLButtonElement>('button.hood')!;
    button.click();
    await fixture.whenStable();

    const dialog = el.querySelector<HTMLDialogElement>('app-hood-drawer dialog')!;
    expect(dialog.open).toBeTrue();
    expect(document.activeElement?.id).toBe('hood-heading');

    document.activeElement!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await fixture.whenStable();

    expect(TestBed.inject(UnderTheHood).isOpen()).toBeFalse();
    expect(dialog.open).toBeFalse();
    expect(document.activeElement).toBe(button);
  });
});
