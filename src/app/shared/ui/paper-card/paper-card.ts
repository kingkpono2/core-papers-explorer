import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal } from '@angular/core';
import { Paper } from '../../../core/models/paper';

const VISIBLE_AUTHORS = 3;
// Roughly three lines on a phone. Shorter abstracts are shown in full, without a toggle.
const ABSTRACT_PREVIEW_CHARS = 240;

let nextId = 0;

@Component({
  selector: 'app-paper-card',
  imports: [DecimalPipe],
  templateUrl: './paper-card.html',
  styleUrl: './paper-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaperCard {
  readonly paper = input.required<Paper>();

  protected readonly titleId = `paper-card-${nextId}-title`;
  protected readonly abstractId = `paper-card-${nextId++}-abstract`;

  protected readonly visibleAuthors = computed(() =>
    this.paper().authors.slice(0, VISIBLE_AUTHORS).join(', '),
  );
  protected readonly allAuthors = computed(() => {
    const { authors } = this.paper();
    return authors.length > VISIBLE_AUTHORS ? authors.join(', ') : null;
  });
  protected readonly publisher = computed(() => {
    const { publisher, journal } = this.paper();
    return publisher && publisher.toLowerCase() !== journal?.toLowerCase() ? publisher : null;
  });
  protected readonly abstractIsLong = computed(
    () => (this.paper().abstract?.length ?? 0) > ABSTRACT_PREVIEW_CHARS,
  );
  // Collapses again whenever the card is given a different paper.
  protected readonly abstractExpanded = linkedSignal({
    source: this.paper,
    computation: () => false,
  });
}
