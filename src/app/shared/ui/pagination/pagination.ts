import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  Signal,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { pageItems } from './page-items';

/**
 * Page links for the current route. Each page is a real link that only changes the `page` query
 * param, so pages can be opened in a new tab and Back/Forward step through them.
 */
@Component({
  selector: 'app-pagination',
  imports: [DecimalPipe, RouterLink],
  templateUrl: './pagination.html',
  styleUrl: './pagination.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Pagination {
  readonly page = input.required<number>();
  readonly lastPage = input.required<number>();

  protected readonly compact = mediaMatches('(max-width: 30rem)');
  protected readonly items = computed(() =>
    pageItems(this.page(), this.lastPage(), this.compact() ? 0 : 1),
  );

  protected queryParams(page: number): Params {
    return { page: page > 1 ? page : null };
  }
}

function mediaMatches(query: string): Signal<boolean> {
  const list = inject(DOCUMENT).defaultView?.matchMedia(query);
  const matches = signal(list?.matches ?? false);
  const update = (event: MediaQueryListEvent) => matches.set(event.matches);
  list?.addEventListener('change', update);
  inject(DestroyRef).onDestroy(() => list?.removeEventListener('change', update));
  return matches.asReadonly();
}
