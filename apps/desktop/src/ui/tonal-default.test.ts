import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

// The tonal design is the app's one look in every build (Electron, packaged and browser dev):
// the page itself carries the attribute, so no build or bridge condition can switch it off.
it('ships the tonal design in the page itself', () => {
  const html = readFileSync(join(__dirname, '..', '..', 'index.html'), 'utf8');
  expect(html).toMatch(/<html[^>]*data-design="tonal"/);
  const main = readFileSync(join(__dirname, 'main.tsx'), 'utf8');
  expect(main).not.toMatch(/dataset\[['"]design['"]\]/);
});
