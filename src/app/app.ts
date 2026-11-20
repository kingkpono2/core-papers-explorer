import {
  ChangeDetectionStrategy,
  Component,
  PendingTasks,
  ViewContainerRef,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { UnderTheHood } from './core/diagnostics/under-the-hood';
import { FaultBanner } from './core/layout/fault-banner/fault-banner';
import { SiteFooter } from './core/layout/site-footer/site-footer';
import { SiteHeader } from './core/layout/site-header/site-header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteHeader, FaultBanner, SiteFooter],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly hood = inject(UnderTheHood);
  private readonly pendingTasks = inject(PendingTasks);
  private readonly drawerHost = viewChild.required('drawerHost', { read: ViewContainerRef });
  private drawerLoaded = false;

  constructor() {
    // The Under the hood drawer is loaded the first time it opens, so the app pays nothing for it
    // until then. If it cannot be loaded, it closes again, so the button still works next time.
    effect(() => {
      if (this.hood.isOpen() && !this.drawerLoaded) {
        this.drawerLoaded = true;
        void this.pendingTasks.run(async () => {
          try {
            const { HoodDrawer } =
              await import('./features/under-the-hood/hood-drawer/hood-drawer');
            this.drawerHost().createComponent(HoodDrawer);
          } catch {
            this.drawerLoaded = false;
            this.hood.close();
          }
        });
      }
    });
  }
}
