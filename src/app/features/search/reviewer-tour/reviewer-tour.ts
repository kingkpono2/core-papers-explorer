import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UnderTheHood } from '../../../core/diagnostics/under-the-hood';
import { COMPARE_EXAMPLES } from '../../compare/compare-params';

/** The example query from the brief, which CORE gets wrong unless the app adjusts it. */
export const BRIEF_EXAMPLE = '(drone AND (package OR delivery))';

/**
 * A short guided tour for someone assessing the app, shown on the start screen only. Each step is
 * one click; the page decides when to show it and handles opening the help.
 */
@Component({
  selector: 'app-reviewer-tour',
  imports: [RouterLink],
  templateUrl: './reviewer-tour.html',
  styleUrl: './reviewer-tour.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReviewerTour {
  readonly helpRequested = output<void>();
  readonly dismissed = output<void>();

  private readonly hood = inject(UnderTheHood);

  protected readonly example = BRIEF_EXAMPLE;
  protected readonly comparison = COMPARE_EXAMPLES[0];

  /** Opens Under the hood on the Rate limited switch, ready to be turned on. */
  protected breakIt(button: HTMLElement): void {
    this.hood.open(button, 'rate-limit');
  }
}
