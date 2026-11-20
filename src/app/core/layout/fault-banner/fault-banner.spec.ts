import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FaultInjection } from '../../diagnostics/fault-injection';
import { FAULT_BANNER_OFFSET, FaultBanner } from './fault-banner';

describe('FaultBanner', () => {
  let fixture: ComponentFixture<FaultBanner>;
  let el: HTMLElement;
  let faults: FaultInjection;

  const banner = () => el.querySelector<HTMLElement>('section[aria-label="Fault injection"]');
  const offset = () => document.documentElement.style.getPropertyValue(FAULT_BANNER_OFFSET);
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(FaultBanner);
    el = fixture.nativeElement;
    faults = TestBed.inject(FaultInjection);
    await fixture.whenStable();
  });

  afterEach(() => {
    fixture.destroy();
    document.documentElement.style.removeProperty(FAULT_BANNER_OFFSET);
  });

  it('is not shown while every switch is off', () => {
    expect(banner()).toBeNull();
  });

  it('says requests are being sabotaged, and by which switches, while any is on', async () => {
    faults.set('slow', true);
    faults.set('rate-limit', true);
    await fixture.whenStable();

    const text = banner()?.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('Fault injection on — requests are being sabotaged');
    expect(text).toContain('(Rate limited, Slow CORE)');
  });

  it('turns every switch off in one click, and moves focus to the page', async () => {
    const main = document.createElement('main');
    main.id = 'main-content';
    main.tabIndex = -1;
    document.body.appendChild(main);
    faults.set('offline', true);
    faults.set('unavailable', true);
    await fixture.whenStable();

    const off = banner()!.querySelector('button')!;
    expect(off.textContent?.trim()).toBe('Turn off');
    expect(off.getAttribute('aria-label')).toBe('Turn off fault injection');
    off.click();
    await fixture.whenStable();

    expect(faults.active()).toBeFalse();
    expect(banner()).toBeNull();
    expect(document.activeElement).toBe(main);
    main.remove();
  });

  it('gives its height to other sticky content while it is shown', async () => {
    faults.set('offline', true);
    await fixture.whenStable();
    await frame();
    await frame();

    expect(parseFloat(offset())).toBe(banner()!.offsetHeight);
    expect(banner()!.offsetHeight).toBeGreaterThan(0);

    faults.turnOff();
    await fixture.whenStable();
    expect(offset()).toBe('');
  });
});
