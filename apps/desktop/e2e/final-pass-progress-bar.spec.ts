import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('a list opened mid-pass shows a determinate filling bar, never the sweep', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-pass-bar-'));
  writeFileSync(
    join(userData, 'library-location.json'),
    JSON.stringify({ root: join(userData, 'library') }),
  );
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  for (const key of [
    'ELECTRON_RUN_AS_NODE',
    'SCRB_CAPTURE_HELPER',
    'SCRB_FINAL_PASS_CONFIG',
    'SCRB_LIVE_CONFIG',
    'SCRB_DEV_SERVER_URL',
  ])
    delete env[key];
  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`], env });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.scribeBridge!.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    const row = page.getByRole('listitem').filter({ hasText: 'Budget review' });
    const bar = row.getByRole('progressbar', { name: /Final transcript processing/ });
    // No report has arrived for this meeting: the bar is empty, not sweeping.
    await expect(bar).toHaveAttribute('aria-valuenow', '0');
    const fill = bar.locator('div');
    await expect(fill).toHaveCSS('animation-name', 'none');
    await expect(fill).toHaveCSS('width', '0px');
  } finally {
    await app.close();
  }
});
