import { Paper } from '../../core/models/paper';

/**
 * CORE lists a paper once for every repository that holds it, so the same title can appear several
 * times in one page of results. Records with the same title (ignoring case, accents and
 * punctuation, and only for titles of three words or more) are merged into the first, most
 * relevant one, which takes any year, abstract or authors it lacks from the others.
 */
export function mergeDuplicates(papers: readonly Paper[]): { papers: Paper[]; merged: number } {
  const kept: Paper[] = [];
  const byTitle = new Map<string, number>();
  for (const paper of papers) {
    const key = titleKey(paper.title);
    const index = key === null ? undefined : byTitle.get(key);
    if (index === undefined) {
      if (key !== null) {
        byTitle.set(key, kept.length);
      }
      kept.push(paper);
      continue;
    }
    const first = kept[index];
    kept[index] = {
      ...first,
      year: first.year ?? paper.year,
      publishedDate: first.publishedDate ?? paper.publishedDate,
      abstract: first.abstract ?? paper.abstract,
      authors: first.authors.length ? first.authors : paper.authors,
    };
  }
  return { papers: kept, merged: papers.length - kept.length };
}

function titleKey(title: string): string | null {
  const words =
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&(?:#x[\da-f]+|#\d+|[a-z]+);?/g, ' ')
      .match(/[a-z0-9]+/g) ?? [];
  return words.length >= 3 ? words.join(' ') : null;
}
