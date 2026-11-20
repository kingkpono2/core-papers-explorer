import { DOCUMENT, Injectable, inject } from '@angular/core';

/** Saves text as a file through a temporary object URL. */
@Injectable({ providedIn: 'root' })
export class FileDownload {
  private readonly document = inject(DOCUMENT);

  save(fileName: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // Revoking straight away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url));
  }
}

/** `core-papers-drone-delivery-page-2.csv` */
export function exportFileName(query: string, page: number, extension: string): string {
  const slug = query
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return `core-papers-${slug || 'search'}-page-${page}.${extension}`;
}
