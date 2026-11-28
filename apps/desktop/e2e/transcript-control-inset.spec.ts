import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Every control inside a transcript card keeps the card inset (--space-card-pad) from the card edge.
// Rows inside the scrolling text and floating banners are exempt: they scroll or float by design.
async function insets(page: Page, cardSelector: string) {
  return page.evaluate((selector) => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;padding-left:var(--space-card-pad)';
    document.body.append(probe);
    const min = parseFloat(getComputedStyle(probe).paddingLeft);
    probe.remove();
    const cards = [...document.querySelectorAll<HTMLElement>(selector)].filter(
      (c) => c.getClientRects().length > 0,
    );
    const found: { control: string; gaps: number[] }[] = [];
    let controls = 0;
    for (const card of cards) {
      const box = card.getBoundingClientRect();
      for (const el of card.querySelectorAll<HTMLElement>('button,input,select,textarea,a[href]')) {
        if (el.getClientRects().length === 0) continue;
        if (el.closest('[data-row],[role="status"],[role="alert"],[class*="banner"]')) continue;
        controls++;
        const r = el.getBoundingClientRect();
        const gaps = [
          r.left - box.left,
          box.right - r.right,
          r.top - box.top,
          box.bottom - r.bottom,
        ];
        if (Math.min(...gaps) < min - 0.5)
          found.push({
            control: el.getAttribute('aria-label') ?? el.textContent?.trim() ?? el.tagName,
            gaps: gaps.map(Math.round),
          });
      }
    }
    return { min, controls, found };
  }, cardSelector);
}

test('controls in the Live and meeting transcript cards keep the card inset', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-inset-'));
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
    const resize = async (width: number, height: number, zoom: number) => {
      const applied = await app.evaluate(
        async ({ BrowserWindow }, [w, h, factor]) => {
          const win = BrowserWindow.getAllWindows()[0]!;
          win.setSize(w!, h!);
          await new Promise((resolve) => setTimeout(resolve, 500));
          // The CI display may clamp the window, so raise the zoom to keep the intended CSS width.
          const effective = factor! > 1 ? (win.getContentBounds().width * factor!) / w! : factor!;
          win.webContents.setZoomFactor(Math.max(effective, 1));
          return Math.max(effective, 1);
        },
        [width, height, zoom],
      );
      await page.waitForTimeout(500);
      return applied;
    };
    const trigger = async (id: string) => {
      await page.keyboard.press('Control+Shift+Alt+D');
      await page.locator(`[data-trigger="${id}"]`).click();
      await page.keyboard.press('Control+Shift+Alt+D');
    };
    const offenders: { at: string; control: string; gaps: number[] }[] = [];
    const shoot = async (name: string) => {
      const dir = process.env['SCRB_SCREENSHOT_DIR'];
      if (dir) await page.screenshot({ path: join(dir, `inset-${name}.png`) });
    };
    const sizes: [number, number, number][] = [
      [800, 600, 1],
      [1280, 720, 1],
      [1280, 720, 2],
    ];

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await trigger('start');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    for (const [w, h, z] of sizes) {
      await resize(w, h, z);
      const live = await insets(page, 'section[aria-label="Transcript"]');
      expect(live.controls, `live controls at ${w}x${h}@${z}`).toBeGreaterThan(3);
      offenders.push(...live.found.map((f) => ({ at: `live ${w}x${h}@${z}`, ...f })));
      await shoot(`live-${w}x${h}-${z}`);
    }
    await trigger('stop');

    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    await page.getByRole('button', { name: /Weekly project sync/ }).click();
    await expect(page.getByRole('tabpanel')).toBeVisible();
    for (const [w, h, z] of sizes) {
      await resize(w, h, z);
      const meeting = await insets(page, '[role="tabpanel"], [class*="playerRow"]');
      expect(meeting.controls, `meeting controls at ${w}x${h}@${z}`).toBeGreaterThan(1);
      offenders.push(...meeting.found.map((f) => ({ at: `meeting ${w}x${h}@${z}`, ...f })));
      await shoot(`meeting-${w}x${h}-${z}`);
    }
    expect(offenders).toEqual([]);
  } finally {
    await app.close();
  }
});
