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
    // The compare page has several queries: "drone vs robots — Compare trends — ...".
    const query = snapshot.root.queryParamMap
      .getAll('q')
      .map((q) => q.trim())
      .filter(Boolean)
      .join(' vs ');
    this.title.setTitle(query ? `${query} — ${base}` : base);
  }
}
