import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTheme } from './theme.ts';

const uiDir = join(import.meta.dirname, '..');
const tokensCss = readFileSync(join(uiDir, 'theme/tokens.css'), 'utf8');

function tokensOf(theme: 'light' | 'dark'): Record<string, string> {
  const block = tokensCss.split(`:root[data-theme='${theme}'] {`)[1]?.split('}')[0] ?? '';
  return Object.fromEntries(
    [...block.matchAll(/(--color-[\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_TOKENS = [
  '--color-text',
  '--color-text-muted',
  '--color-accent',
  '--color-warning',
  '--color-danger',
  '--color-ok',
];
const BACKGROUNDS = [
  '--color-surface',
  '--color-surface-sidebar',
  '--color-surface-raised',
  '--color-surface-hover',
];

describe('resolveTheme', () => {
  it('follows the OS only for System', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe.each(['light', 'dark'] as const)('%s tokens', (theme) => {
  const tokens = tokensOf(theme);

  it('defines the same token names as the other theme', () => {
    const other = tokensOf(theme === 'light' ? 'dark' : 'light');
    expect(Object.keys(tokens).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT_TOKENS)('%s meets WCAG AA on every surface', (token) => {
    for (const background of BACKGROUNDS) {
      const ratio = contrast(tokens[token] as string, tokens[background] as string);
      expect(ratio, `${token} on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('meets WCAG AA for text on the accent color', () => {
    const ratio = contrast(
      tokens['--color-on-accent'] as string,
      tokens['--color-accent'] as string,
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});

describe('component styles', () => {
  it('hard-code no color values', () => {
    const files = readdirSync(uiDir, { recursive: true, encoding: 'utf8' }).filter(
      (file) => /\.(css|tsx)$/.test(file) && !file.endsWith('tokens.css'),
    );
    expect(files.length).toBeGreaterThan(10);
    const offenders = files.filter((file) =>
      /#[0-9a-fA-F]{3,8}\b(?![\w-])|\brgba?\(|\bhsla?\(/.test(
        readFileSync(join(uiDir, file), 'utf8').replace(/d=\{?['"][^'"]*['"]\}?/g, ''),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
