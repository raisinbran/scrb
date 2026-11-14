import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const uiDir = join(dirname(fileURLToPath(import.meta.url)), '..');

// Clocks and timestamps share the surrounding text's font. Monospace made them look larger.
const TIMERS: Record<string, string[]> = {
  'shell/TitleBar.module.css': ['elapsed'],
  'shell/MiniRecording.module.css': ['elapsed'],
  'screens/LiveScreen.module.css': ['elapsed', 'bannerTime'],
  'screens/recordings/recordings.module.css': ['time', 'timeLink'],
  'screens/speakers/MeetingSpeakers.module.css': ['time'],
  'screens/live/TranscriptView.module.css': ['time'],
};

describe('timer fonts', () => {
  it.each(Object.entries(TIMERS))('%s uses the surrounding font', (file, classes) => {
    const css = readFileSync(join(uiDir, file), 'utf8');
    for (const name of classes) {
      const block = new RegExp(`\\n\\.${name} \\{([^}]*)\\}`).exec(css)?.[1];
      expect(block, `${file} .${name}`).toBeDefined();
      expect(block).not.toMatch(/font-family|monospace/);
    }
  });

  it('keeps the live clocks from jittering with tabular digits', () => {
    for (const file of [
      'shell/TitleBar.module.css',
      'shell/MiniRecording.module.css',
      'screens/LiveScreen.module.css',
    ]) {
      expect(readFileSync(join(uiDir, file), 'utf8')).toContain(
        'font-variant-numeric: tabular-nums',
      );
    }
  });
});
