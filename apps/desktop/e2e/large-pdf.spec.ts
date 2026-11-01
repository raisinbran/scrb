import { _electron as electron, test, expect } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

test('real Chromium prints HTML larger than the data URL limit without leftover temporary files', async () => {
  const build = spawnSync(process.execPath, ['scripts/build-pdf-test.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  expect(build.status, build.stderr).toBe(0);
  const app = await electron.launch({
    args: [join('e2e', 'large-pdf-harness.mjs')],
  });
  try {
    const child = app.process();
    const code = await new Promise<number | null>((resolve) => {
      if (child.exitCode !== null) resolve(child.exitCode);
      else child.once('exit', resolve);
    });
    expect(code).toBe(0);
  } finally {
    await app.close().catch(() => undefined);
  }
});
