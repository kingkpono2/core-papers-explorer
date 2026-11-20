import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const APP_TITLE = 'CORE Papers Explorer';

/** Puts the search first in the tab title, as in "drone — CORE Papers Explorer". */
@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const base = this.buildTitle(snapshot) ?? APP_TITLE;
    const query = snapshot.root.queryParamMap.get('q')?.trim();
    this.title.setTitle(query ? `${query} — ${base}` : base);
  }
}
