import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '@scrb/storage';

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

async function inspectSplit(page: Page, width: number) {
  const result = await page.evaluate(() => {
    const split = document.querySelector<HTMLElement>('[data-split]');
    const content = document.querySelector<HTMLElement>('[data-split-content]');
    if (!split || !content) return null;
    const column = split.firstElementChild as HTMLElement;
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    return {
      viewportWidth: innerWidth,
      pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      column: box(column),
      content: box(content),
      columnScroll: column.scrollWidth - column.clientWidth,
      contentScroll: content.scrollWidth - content.clientWidth,
    };
  });
  expect(result).not.toBeNull();
  expect(result!.viewportWidth).toBeLessThanOrEqual(width + 1);
  expect(result!.pageOverflow).toBe(false);
  expect(result!.columnScroll).toBeLessThanOrEqual(1);
  expect(result!.contentScroll).toBeLessThanOrEqual(1);
  expect(result!.content.x).toBeGreaterThan(result!.column.x + result!.column.width - 1);
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

test('Speakers shows its empty state in the list column and fits at 760px', async () => {
  const { app, page } = await openMockApp(testUserData('scrb-speakers-layout-'));
  try {
    await page.getByRole('button', { name: 'Speakers', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Speakers' })).toBeVisible();
    await expect(page.getByText('Profiles appear after your first recording.')).toBeVisible();
    await inspectSplit(page, 1280);
    await page.setViewportSize({ width: 760, height: 720 });
    await inspectSplit(page, 760);
    await page.screenshot({ path: join(evidenceDir, 'after-speakers-narrow.png') });
  } finally {
    await app.close();
  }
});

for (const width of [900, 720]) {
  test(`keeps populated voice-profile actions inside the detail card at ${width}px`, async () => {
    const userData = testUserData(`scrb-speakers-profile-${width}-`);
    const library = await Library.open({ root: join(userData, 'library') });
    library.voiceProfiles.create({
      modelId: 'invented-test-model',
      embedding: new Float32Array([1, 0]),
      name: 'Invented Profile One',
    });
    library.voiceProfiles.create({
      modelId: 'invented-test-model',
      embedding: new Float32Array([0, 1]),
      name: 'Invented Profile Two',
    });
    await library.close();
    const { app, page } = await openMockApp(userData);
    try {
      await page.setViewportSize({ width, height: 720 });
      await page.getByRole('button', { name: 'Speakers', exact: true }).click();
      await expect(page.getByRole('list', { name: 'Voice profiles' })).toBeVisible();
      await inspectSplit(page, width);
      await page
        .getByRole('list', { name: 'Voice profiles' })
        .getByRole('button', { name: /Invented Profile One/ })
        .click();
      const card = page.getByRole('region', { name: 'Invented Profile One' });
      await expect(card).toBeVisible();
      const cardBounds = await card.boundingBox();
      expect(cardBounds).not.toBeNull();
      for (const name of [
        'Play sample of Invented Profile One',
        'Rename Invented Profile One',
        'Merge Invented Profile One into another voice',
        'Split Invented Profile One into two voices',
        'Delete Invented Profile One',
      ]) {
        const button = card.getByRole('button', { name, exact: true });
        await expect(button).toBeVisible();
        const bounds = await button.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(cardBounds!.x - 1);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
          cardBounds!.x + cardBounds!.width + 1,
        );
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(
          cardBounds!.y + cardBounds!.height + 1,
        );
      }
      await page.screenshot({
        path: join(evidenceDir, `after-speakers-${width}-populated-profile.png`),
      });
    } finally {
      await app.close();
    }
  });
}

test('places Live meters beside the source pickers and Settings Test mic above Input Profile', async () => {
  const { app, page } = await openMockApp(testUserData('scrb-audio-layout-'));
  try {
    const micPicker = page.getByRole('combobox', { name: 'Microphone', exact: true });
    const meetingPicker = page.getByRole('combobox', { name: 'Meeting app', exact: true });
    const micMeter = page.getByRole('meter', { name: 'Mic level' });
    const meetingMeter = page.getByRole('meter', { name: 'Meeting level' });
    await expect(micPicker).toBeVisible();
    await expect(meetingPicker).toBeVisible();
    await expect(micMeter).toBeVisible();
    await expect(meetingMeter).toBeVisible();
    await expect(page.getByText('Levels', { exact: true })).toBeVisible();

    const [micPickerBox, meetingPickerBox, micMeterBox, meetingMeterBox] = await Promise.all([
      micPicker.boundingBox(),
      meetingPicker.boundingBox(),
      micMeter.boundingBox(),
      meetingMeter.boundingBox(),
    ]);
    expect(micPickerBox).not.toBeNull();
    expect(meetingPickerBox).not.toBeNull();
    expect(micMeterBox).not.toBeNull();
    expect(meetingMeterBox).not.toBeNull();
    const pickersRight = Math.max(
      micPickerBox!.x + micPickerBox!.width,
      meetingPickerBox!.x + meetingPickerBox!.width,
    );
    expect(micMeterBox!.x).toBeGreaterThan(pickersRight);
    expect(meetingMeterBox!.x).toBe(micMeterBox!.x);
    expect(micMeterBox!.y).toBeLessThan(meetingMeterBox!.y);

    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    const testMic = page.getByRole('button', { name: 'Test mic', exact: true });
    const micOnlyMeter = page.getByRole('meter', { name: 'Mic level' });
    const inputProfile = page.getByRole('group', { name: /^Input Profile/ });
    await expect(testMic).toBeVisible();
    await expect(micOnlyMeter).toBeVisible();
    await expect(inputProfile).toBeVisible();
    await expect(page.getByRole('meter', { name: 'Meeting level' })).toHaveCount(0);
    const [testMicBox, compactMeterBox, profileBox] = await Promise.all([
      testMic.boundingBox(),
      micOnlyMeter.boundingBox(),
      inputProfile.boundingBox(),
    ]);
    expect(testMicBox).not.toBeNull();
    expect(compactMeterBox).not.toBeNull();
    expect(profileBox).not.toBeNull();
    expect(testMicBox!.y + testMicBox!.height).toBeLessThan(profileBox!.y + 1);
    expect(Math.abs(compactMeterBox!.y - testMicBox!.y)).toBeLessThanOrEqual(20);
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
        return {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          underline: style.textDecorationLine,
          borderBottom: style.borderBottomWidth,
        };
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
      expect(selectedStyle.underline).toBe('none');
      expect(selectedStyle.borderBottom).toBe('0px');
      await expect(selected.button).not.toHaveAttribute('title');
      expect(selected.bounds.y).toBeLessThan((await selected.button.boundingBox())!.y);
      await page.screenshot({
        path: join(evidenceDir, `after-settings-hover-${theme.toLowerCase()}.png`),
      });

      const unselected = await tooltipBounds(page, 'Help');
      const unselectedStyle = await unselected.button.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          background: style.backgroundColor,
          shadow: style.boxShadow,
          underline: style.textDecorationLine,
          borderBottom: style.borderBottomWidth,
        };
      });
      const hoverToken = await page.evaluate(() => {
        const probe = document.createElement('div');
        probe.style.background = 'var(--color-surface-hover)';
        document.body.append(probe);
        const color = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return color;
      });
      // Reposition after the tooltip layout settles so the pointer remains over the button in both
      // Windows and macOS Chromium runs.
      await unselected.button.hover();
      await expect
        .poll(() =>
          unselected.button.evaluate((element) => ({
            hovered: element.matches(':hover'),
            background: getComputedStyle(element).backgroundColor,
          })),
        )
        .toEqual({ hovered: true, background: hoverToken });
      expect(unselectedStyle.shadow).toBe('none');
      expect(unselectedStyle.underline).toBe('none');
      expect(unselectedStyle.borderBottom).toBe('0px');
      await expect(unselected.button).not.toHaveAttribute('title');
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
      const openTip = page.locator('[role="tooltip"][data-open="true"]');
      await expect(openTip).toHaveCount(1);
      const tipColors = await openTip.evaluate((node) => {
        const tip = getComputedStyle(node);
        const sample = document.createElement('span');
        sample.style.backgroundColor = 'var(--color-surface-raised)';
        sample.style.color = 'var(--color-text)';
        sample.style.borderColor = 'var(--color-border)';
        document.body.append(sample);
        const tokens = getComputedStyle(sample);
        const result = {
          actual: [tip.backgroundColor, tip.color, tip.borderTopColor],
          expected: [tokens.backgroundColor, tokens.color, tokens.borderTopColor],
        };
        sample.remove();
        return result;
      });
      expect(tipColors.actual).toEqual(tipColors.expected);
      await page.screenshot({
        path: join(evidenceDir, `after-info-hover-${theme.toLowerCase()}.png`),
      });

      await focusByTab(page, info);
      const infoFocusStyle = await info.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          outlineStyle: style.outlineStyle,
          boxShadow: style.boxShadow,
          borderRadius: style.borderRadius,
        };
      });
      expect(infoFocusStyle.outlineStyle).toBe('none');
      expect(infoFocusStyle.boxShadow).not.toBe('none');
      expect(infoFocusStyle.borderRadius).toBe('50%');
      await expect(page.locator('[role="tooltip"][data-open="true"]')).toHaveCount(1);
      await page.screenshot({
        path: join(evidenceDir, `after-info-keyboard-focus-${theme.toLowerCase()}.png`),
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

      // Suppressing pointer-only outlines must not obscure keyboard focus on either selector.
      for (const target of [
        unselected.button,
        page.getByRole('button', { name: 'Live', exact: true }),
      ]) {
        await focusByTab(page, target);
        await expect(target).toBeFocused();
        const keyboardFocus = await target.evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            focusVisible: element.matches(':focus-visible'),
            outlineStyle: style.outlineStyle,
            outlineWidth: style.outlineWidth,
            outlineOffset: style.outlineOffset,
          };
        });
        expect(keyboardFocus).toEqual({
          focusVisible: true,
          outlineStyle: 'solid',
          outlineWidth: '2px',
          outlineOffset: '2px',
        });
      }
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
