import { ChangeDetectionStrategy, Component } from '@angular/core';
import { IsActiveMatchOptions, RouterLink, RouterLinkActive } from '@angular/router';
import { ThemeToggle } from '../theme-toggle/theme-toggle';

@Component({
  selector: 'app-site-header',
  imports: [RouterLink, RouterLinkActive, ThemeToggle],
  templateUrl: './site-header.html',
  styleUrl: './site-header.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SiteHeader {
  /** "Search" is current on the search page, whatever the search. */
  protected readonly exactPath: IsActiveMatchOptions = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored',
  };
}
