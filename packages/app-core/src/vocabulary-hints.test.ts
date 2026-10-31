import { describe, expect, it } from 'vitest';
import type { VocabularyTerm } from '@scrb/storage';
import { MAX_HINT_CHARS, vocabularyHint } from './vocabulary-hints.ts';

const term = (name: string, enabled = true): VocabularyTerm => ({
  id: name, term: name, enabled, misheard: [], contexts: [],
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
});
describe('recognition vocabulary hints', () => {
  it('skips disabled, duplicates and empty terms', () => {
    expect(vocabularyHint([term('Kestrel API'), term('kestrel api'), term('disabled', false), term('')]))
      .toBe('Kestrel API');
  });
  it('bounds a long term list without content replacement', () => {
    const selected = vocabularyHint(Array.from({ length: 400 }, (_, index) =>
      term(`invented-term-${index}`)));
    expect(selected.length).toBeLessThanOrEqual(MAX_HINT_CHARS);
    expect(selected).toContain('invented-term-0');
    expect(selected).not.toContain('invented-term-399');
  });
});
