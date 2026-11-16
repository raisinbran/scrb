import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evidenceDir = '/private/tmp/scrb-settings-audio-20261116';

test('Input Profile controls precede other audio controls at normal size and zoom', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-settings-audio-'));
  writeFileSync(
    join(userData, 'library-location.json'),
    JSON.stringify({ root: join(userData, 'library') }),
  );
  mkdirSync(evidenceDir, { recursive: true });

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
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.evaluate(() =>
      window.scribeBridge!.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Live' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings', exact: true }).click();

    const profile = page.getByRole('group', { name: /^Input Profile/ });
    await expect(profile).toBeVisible();
    await expect(profile.getByRole('radio', { name: /^Voice Isolation/ })).toBeVisible();
    await expect(profile.getByRole('radio', { name: /^Studio/ })).toBeVisible();
    await expect(profile.getByRole('radio', { name: /^Custom/ })).toBeVisible();
    await expect(profile.getByRole('button', { name: 'About presets' })).toBeVisible();

    const boxes = await page.evaluate(() => {
      const named = (name: string) => {
        const all = [...document.querySelectorAll<HTMLElement>('label,fieldset,button')];
        return all.find((element) => element.innerText.includes(name))?.getBoundingClientRect();
      };
      const profile = document.querySelector('fieldset')?.getBoundingClientRect();
      const presetControlNames = [
        'Noise suppression',
        'Echo cancellation',
        'Automatic gain control',
        'Bypass system audio input processing',
      ];
      const otherNames = [
        'Input sensitivity',
        'Advanced voice activity',
        'No audio detected warning',
        'Audio device suggestions',
      ];
      const rects = (names: string[]) => names.map((name) => named(name)).filter(Boolean);
      return {
        profile,
        presetControls: rects(presetControlNames),
        otherControls: rects(otherNames),
        mic: named('Microphone'),
        meeting: named('Meeting app'),
        testMic: named('Test mic'),
        viewport: { width: innerWidth, height: innerHeight },
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      };
    });
    expect(boxes.profile).not.toBeNull();
    expect(boxes.presetControls).toHaveLength(4);
    expect(boxes.otherControls).toHaveLength(4);
    expect(Math.min(...boxes.presetControls.map((box) => box!.top))).toBeGreaterThan(
      boxes.profile!.bottom,
    );
    expect(Math.min(...boxes.otherControls.map((box) => box!.top))).toBeGreaterThan(
      Math.max(...boxes.presetControls.map((box) => box!.bottom)),
    );
    const otherBottom = Math.max(...boxes.otherControls.map((box) => box!.bottom));
    expect(Math.min(boxes.mic!.top, boxes.meeting!.top)).toBeGreaterThan(otherBottom);
    expect(boxes.testMic!.top).toBeGreaterThan(Math.max(boxes.mic!.bottom, boxes.meeting!.bottom));
    expect(boxes.horizontalOverflow).toBe(false);
    await page.screenshot({
      path: join(evidenceDir, 'settings-audio-normal-1280x720.png'),
      fullPage: true,
    });

    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.webContents.setZoomFactor(1.25);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(1280);
    await expect(profile).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.screenshot({ path: join(evidenceDir, 'settings-audio-zoom-125.png') });
  } finally {
    await app.close();
  }
});
