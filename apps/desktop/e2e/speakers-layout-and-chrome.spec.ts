import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const evidenceDir = '/private/tmp/scrb-ui-evidence-20261116';

function testUserData(prefix: string): string {
  const userData = mkdtempSync(join(tmpdir(), prefix));
  writeFileSync(
    join(userData, 'library-location.json'),
    JSON.stringify({ root: join(userData, 'library') }),
  );
  mkdirSync(evidenceDir, { recursive: true });
  return userData;
}

async function openMockApp(userData: string) {
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
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() =>
    window.scribeBridge!.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: 'Live' })).toBeVisible();
  return { app, page };
}

async function inspectNoHorizontalOverflow(page: Page, width: number) {
  const result = await page.evaluate(() => {
    const columns = document.querySelector<HTMLElement>('[data-testid="speakers-columns"]');
    const left = document.querySelector<HTMLElement>('[data-testid="voice-profile-column"]');
    const right = document.querySelector<HTMLElement>('[data-testid="meeting-speakers-column"]');
    const workspace = document.querySelector<HTMLElement>('main');
    if (!columns || !left || !right || !workspace) return null;
    const box = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      viewportWidth: innerWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      columns: box(columns),
      left: box(left),
      right: box(right),
      workspace: box(workspace),
      leftStyle: {
        backgroundColor: getComputedStyle(left).backgroundColor,
        borderTopWidth: getComputedStyle(left).borderTopWidth,
      },
      rightStyle: {
        backgroundColor: getComputedStyle(right).backgroundColor,
        borderTopWidth: getComputedStyle(right).borderTopWidth,
      },
      leftScrollWidth: left.scrollWidth,
      rightScrollWidth: right.scrollWidth,
      rightClientWidth: right.clientWidth,
      chips: [...right.querySelectorAll<HTMLElement>('[class*="labels"] li')].map(box),
      selector: (() => {
        const select = right.querySelector('select');
        return select ? box(select) : null;
      })(),
    };
  });
  expect(result).not.toBeNull();
  expect(result!.viewportWidth).toBeLessThanOrEqual(width + 1);
  expect(result!.pageOverflow).toBe(false);
  expect(result!.leftScrollWidth).toBeLessThanOrEqual(result!.left.width + 1);
  expect(result!.rightScrollWidth).toBeLessThanOrEqual(result!.rightClientWidth + 1);
  expect(result!.selector).not.toBeNull();
  expect(result!.selector!.x).toBeGreaterThanOrEqual(result!.right.x - 1);
  expect(result!.selector!.x + result!.selector!.width).toBeLessThanOrEqual(
    result!.right.x + result!.right.width + 1,
  );
  for (const chip of result!.chips) {
    expect(chip.x).toBeGreaterThanOrEqual(result!.right.x - 1);
    expect(chip.x + chip.width).toBeLessThanOrEqual(result!.right.x + result!.right.width + 1);
  }
  return result!;
}

async function tooltipBounds(page: Page, label: string) {
  const button = page.getByRole('button', { name: label, exact: true });
  await button.hover();
  const tip = page.locator('[role="tooltip"]').filter({ hasText: label });
  await expect(tip).toHaveAttribute('data-open', 'true');
  const bounds = await tip.boundingBox();
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height + 1);
  return { button, tip, bounds: bounds!, viewport };
}

async function focusByTab(page: Page, target: Locator) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  for (let index = 0; index < 80; index++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('The target was not reachable by keyboard Tab');
}

