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

const recordingsCss = readFileSync(
  join(import.meta.dirname, '../screens/recordings/recordings.module.css'),
  'utf8',
);

describe('saved transcript cursor', () => {
  const ruleIn = (selector: string) =>
    new RegExp(`(?:^|\\n)\\${selector}\\s*\\{([^}]*)\\}`).exec(recordingsCss)?.[1] ?? '';

  it('shows the text cursor over words only, and a pointer on the speaker button', () => {
    expect(ruleIn('.word')).toMatch(/cursor:\s*text/);
    expect(ruleIn('.words')).not.toMatch(/cursor:/);
    expect(ruleIn('.speakerButton')).toMatch(/cursor:\s*pointer/);
  });
});
