import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FaultInjection } from '../../../core/diagnostics/fault-injection';
import { BreakIt } from './break-it';

describe('BreakIt', () => {
  let fixture: ComponentFixture<BreakIt>;
  let el: HTMLElement;
  let faults: FaultInjection;

  const switches = () => [...el.querySelectorAll<HTMLButtonElement>('button[role="switch"]')];
  const switchFor = (label: string) =>
    switches().find((s) => s.querySelector('.switch__label')?.textContent?.trim() === label)!;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [BreakIt],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(BreakIt);
    el = fixture.nativeElement;
    faults = TestBed.inject(FaultInjection);
    await fixture.whenStable();
  });

  it('lists every switch, off, each described by what the app should do', () => {
    expect(switches().map((s) => s.querySelector('.switch__label')?.textContent?.trim())).toEqual([
      'Rate limited',
      'Offline',
      'Slow CORE',
      'CORE rejects the query',
      'CORE unavailable',
    ]);
    for (const control of switches()) {
      expect(control.getAttribute('aria-checked')).toBe('false');
      const description = el.querySelector(`#${control.getAttribute('aria-describedby')}`);
      expect(description?.textContent).toContain('Expect');
    }
    expect(switchFor('Rate limited').id).toBe('fault-rate-limit');
  });

  it('turns a switch on and off', async () => {
    switchFor('Rate limited').click();
    await fixture.whenStable();

    expect(faults.enabled().has('rate-limit')).toBeTrue();
    expect(switchFor('Rate limited').getAttribute('aria-checked')).toBe('true');
    expect(switchFor('Rate limited').closest('li')?.classList).toContain('switch--on');

    switchFor('Rate limited').click();
    await fixture.whenStable();
    expect(faults.active()).toBeFalse();
  });

  it('offers to turn every switch off while any is on', async () => {
    const turnAllOff = () =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Turn all off');
    expect(turnAllOff()).toBeUndefined();

    switchFor('Offline').click();
    switchFor('Slow CORE').click();
    await fixture.whenStable();
    turnAllOff()!.click();
    await fixture.whenStable();

    expect(faults.active()).toBeFalse();
    expect(switches().every((s) => s.getAttribute('aria-checked') === 'false')).toBeTrue();
  });
});
