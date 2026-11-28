import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'mocks' ? [] : sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

// Banners, notices and toasts are dismissed with the shared X (DismissButton), never a text button.
// The one text "Dismiss" left is the per-row action on a finished import in the import list, which is not a banner.
const TEXT_DISMISS = /<button\b(?:=>|[^>])*>\s*Dismiss\s*<\/button>/g;
const ALLOWED = ['aria-label={`Dismiss ${entry.fileName}`}'];

describe('dismissing a banner', () => {
  it('never uses a text button labelled Dismiss', () => {
    const offenders: string[] = [];
    for (const file of sources(join(__dirname, '..'))) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(TEXT_DISMISS)) {
        if (!ALLOWED.some((allowed) => match[0].includes(allowed))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps the X off alert strips and toasts', () => {
    const source = readFileSync(join(__dirname, 'Notices.tsx'), 'utf8');
    const alert = source.slice(
      source.indexOf('export function AlertStrip'),
      source.indexOf('export const TOAST_MS'),
    );
    const toast = source.slice(source.indexOf('export function Toast'));
    expect(alert).not.toMatch(/onDismiss|DismissButton/);
    expect(toast).not.toMatch(/onDismiss|DismissButton/);
  });

  it('matches a text Dismiss button whose handler is an arrow function', () => {
    const sample = '<button onClick={() => go()}>Dismiss</button>';
    expect([...sample.matchAll(TEXT_DISMISS)]).toHaveLength(1);
  });
});