test('Speakers columns stack at narrow width and real 200% zoom', async () => {
  const { app, page } = await openMockApp(testUserData('scrb-speakers-layout-'));
  try {
    await page.getByRole('button', { name: 'Speakers', exact: true }).click();
    const heading = page.getByRole('heading', { level: 1, name: 'Speakers' });
    const columns = page.getByTestId('speakers-columns');
    const left = page.getByTestId('voice-profile-column');
    const right = page.getByTestId('meeting-speakers-column');
    const emptyTitle = page.getByText('No voice profiles yet');
    await expect(page.getByText('Profiles appear after your first recording.')).toBeVisible();
    await page
      .locator('label')
      .filter({ hasText: /^Meeting/ })
      .locator('select')
      .selectOption('meeting-outdated');
    await expect(page.getByRole('button', { name: /Speaker:/ }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Split a speaker…' })).toBeVisible();

    const [headingBounds, columnsBounds, leftBounds, rightBounds, emptyBounds] = await Promise.all([
      heading.boundingBox(),
      columns.boundingBox(),
      left.boundingBox(),
      right.boundingBox(),
      emptyTitle.boundingBox(),
    ]);
    expect(headingBounds).not.toBeNull();
    expect(columnsBounds).not.toBeNull();
    expect(leftBounds).not.toBeNull();
    expect(rightBounds).not.toBeNull();
    expect(emptyBounds).not.toBeNull();
    expect(headingBounds!.x).toBeCloseTo(columnsBounds!.x, 0);
    expect(headingBounds!.x + headingBounds!.width).toBeCloseTo(
      columnsBounds!.x + columnsBounds!.width,
      0,
    );
    expect(rightBounds!.x).toBeGreaterThan(leftBounds!.x + leftBounds!.width);
    const layout = await inspectNoHorizontalOverflow(page, 1280);
    const dividerCenter = (layout.left.x + layout.left.width + layout.right.x) / 2;
    expect(dividerCenter).toBeCloseTo(layout.workspace.x + layout.workspace.width / 2, 0);
    expect(layout.leftStyle.backgroundColor).toBe(layout.rightStyle.backgroundColor);
    expect(layout.leftStyle.borderTopWidth).toBe('1px');
    expect(layout.rightStyle.borderTopWidth).toBe('1px');
    expect(emptyBounds!.x + emptyBounds!.width / 2).toBeCloseTo(
      leftBounds!.x + leftBounds!.width / 2,
      0,
    );
    await page.screenshot({ path: join(evidenceDir, 'after-speakers-wide-light.png') });

    await page.setViewportSize({ width: 760, height: 720 });
    const narrow = await inspectNoHorizontalOverflow(page, 760);
    expect(narrow.right.y).toBeGreaterThan(narrow.left.y + narrow.left.height - 1);
    await page.screenshot({ path: join(evidenceDir, 'after-speakers-narrow.png') });

    await app.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setSize(1280, 720);
      await new Promise((resolve) => setTimeout(resolve, 200));
      const width = window.getContentBounds().width;
      const effectiveZoom = Math.min(2, (width * 2) / 1280);
      window.webContents.setZoomFactor(effectiveZoom);
    });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(840);
    const zoomed = await inspectNoHorizontalOverflow(page, 840);
    expect(zoomed.right.y).toBeGreaterThan(zoomed.left.y + zoomed.left.height - 1);
    await page.screenshot({ path: join(evidenceDir, 'after-speakers-200-percent.png') });
  } finally {
    await app.close();
  }
});

