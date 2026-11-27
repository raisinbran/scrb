import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const rule = (source: string, selector: string) =>
  source.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('banners never move the content under them', () => {
  it('floats the app-level notices over the workspace', () => {
    const notices = rule(css('shell/AppShell.module.css'), '.notices');
    expect(notices).toMatch(/position: absolute/);
    // At the top, never the bottom edge where the player, save and Live control bars sit.
    expect(notices).toMatch(/inset-block-start: var\(--space-1\)/);
    expect(notices).not.toMatch(/inset-block-end/);
  });

  it('floats the popup banners, the live notice and the list notes', () => {
    expect(rule(css('components/PopupBanner.module.css'), '.layer')).toMatch(
      /height: var\(--popup-gutter, 0\)/,
    );
    expect(rule(css('components/PopupBanner.module.css'), '.stack')).toMatch(/position: absolute/);
    expect(rule(css('screens/LiveScreen.module.css'), '.finished')).toMatch(/position: absolute/);
    expect(rule(css('screens/recordings/recordings.module.css'), '.floatNote')).toMatch(
      /position: absolute/,
    );
  });
});

describe('progress bar', () => {
  it('sweeps one way when no percentage exists, and holds still for reduced motion', () => {
    const source = css('components/Progress.module.css');
    expect(source).not.toMatch(/alternate/);
    expect(rule(source, '.unknown')).toMatch(/animation: sweep/);
    expect(source).toMatch(
      /prefers-reduced-motion: reduce\) \{\s*\.unknown \{[^}]*animation: none/,
    );
  });
});

describe('one banner look', () => {
  it('is 75% of the panel, centred, and shared by every banner', () => {
    const shared = rule(css('components/Banner.module.css'), '.banner');
    expect(shared).toMatch(/width: 75%/);
    expect(shared).toMatch(/margin-inline: auto/);
    for (const file of [
      'components/PopupBanner.module.css',
      'components/PrivacyBanner.module.css',
      'components/SharedLibraryNotice.module.css',
      'components/ModelsNotice.module.css',
      'screens/LiveScreen.module.css',
      'screens/recordings/recordings.module.css',
    ])
      expect(css(file)).toMatch(/composes: banner from '[./]+(components\/)?Banner\.module\.css'/);
  });
});
