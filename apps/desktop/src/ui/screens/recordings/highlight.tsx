import type { ReactNode } from 'react';
import styles from './recordings.module.css';

/** Mirrors the library's matching: case, accents and punctuation do not matter. */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Marks the words that make up the first match of the phrase, however they are punctuated. */
export function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const needle = fold(query);
  const words = text.split(/(\s+)/);
  const folded: { index: number; offset: number; length: number }[] = [];
  const parts: string[] = [];
  let offset = 0;
  words.forEach((word, index) => {
    const value = fold(word);
    if (index % 2 === 1 || value === '') return;
    folded.push({ index, offset, length: value.length });
    parts.push(value);
    offset += value.length + 1;
  });
  const at = needle === '' ? -1 : parts.join(' ').indexOf(needle);
  if (at < 0) return text;
  const end = at + needle.length;
  const marked = new Set(
    folded.filter((w) => w.offset < end && w.offset + w.length > at).map((w) => w.index),
  );
  const out: ReactNode[] = [];
  let run = '';
  const flush = () => {
    if (run) out.push(run);
    run = '';
  };
  words.forEach((word, index) => {
    if (marked.has(index)) {
      flush();
      out.push(
        <mark key={index} className={styles.mark}>
          {word}
        </mark>,
      );
    } else run += word;
  });
  flush();
  return <>{out}</>;
}
