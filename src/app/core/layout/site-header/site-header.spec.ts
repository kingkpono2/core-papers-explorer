import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FaultInjection } from '../../diagnostics/fault-injection';
import { UnderTheHood } from '../../diagnostics/under-the-hood';
import { SiteHeader } from './site-header';

describe('SiteHeader', () => {
  let fixture: ComponentFixture<SiteHeader>;
  let el: HTMLElement;
  let hood: UnderTheHood;

  const hoodButton = () => el.querySelector<HTMLButtonElement>('button.hood')!;
  const press = async (target: Element, init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    await fixture.whenStable();
    return event;
  };
  const shiftD = (target: Element = document.body) => press(target, { key: 'D', shiftKey: true });
  const field = (html: string) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
    return wrapper;
  };

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    fixture = TestBed.createComponent(SiteHeader);
    el = fixture.nativeElement;
    hood = TestBed.inject(UnderTheHood);
    await fixture.whenStable();
  });

  it('has an Under the hood button that says it opens a dialog, and its shortcut', () => {
    expect(hoodButton().textContent?.trim()).toBe('Under the hood');
    expect(hoodButton().getAttribute('aria-haspopup')).toBe('dialog');
    expect(hoodButton().getAttribute('aria-keyshortcuts')).toBe('Shift+D');
  });

  it('opens Under the hood from the button, which gets focus back later', async () => {
    hoodButton().click();
    await fixture.whenStable();

    expect(hood.isOpen()).toBeTrue();
    hood.close();
    hood.restoreFocus();
    expect(document.activeElement).toBe(hoodButton());
  });

  it('opens and closes Under the hood with Shift+D', async () => {
    const event = await shiftD();
    expect(event.defaultPrevented).toBeTrue();
    expect(hood.isOpen()).toBeTrue();

    await shiftD();
    expect(hood.isOpen()).toBeFalse();
  });

  it('returns focus to what had it when Shift+D was pressed, or else to the button', async () => {
    const page = field('<button type="button">Page button</button>');
    const button = page.querySelector('button')!;
    button.focus();
    await shiftD(button);
    hood.close();
    hood.restoreFocus();
    expect(document.activeElement).toBe(button);

    button.blur();
    await shiftD();
    hood.close();
    hood.restoreFocus();
    expect(document.activeElement).toBe(hoodButton());
    page.remove();
  });

  it('ignores Shift+D while the user is typing', async () => {
    const page = field(`
      <input type="text" />
      <input type="search" />
      <textarea></textarea>
      <select><option>One</option></select>
      <div contenteditable="true">Notes</div>
    `);

    for (const target of page.querySelectorAll('input, textarea, select, [contenteditable]')) {
      const event = await shiftD(target);
      expect(event.defaultPrevented).withContext(target.outerHTML).toBeFalse();
      expect(hood.isOpen()).withContext(target.outerHTML).toBeFalse();
    }
    page.remove();
  });

  it('still answers Shift+D on a switch or checkbox, which take no typing', async () => {
    const page = field('<input type="checkbox" />');

    await shiftD(page.querySelector('input')!);

    expect(hood.isOpen()).toBeTrue();
    page.remove();
  });

  it('ignores D without Shift, and Shift+D with another modifier', async () => {
    await press(document.body, { key: 'd' });
    await press(document.body, { key: 'D', shiftKey: true, ctrlKey: true });
    await press(document.body, { key: 'D', shiftKey: true, metaKey: true });
    await press(document.body, { key: 'D', shiftKey: true, altKey: true });

    expect(hood.isOpen()).toBeFalse();
  });

  it('marks the button while fault injection is on', async () => {
    expect(hoodButton().querySelector('.hood__faults')).toBeNull();

    TestBed.inject(FaultInjection).set('offline', true);
    await fixture.whenStable();

    expect(hoodButton().querySelector('.hood__faults')).not.toBeNull();
    expect(hoodButton().textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Under the hood, fault injection on',
    );
  });
});
