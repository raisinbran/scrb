import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  join(import.meta.dirname, '../screens/live/TranscriptView.module.css'),
  'utf8',
);

function rule(selector: string): string {
  const match = new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  return match?.[1] ?? '';
}

describe('transcript cursor', () => {
  it('shows the text cursor only over words, not the canvas or rows', () => {
    expect(rule('.word')).toMatch(/cursor:\s*text/);
    for (const name of ['.canvas', '.row', '.rowSlot', '.text', '.scroller']) {
      expect(rule(name)).not.toMatch(/cursor:/);
    }
  });
});
