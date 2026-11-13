import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const executable = process.env['SCRB_PACKAGED_APP'];

// Runs the built Scribe.app against an invented HOME. Set SCRB_PACKAGED_APP to
// .../Scribe.app/Contents/MacOS/Scribe.
test.skip(!executable, 'set SCRB_PACKAGED_APP to run');

test('packaged app keeps the saved library, is named Scribe, and refuses to record without models', async () => {
  const home = mkdtempSync(join(tmpdir(), 'scrb-home-'));
  const userData = join(home, 'Library', 'Application Support', '@scrb', 'desktop');
  const library = join(home, 'chosen-library');
  mkdirSync(userData, { recursive: true });
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const app = await electron.launch({
    executablePath: executable!,
    env: { ...process.env, HOME: home } as Record<string, string>,
  });
  const page = await app.firstWindow();
  const call = (name: string, request?: unknown) =>
    page.evaluate(([n, r]) => window.scribeBridge?.invoke(n as never, r as never), [name, request]);

  expect(await call('getSettings')).toMatchObject({
    ok: true,
    value: { storageLocation: library },
  });
  expect(await call('getAppInfo')).toMatchObject({ ok: true, value: { name: 'Scribe' } });
  const status = (await call('getSetupStatus')) as { value: { models: { installed: boolean }[] } };
  expect(status.value.models.length).toBe(5);
  expect(status.value.models.every((m) => !m.installed)).toBe(true);
  expect(await call('startRecording', {})).toMatchObject({
    ok: false,
    error: { message: expect.stringContaining('--install-models') },
  });
  await app.close();
});
