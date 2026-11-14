import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Highlight } from './highlight.tsx';

const marked = (text: string, query: string): string[] => {
  const { container } = render(<Highlight text={text} query={query} />);
  return Array.from(container.querySelectorAll('mark')).map((m) => m.textContent ?? '');
};

describe('Highlight', () => {
  it('ignores case, accents and punctuation like the search does', () => {
    expect(marked('We met at the Café, at noon.', 'cafe at')).toEqual(['Café,', 'at']);
  });

  it('marks a phrase across words and leaves the rest alone', () => {
    expect(marked('ask Jon Smith about it', 'jon smith')).toEqual(['Jon', 'Smith']);
  });

  it('marks nothing when there is no match', () => {
    expect(marked('hello there', 'zzz')).toEqual([]);
  });
});
