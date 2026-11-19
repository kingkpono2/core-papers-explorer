import {
  ChangeDetectionStrategy,
  Component,
  provideZonelessChangeDetection,
  signal,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmptyState } from './empty-state';

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state
      heading="No papers found"
      [examples]="examples()"
      (exampleSelected)="picked.set($event)"
    >
      Try broader keywords.
    </app-empty-state>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly examples = signal<string[]>([]);
  readonly picked = signal<string | null>(null);
}

describe('EmptyState', () => {
  let fixture: ComponentFixture<Host>;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    el = fixture.nativeElement;
  });

  it('shows the heading and the projected message without examples', async () => {
    await fixture.whenStable();

    expect(el.querySelector('.heading')?.textContent).toBe('No papers found');
    expect(el.querySelector('.message')?.textContent?.trim()).toBe('Try broader keywords.');
    expect(el.querySelector('.examples')).toBeNull();
  });

  it('emits the example that was clicked', async () => {
    fixture.componentInstance.examples.set(['drone', 'solar energy']);
    await fixture.whenStable();
    const chips = el.querySelectorAll<HTMLButtonElement>('.examples button');

    expect([...chips].map((chip) => chip.textContent?.trim())).toEqual(['drone', 'solar energy']);

    chips[1].click();

    expect(fixture.componentInstance.picked()).toBe('solar energy');
  });
});
