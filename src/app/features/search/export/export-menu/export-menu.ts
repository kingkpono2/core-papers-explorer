import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Paper } from '../../../../core/models/paper';
import { toBibtex } from '../bibtex';
import { toCsv } from '../csv';
import { FileDownload, exportFileName } from '../file-download';

type Format = 'csv' | 'bibtex';

const FORMATS: Record<Format, { extension: string; type: string; build: (p: Paper[]) => string }> =
  {
    // The byte order mark makes Excel read the file as UTF-8.
    csv: { extension: 'csv', type: 'text/csv;charset=utf-8', build: (p) => '\uFEFF' + toCsv(p) },
    bibtex: { extension: 'bib', type: 'application/x-bibtex;charset=utf-8', build: toBibtex },
  };

/** A disclosure button that saves the papers on the page as CSV or BibTeX. */
@Component({
  selector: 'app-export-menu',
  templateUrl: './export-menu.html',
  styleUrl: './export-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeOnOutsideClick($event)',
    '(keydown.escape)': 'close(true)',
  },
})
export class ExportMenu {
  readonly papers = input.required<Paper[]>();
  readonly query = input.required<string>();
  readonly page = input.required<number>();

  private readonly downloads = inject(FileDownload);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  protected readonly open = signal(false);

  protected export(format: Format): void {
    const { extension, type, build } = FORMATS[format];
    this.downloads.save(
      exportFileName(this.query(), this.page(), extension),
      build(this.papers()),
      type,
    );
    this.close(true);
  }

  protected close(restoreFocus = false): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (restoreFocus) {
      this.toggle().nativeElement.focus();
    }
  }

  protected closeOnOutsideClick(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }
}
