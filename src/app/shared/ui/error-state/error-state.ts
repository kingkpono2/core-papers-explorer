import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ApiError } from '../../../core/api/api-error';

@Component({
  selector: 'app-error-state',
  templateUrl: './error-state.html',
  styleUrl: './error-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorState {
  readonly error = input.required<ApiError>();
  readonly retry = output();

  protected readonly rateLimited = computed(() => this.error().kind === 'rate-limit');
  // Repeating a rejected query would fail the same way, so it gets no retry button.
  protected readonly canRetry = computed(() => this.error().kind !== 'bad-query');
}
