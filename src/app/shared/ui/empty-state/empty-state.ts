import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

let nextId = 0;

/** A centred message for "nothing to show yet" and "nothing found", with optional example queries. */
@Component({
  selector: 'app-empty-state',
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmptyState {
  readonly heading = input.required<string>();
  readonly examples = input<readonly string[]>([]);
  readonly exampleSelected = output<string>();

  protected readonly examplesLabelId = `empty-state-examples-${nextId++}`;
}