test('keeps populated voice-profile actions inside their card at 900px', async () => {
  const { app, page } = await openMockApp(testUserData('scrb-speakers-profile-900-'));
  try {
    await page.setViewportSize({ width: 900, height: 720 });
    await page.getByRole('button', { name: 'Speakers', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Voice profiles' })).toBeVisible();
    const layout = await inspectNoHorizontalOverflow(page, 900);
    expect(layout.right.x).toBeGreaterThan(layout.left.x + layout.left.width);

    const card = page.getByTestId('voice-profile-column');
    const actions = card
      .locator('li')
      .filter({ hasText: 'Tomas Lindgren' })
      .locator('[class*="actions"]');
    await expect(actions).toBeVisible();
    const names = [
      'Play sample of Tomas Lindgren',
      'Rename Tomas Lindgren',
      'Merge Tomas Lindgren',
      'Delete Tomas Lindgren',
    ];
    const cardBounds = await card.boundingBox();
    expect(cardBounds).not.toBeNull();
    for (const name of names) {
      const button = card.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(cardBounds!.x - 1);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(cardBounds!.x + cardBounds!.width + 1);
      expect(bounds!.y).toBeGreaterThanOrEqual(cardBounds!.y - 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
        cardBounds!.y + cardBounds!.height + 1,
      );
    }
    const actionOverflow = await actions.evaluate((element) => ({
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    }));
    expect(actionOverflow.scrollWidth).toBeLessThanOrEqual(actionOverflow.clientWidth + 1);
    await page.screenshot({ path: join(evidenceDir, 'after-speakers-900-populated-profile.png') });
  } finally {
    await app.close();
  }
});

test('keeps sidebar tooltips visible and information buttons circular in both themes', async () => {
  const { app, page } = await openMockApp(testUserData('scrb-button-polish-'));
  try {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const info = page.getByRole('button', { name: 'About presets', exact: true });
    await expect(info).toBeVisible();

    for (const theme of ['Light', 'Dark']) {
      await page.getByRole('radio', { name: theme, exact: true }).check();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.dataset['theme']))
        .toBe(theme.toLowerCase());

      const selectedButton = page.getByRole('button', { name: 'Settings', exact: true });
      await expect(selectedButton).toHaveAttribute('aria-current', 'page');
      const selected = await tooltipBounds(page, 'Settings');
      const selectedStyle = await selected.button.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, shadow: style.boxShadow };
      });
      const selectedToken = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--color-surface-selected)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      expect(selectedStyle.background).toBe(selectedToken);
      expect(selectedStyle.shadow).toBe('none');
      expect(selected.bounds.y).toBeLessThan((await selected.button.boundingBox())!.y);
      await page.screenshot({
        path: join(evidenceDir, `after-settings-hover-${theme.toLowerCase()}.png`),
      });

      const unselected = await tooltipBounds(page, 'Help');
      const unselectedStyle = await unselected.button.evaluate((element) => {
        const style = getComputedStyle(element);
        return { background: style.backgroundColor, shadow: style.boxShadow };
      });
      const hoverToken = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--color-surface-hover)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      expect(unselectedStyle.background).toBe(hoverToken);
      expect(unselectedStyle.shadow).toBe('none');
      await page.screenshot({
        path: join(evidenceDir, `after-help-hover-${theme.toLowerCase()}.png`),
      });

      const infoStyle = await info.evaluate((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const corner = document.elementFromPoint(rect.left + 0.5, rect.top + 0.5);
        return {
          width: rect.width,
          height: rect.height,
          radius: style.borderRadius,
          borderWidth: style.borderWidth,
          background: style.backgroundColor,
          cornerHitsButton: corner === element || element.contains(corner),
        };
      });
      expect(infoStyle.width).toBe(30);
      expect(infoStyle.height).toBe(30);
      expect(infoStyle.radius).toBe('50%');
      expect(infoStyle.borderWidth).toBe('0px');
      expect(infoStyle.cornerHitsButton).toBe(false);
      await info.hover();
      const infoHover = await info.evaluate((element) => getComputedStyle(element).backgroundColor);
      expect(infoHover).toBe(hoverToken);
      await expect(page.locator('[role="tooltip"][data-open="true"]')).toHaveCount(1);
      await page.screenshot({
        path: join(evidenceDir, `after-info-hover-${theme.toLowerCase()}.png`),
      });

      await focusByTab(page, selectedButton);
      const focusStyle = await selectedButton.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
        };
      });
      expect(focusStyle).toEqual({
        outlineStyle: 'solid',
        outlineWidth: '2px',
        outlineOffset: '2px',
      });
      await expect(
        page.locator('[role="tooltip"]').filter({ hasText: 'Settings' }),
      ).toHaveAttribute('data-open', 'true');
    }

    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await page.keyboard.press('Control+Shift+Alt+D');
    await page.locator('[data-trigger="start"]').click();
    await page.keyboard.press('Control+Shift+Alt+D');
    const textStyles = page.getByRole('button', { name: 'Text styles', exact: true });
    await expect(textStyles).toBeVisible();
    const textStyleShape = await textStyles.evaluate((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const corner = document.elementFromPoint(rect.left + 0.5, rect.top + 0.5);
      return {
        width: rect.width,
        height: rect.height,
        radius: style.borderRadius,
        borderWidth: style.borderWidth,
        cornerHitsButton: corner === element || element.contains(corner),
      };
    });
    expect(textStyleShape).toEqual({
      width: 30,
      height: 30,
      radius: '50%',
      borderWidth: '0px',
      cornerHitsButton: false,
    });
  } finally {
    await app.close();
  }
});
