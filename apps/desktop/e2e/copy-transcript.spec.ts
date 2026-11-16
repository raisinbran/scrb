import { _electron as electron, expect, test } from '@playwright/test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('copies an invented saved transcript through the Electron clipboard', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'scrb-copy-transcript-'));
  const library = join(userData, 'library');
  const folder = join(library, 'meetings', 'Invented copy meeting');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root: library }));
  const now = '2026-11-15T00:00:00.000Z';
  writeFileSync(
    join(folder, 'meeting.json'),
    JSON.stringify({
      schemaVersion: 1,
      id: 'invented-copy-meeting',
      title: 'Invented copy meeting',
      date: now,
      createdAt: now,
      durationMs: 10_000,
      source: 'recorded',
      status: 'ready',
      audioDeletedAt: null,
      buildVoiceProfiles: false,
    }),
  );
  writeFileSync(
    join(folder, 'transcript.json'),
    JSON.stringify({
      schemaVersion: 2,
      meetingId: 'invented-copy-meeting',
      revision: 1,
      speakers: [
        {
          id: 'invented-speaker',
          label: 'Invented speaker',
          name: null,
          profileId: null,
          userNamed: false,
          mergedInto: null,
        },
      ],
      segments: [
        {
          id: 'invented-segment',
          speakerId: 'invented-speaker',
          track: 'meeting',
          pass: 'final',
          words: [
            { id: 'invented-word', text: 'invented corrected text', startMs: 1000, endMs: 2500 },
          ],
        },
      ],
      gaps: [],
      corrections: [],
      speakerOverrides: [],
      undoStack: [],
      redoStack: [],
    }),
  );

  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    const page = await app.firstWindow();
    await page.evaluate(() =>
      window.scribeBridge?.invoke('updateSettings', { location: { country: 'US', usState: 'NY' } }),
    );
    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    await page.getByText('Invented copy meeting').first().click();
    await expect(page.getByRole('button', { name: 'Copy transcript' })).toBeEnabled();
    // Avoid the browser's normal mouse-focus change so the assertion covers only
    // whether native keyboard selection and copying still work after this action.
    await page
      .getByRole('button', { name: 'Copy transcript' })
      .evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByRole('status')).toHaveText('Transcript copied.');
    const clipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(clipboardText).toBe('Invented speaker: invented corrected text');

    // Native select-all here covers rendered page text only. It does not stand in for
    // the dedicated action's full-transcript copy, which reads TranscriptData directly.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+A`);
    const selectedText = await page.evaluate(() => window.getSelection()?.toString() ?? '');
    expect(selectedText).toContain('invented corrected text');
    await page.keyboard.press(`${modifier}+C`);
    const nativeClipboardText = await app.evaluate(({ clipboard }) => clipboard.readText());
    expect(nativeClipboardText).toContain('invented corrected text');
  } finally {
    await app.close();
  }
});
