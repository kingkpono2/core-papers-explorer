import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Theme, ThemePreference } from '../../theme/theme-preference';

@Component({
  selector: 'app-theme-toggle',
  templateUrl: './theme-toggle.html',
  styleUrl: './theme-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeToggle {
  protected readonly preference = inject(ThemePreference);
  protected readonly options: { value: Theme; label: string }[] = [
    { value: 'system', label: 'Match system' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];
}
