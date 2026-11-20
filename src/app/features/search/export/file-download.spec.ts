import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileDownload, exportFileName } from './file-download';

describe('FileDownload', () => {
  it('clicks a link to an object URL for the content and revokes it afterwards', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    let blob: Blob | undefined;
    spyOn(URL, 'createObjectURL').and.callFake((value) => {
      blob = value as Blob;
      return 'blob:test';
    });
    const revoke = spyOn(URL, 'revokeObjectURL');
    const click = spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('papers.csv');
      expect(this.href).toBe('blob:test');
    });

    TestBed.inject(FileDownload).save('papers.csv', 'a,b', 'text/csv');

    expect(click).toHaveBeenCalledTimes(1);
    expect(blob?.type).toBe('text/csv');
    expect(await blob?.text()).toBe('a,b');
    await new Promise((resolve) => setTimeout(resolve));
    expect(revoke).toHaveBeenCalledOnceWith('blob:test');
  });
});

describe('exportFileName', () => {
  it('names the file after the query and page', () => {
    expect(exportFileName('drone AND (package OR delivery)', 2, 'csv')).toBe(
      'core-papers-drone-and-package-or-delivery-page-2.csv',
    );
    expect(exportFileName('"Ünïcode"', 1, 'bib')).toBe('core-papers-unicode-page-1.bib');
    expect(exportFileName('***', 1, 'bib')).toBe('core-papers-search-page-1.bib');
  });
});
