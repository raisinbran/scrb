import { _electron as electron, expect, test } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '@scrb/storage';

test('manual deletion while a meeting is open removes its files and contribution rows', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'scrb-v-g-delete-'));
  const libraryParent = mkdtempSync(join(tmpdir(), 'scrb-v-g-delete-library-'));
  const root = join(libraryParent, 'library');
  mkdirSync(root, { recursive: true });
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root }));

  const library = await Library.open({ root });
  const { id } = await library.createMeeting({
    title: 'Invented retention check',
    status: 'ready',
  });
  const files = library.meetingPaths(id);
  writeFileSync(join(files.audioMeeting, 'invented.wav'), 'invented audio bytes');
  await library.saveVoices(id, {
    modelId: 'invented-retention-model',
    speakers: [
      {
        speakerId: 'invented-speaker',
        embedding: new Float32Array([1, 0]),
        segments: 8,
      },
    ],
  });
  const profile = library.voiceProfiles.create({
    name: 'Invented speaker',
    modelId: 'invented-retention-model',
    embedding: new Float32Array([1, 0]),
  });
  library.voiceProfiles.setContribution({
    profileId: profile.id,
    meetingId: id,
    embedding: new Float32Array([1, 0]),
    sampleCount: 8,
    modelId: 'invented-retention-model',
  });
  await library.close();

  const app = await electron.launch({
    args: ['.', '--scrb-isolated-test-profile', `--user-data-dir=${userData}`],
    env: { ...process.env, SCRB_DEV_AUTO_LOCATION: '1' },
  });
  try {
    const page = await app.firstWindow();
    await expect.poll(() => page.evaluate(() => Boolean(window.scribeBridge))).toBe(true);
    const settings = await page.evaluate(() =>
      window.scribeBridge?.invoke('getSettings', undefined),
    );
    expect(settings).toMatchObject({
      ok: true,
      value: { storageLocation: realpathSync(root) },
    });
    const meetings = await page.evaluate(() => window.scribeBridge?.invoke('listMeetings', {}));
    expect(meetings).toMatchObject({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({ id, title: 'Invented retention check' }),
      ]),
    });
    await page.getByRole('button', { name: 'Recordings', exact: true }).click();
    await page.getByRole('button', { name: /^Invented retention check/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete meeting' });
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.getByText('Deleted Invented retention check.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Invented retention check', exact: true }),
    ).toHaveCount(0);
  } finally {
    await app.close();
  }

  expect(existsSync(files.folder)).toBe(false);
  const db = new DatabaseSync(join(root, 'index.sqlite'));
  try {
    expect(db.prepare('SELECT id FROM meetings WHERE id = ?').get(id)).toBeUndefined();
    expect(
      db.prepare('SELECT meeting_id FROM voice_profile_meetings WHERE meeting_id = ?').all(id),
    ).toEqual([]);
  } finally {
    db.close();
  }
});
