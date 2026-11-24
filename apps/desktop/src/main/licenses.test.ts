import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLicensesHandler } from './licenses.ts';

const write = (content: string) => {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'scrb-lic-')), 'licenses.json');
  writeFileSync(file, content);
  return file;
};

describe('createLicensesHandler', () => {
  it('returns the generated entries', async () => {
    const entry = { name: 'a', version: '1', license: 'MIT', text: 'MIT text' };
    expect(await createLicensesHandler(write(JSON.stringify([entry])))()).toEqual([entry]);
  });
  it('rejects an empty or incomplete list instead of showing nothing', async () => {
    await expect(createLicensesHandler(write('[]'))()).rejects.toThrow(/rebuild/);
    await expect(
      createLicensesHandler(write('[{"name":"a","version":"1","license":"MIT","text":""}]'))(),
    ).rejects.toThrow(/rebuild/);
  });
  it('rejects a missing file', async () => {
    await expect(createLicensesHandler('/nonexistent/licenses.json')()).rejects.toThrow();
  });
});
