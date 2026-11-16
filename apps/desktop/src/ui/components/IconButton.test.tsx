import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { IconButton } from './IconButton.tsx';

afterEach(cleanup);

describe('IconButton info variant', () => {
  it('uses the circular treatment only for information icons', () => {
    render(
      <>
        <IconButton label="About presets" icon="info" />
        <IconButton label="Export" icon="export" />
      </>,
    );

    const info = screen.getByRole('button', { name: 'About presets' });
    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(info.className).toMatch(/info/);
    expect(exportButton.className).not.toMatch(/info/);

    const css = readFileSync(join(__dirname, 'IconButton.module.css'), 'utf8');
    const infoRule = css.match(/\.info \{([^}]*)\}/)?.[1] ?? '';
    expect(infoRule).toMatch(/border: 0/);
    expect(infoRule).toMatch(/border-radius: 50%/);
  });
});
