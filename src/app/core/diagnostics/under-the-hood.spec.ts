import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UnderTheHood } from './under-the-hood';

describe('UnderTheHood', () => {
  let hood: UnderTheHood;
  let opener: HTMLButtonElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    hood = TestBed.inject(UnderTheHood);
    opener = document.createElement('button');
    document.body.appendChild(opener);
  });

  afterEach(() => opener.remove());

  it('starts closed', () => {
    expect(hood.isOpen()).toBeFalse();
    expect(hood.focusTarget()).toBeNull();
  });

  it('opens with a switch to focus, and gives focus back to its opener once closed', () => {
    hood.open(opener, 'rate-limit');
    expect(hood.isOpen()).toBeTrue();
    expect(hood.focusTarget()).toBe('rate-limit');

    hood.close();
    expect(hood.isOpen()).toBeFalse();
    hood.restoreFocus();

    expect(document.activeElement).toBe(opener);
    expect(hood.focusTarget()).toBeNull();
  });

  it('keeps the first opener if asked to open again while open', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    hood.open(opener);
    hood.open(other, 'offline');
    hood.close();
    hood.restoreFocus();

    expect(document.activeElement).toBe(opener);
    other.remove();
  });

  it('toggles', () => {
    hood.toggle(opener);
    expect(hood.isOpen()).toBeTrue();
    hood.toggle(opener);
    expect(hood.isOpen()).toBeFalse();
  });

  it('does not focus an opener that has left the page', () => {
    hood.open(opener);
    opener.remove();
    hood.close();

    expect(() => hood.restoreFocus()).not.toThrow();
    expect(document.activeElement).not.toBe(opener);
  });
});
