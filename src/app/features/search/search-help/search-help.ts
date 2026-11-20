import { ChangeDetectionStrategy, Component, output } from '@angular/core';

export const HELP_EXAMPLES = [
  '(drone AND (package OR delivery))',
  'title:"machine learning" AND yearPublished>=2020',
  'climate AND (adaptation OR resilience) NOT model*',
  'coral AND reef AND yearPublished>=2015 AND yearPublished<=2020',
] as const;

export const FIELD_SNIPPETS = [
  'title:',
  'abstract:',
  'authors:',
  'yearPublished>=',
  'yearPublished<=',
  'documentType:',
  'fieldOfStudy:',
  'doi:',
] as const;

/** Reference for CORE's query syntax, with examples to run and fields to insert. */
@Component({
  selector: 'app-search-help',
  templateUrl: './search-help.html',
  styleUrl: './search-help.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'closed.emit()' },
})
export class SearchHelp {
  readonly exampleSelected = output<string>();
  readonly fieldSelected = output<string>();
  /** Escape was pressed inside the panel. */
  readonly closed = output<void>();

  protected readonly examples = HELP_EXAMPLES;
  protected readonly fields = FIELD_SNIPPETS;
  protected readonly operators = [
    ['drone AND delivery', 'Both words'],
    ['drone OR uav', 'Either word'],
    ['drone delivery', 'Either word too: CORE joins words with OR unless told otherwise'],
    ['drone NOT military', 'Drone papers that do not mention military (or drone -military)'],
    ['(package OR parcel) AND drone', 'Brackets group parts of the query'],
    ['"drone delivery"', 'The exact phrase'],
    ['dron*', 'Words starting with dron: drone, drones, droning'],
  ] as const;
}
