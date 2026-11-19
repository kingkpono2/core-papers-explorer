import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder shaped like a paper card. Decorative only: the page announces loading itself. */
@Component({
  selector: 'app-skeleton-card',
  templateUrl: './skeleton-card.html',
  styleUrl: './skeleton-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class SkeletonCard {}
