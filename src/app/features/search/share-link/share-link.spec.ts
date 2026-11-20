import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShareLink } from './share-link';

describe('ShareLink', () => {
  let fixture: ComponentFixture<ShareLink>;
  let el: HTMLElement;
  let writeText: jasmine.Spy;

  const button = () => el.querySelector('button')!;
  const status = () => el.querySelector('[role="status"]')?.textContent?.trim();

  const create = async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ShareLink);
    el = fixture.nativeElement;
    await fixture.whenStable();
  };

  const click = async () => {
    button().click();
    // Let the share or clipboard promise settle.
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  };

  beforeEach(() => {
    writeText = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
  });

  describe('without a share sheet', () => {
    let share: PropertyDescriptor | undefined;

    beforeEach(async () => {
      share = Object.getOwnPropertyDescriptor(Navigator.prototype, 'share');
      if (share) {
        delete (Navigator.prototype as Partial<Navigator>).share;
      }
      await create();
    });

    afterEach(() => {
      if (share) {
        Object.defineProperty(Navigator.prototype, 'share', share);
      }
    });

    it('copies the address of the page and confirms it', async () => {
      expect(button().textContent?.trim()).toBe('Copy link');

      await click();

      expect(writeText).toHaveBeenCalledOnceWith(location.href);
      expect(button().textContent?.trim()).toBe('Link copied');
      expect(status()).toBe('Link to this search copied');
    });

    it('says so when the clipboard is not available', async () => {
      writeText.and.rejectWith(new DOMException('Denied', 'NotAllowedError'));

      await click();

      expect(button().textContent?.trim()).toBe('Could not copy');
      expect(status()).toContain('Copy it from the address bar');
    });
  });

  describe('with a share sheet', () => {
    let share: jasmine.Spy;

    beforeEach(async () => {
      share = jasmine.createSpy('share').and.resolveTo();
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      await create();
    });

    afterEach(() => delete (navigator as Partial<Navigator>).share);

    it('shares the title and address of the page', async () => {
      expect(button().textContent?.trim()).toBe('Share');

      await click();

      expect(share).toHaveBeenCalledOnceWith({ title: document.title, url: location.href });
      expect(writeText).not.toHaveBeenCalled();
    });

    it('does nothing more when the user closes the share sheet', async () => {
      share.and.rejectWith(new DOMException('Cancelled', 'AbortError'));

      await click();

      expect(writeText).not.toHaveBeenCalled();
      expect(status()).toBe('');
    });

    it('falls back to copying when sharing fails', async () => {
      share.and.rejectWith(new DOMException('Not allowed', 'NotAllowedError'));

      await click();

      expect(writeText).toHaveBeenCalledOnceWith(location.href);
    });
  });
});
