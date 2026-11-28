import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = (file: string) => readFileSync(join(__dirname, file), 'utf8');
const rule = (source: string, selector: string) =>
  source.match(new RegExp(`(?:^|\\n)${selector.replace('.', '\\.')} \\{([^}]*)\\}`))?.[1] ?? '';

describe('notice strips and toasts', () => {
  it('keeps strips in the page flow and toasts out of it', () => {
    const notices = css('components/Notices.module.css');
    expect(rule(notices, '.stack')).not.toMatch(/position:/);
    expect(rule(notices, '.strip')).not.toMatch(/position: (absolute|fixed)/);
    // One width and one left edge for every strip in a stack.
    expect(rule(notices, '.stack')).toMatch(/align-items: stretch/);
    // The toast sits bottom-centre over the page and takes no room.
    const toast = rule(notices, '.toast');
    expect(toast).toMatch(/position: fixed/);
    expect(toast).toMatch(/inset-block-end:/);
    expect(toast).toMatch(/translateX\(-50%\)/);
    expect(toast).toMatch(/text-wrap: balance/);
  });

  it('fills strips and toasts from their own tokens, clearly apart from the card', () => {
    const notices = css('components/Notices.module.css');
    expect(rule(notices, '.strip')).toMatch(/background: var\(--color-notice\)/);
    expect(notices).toMatch(/background: var\(--color-alert\)/);
    expect(rule(notices, '.toast')).toMatch(/background: var\(--color-toast\)/);
  });

  it('puts the app-level strips above the workspace in their own row', () => {
    const frame = rule(css('shell/AppShell.module.css'), '.workspaceFrame');
    expect(frame).toMatch(/flex-direction: column/);
    expect(css('shell/AppShell.module.css')).not.toMatch(/position: absolute/);
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
