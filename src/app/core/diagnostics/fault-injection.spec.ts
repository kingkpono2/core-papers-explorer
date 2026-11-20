import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  FAULT_SWITCHES,
  FaultInjection,
  RATE_LIMITED_ATTEMPTS,
  SLOW_DELAY_MS,
} from './fault-injection';

describe('FaultInjection', () => {
  let faults: FaultInjection;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    faults = TestBed.inject(FaultInjection);
  });

  it('starts with every switch off, so nothing is sabotaged after a reload', () => {
    expect(faults.active()).toBeFalse();
    expect(faults.enabled().size).toBe(0);
    expect(faults.planFor(1)).toEqual({ delayMs: 0, failure: null });
  });

  it('keeps the switches in memory only', () => {
    const setItem = spyOn(Storage.prototype, 'setItem').and.callThrough();

    faults.set('offline', true);
    faults.set('slow', true);

    expect(setItem).not.toHaveBeenCalled();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    expect(TestBed.inject(FaultInjection).active()).toBeFalse();
  });

  it('turns switches on and off, one at a time or all at once', () => {
    faults.set('rate-limit', true);
    faults.set('slow', true);
    faults.set('slow', true);
    expect([...faults.enabled()]).toEqual(['rate-limit', 'slow']);
    expect(faults.active()).toBeTrue();

    faults.set('rate-limit', false);
    expect([...faults.enabled()]).toEqual(['slow']);

    faults.turnOff();
    expect(faults.active()).toBeFalse();
  });

  it('fails the first two attempts of each request when rate limited', () => {
    faults.set('rate-limit', true);

    expect([1, 2, 3, 4].map((attempt) => faults.planFor(attempt).failure)).toEqual([
      'rate-limit',
      'rate-limit',
      null,
      null,
    ]);
    expect(RATE_LIMITED_ATTEMPTS).toBe(2);
  });

  it('fails every attempt when offline, unavailable or rejecting queries', () => {
    for (const mode of ['offline', 'unavailable', 'rejected'] as const) {
      faults.turnOff();
      faults.set(mode, true);
      expect([1, 2, 3, 4].map((attempt) => faults.planFor(attempt).failure))
        .withContext(mode)
        .toEqual([mode, mode, mode, mode]);
    }
  });

  it('holds every attempt when slow, then lets it through', () => {
    faults.set('slow', true);

    expect(faults.planFor(1)).toEqual({ delayMs: SLOW_DELAY_MS, failure: null });
    expect(SLOW_DELAY_MS).toBe(5_000);
  });

  it('applies faults in the order a request meets them', () => {
    faults.set('slow', true);
    faults.set('rejected', true);
    faults.set('unavailable', true);
    faults.set('rate-limit', true);
    expect(faults.planFor(1)).toEqual({ delayMs: SLOW_DELAY_MS, failure: 'rate-limit' });
    expect(faults.planFor(3)).toEqual({ delayMs: SLOW_DELAY_MS, failure: 'unavailable' });

    faults.set('unavailable', false);
    expect(faults.planFor(3).failure).toBe('rejected');

    // A dead network fails at once, whatever else is on.
    faults.set('offline', true);
    expect(faults.planFor(1)).toEqual({ delayMs: 0, failure: 'offline' });
  });

  it('describes every switch in a line', () => {
    expect(FAULT_SWITCHES.map((s) => s.label)).toEqual([
      'Rate limited',
      'Offline',
      'Slow CORE',
      'CORE rejects the query',
      'CORE unavailable',
    ]);
    for (const { description } of FAULT_SWITCHES) {
      expect(description).toMatch(/Expect/);
    }
  });
});
