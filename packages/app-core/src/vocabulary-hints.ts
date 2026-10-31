import type { VocabularyTerm } from '@scrb/storage';

export const MAX_HINT_CHARS = 512;
export const MAX_HINT_TERMS = 40;

/** Stable, bounded vocabulary terms for one offline recognition job. Never substitutes text. */
export function vocabularyHint(terms: VocabularyTerm[]): string {
  const seen = new Set<string>();
  const selected: string[] = [];
  let chars = 0;
  for (const item of terms) {
    if (!item.enabled) continue;
    const term = item.term.normalize('NFC').trim().replace(/\s+/g, ' ');
    const key = term.toLocaleLowerCase('en-US');
    if (!term || term.includes('\n') || seen.has(key) || term.length > 100) continue;
    const added = (selected.length === 0 ? 0 : 2) + term.length;
    if (chars + added > MAX_HINT_CHARS) continue;
    seen.add(key);
    selected.push(term);
    chars += added;
    if (selected.length === MAX_HINT_TERMS) break;
  }
  return selected.join(', ');
}
