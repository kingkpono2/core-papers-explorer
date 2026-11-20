import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import {
  FAULT_SWITCHES,
  FaultInjection,
  FaultMode,
} from '../../../core/diagnostics/fault-injection';

/** The Break it switches, each with what it does and what the app should do about it. */
@Component({
  selector: 'app-break-it',
  templateUrl: './break-it.html',
  styleUrl: './break-it.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BreakIt {
  protected readonly faults = inject(FaultInjection);
  protected readonly switches = FAULT_SWITCHES;

  protected toggle(mode: FaultMode): void {
    this.faults.set(mode, !this.faults.enabled().has(mode));
  }
}
