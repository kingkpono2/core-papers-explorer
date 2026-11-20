import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RequestLogEntry } from '../../../core/diagnostics/request-log';
import { sessionStats } from '../request-stats';
import { formatMs } from '../timeline';

/** The session's figures: requests, latency, errors, caching and CORE's rate-limit budget. */
@Component({
  selector: 'app-hood-stats',
  templateUrl: './hood-stats.html',
  styleUrl: './hood-stats.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HoodStats {
  /** Newest first, as the request log lists them. */
  readonly entries = input.required<readonly RequestLogEntry[]>();

  protected readonly stats = computed(() => sessionStats(this.entries()));

  /** The budget as a share, with the severity its fill shows, like a fuel gauge. */
  protected readonly budget = computed(() => {
    const budget = this.stats().budget;
    if (!budget) {
      return null;
    }
    const share = budget.remaining / budget.limit;
    const level = share > 0.5 ? 'plenty' : share > 0.2 ? 'low' : 'critical';
    return { ...budget, percent: share * 100, level };
  });

  protected ms(value: number | null): string {
    return value === null ? '—' : formatMs(value);
  }

  protected percent(value: number | null): string {
    return value === null ? '—' : `${Math.round(value * 100)}%`;
  }
}
