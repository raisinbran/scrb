import type { OutlineItem } from './types.js';

/** Dot product of two unit-length vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i += 1) s += a[i]! * b[i]!;
  return s;
}

/** Text to embed for each item: its own text, preceded by its parent headings. */
export function itemEmbeddingTexts(items: readonly OutlineItem[]): string[] {
  return items.map((item, index) => {
    const parts = [item.text];
    let level = item.level;
    for (let i = index - 1; i >= 0 && level > 1; i -= 1) {
      if (items[i]!.level < level) {
        level = items[i]!.level;
        parts.unshift(items[i]!.text);
      }
    }
    return parts.join(': ');
  });
}
