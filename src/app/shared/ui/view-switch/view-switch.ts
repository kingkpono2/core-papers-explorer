import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export type SearchView = 'results' | 'galaxy';

/** Switches between the list of results and the Galaxy for the same query, as real links. */
@Component({
  selector: 'app-view-switch',
  imports: [RouterLink],
  templateUrl: './view-switch.html',
  styleUrl: './view-switch.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ViewSwitch {
  readonly query = input.required<string>();
  readonly current = input.required<SearchView>();
}
