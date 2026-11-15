import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sidebar footer buttons', () => {
  it('are borderless and share the sidebar items hover and selected fills', () => {
    const css = readFileSync(join(__dirname, 'Sidebar.module.css'), 'utf8');
    const rule = (selector: string) =>
      css.match(new RegExp(`${selector.replace(/[.[\]'=()]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule('.iconButton')).toMatch(/border: 0/);
    expect(rule('.iconButton')).toMatch(/border-radius: var\(--radius\)/);
    expect(rule('.iconButton:hover')).toMatch(/--color-surface-hover/);
    expect(css).toMatch(
      /\.iconButton\[aria-current='page'\],\s*\.iconButton\[aria-expanded='true'\] \{[^}]*--color-surface-selected/,
    );
  });
});
