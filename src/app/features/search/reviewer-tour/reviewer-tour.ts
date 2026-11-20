import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  protected readonly example = BRIEF_EXAMPLE;
  protected readonly comparison = COMPARE_EXAMPLES[0];
}
