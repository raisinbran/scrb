import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '@scrb/storage';

// Gate 7 walkthrough on this Mac: invented speech, the real import, search, export and delete.
const helper = process.env['SCRB_CAPTURE_HELPER'];
const config = process.env['SCRB_FINAL_PASS_CONFIG'];

const SPEECH =
  'Pelican harbour budget. We approved the orchard lantern purchase for Tuesday. ' +
  'Marguerite will order forty lanterns, and Dmitri confirms the courier schedule. ' +
  'The next review is in March.';

const tokens = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** True when every needle token appears in the haystack, in the same order. */
const isSubsequence = (needle: string[], haystack: string[]) => {
  let at = 0;
  for (const word of haystack) if (word === needle[at]) at += 1;
  return at === needle.length;
};

const docxText = (file: string) =>
  [
    ...execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' }).matchAll(
      /<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g,
    ),
  ]
    .map((m) => m[1])
    .join(' ');

// macOS PDFKit reads the text layer; there is no PDF text library in the repo.
const pdfText = (file: string) =>
  execFileSync(
    'osascript',
    [
      '-l',
      'JavaScript',
      '-e',
      'ObjC.import("PDFKit"); function run(a) { return ObjC.unwrap($.PDFDocument.alloc.initWithURL($.NSURL.fileURLWithPath(a[0])).string); }',
      file,
    ],
    { encoding: 'utf8' },
  );

/** Every path under a folder, relative, including hidden ones. */
const walk = (root: string, base = root): string[] =>
  !existsSync(root)
    ? []
    : readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
        const full = join(root, entry.name);
        const rel = full.slice(base.length + 1);
        return entry.isDirectory() ? [rel, ...walk(full, base)] : [rel];
      });

const newUserData = (prefix: string) => {
  const userData = mkdtempSync(join(tmpdir(), prefix));
  const root = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root }));
  return { userData, root };
};

test.describe('Gate 7 walkthrough', () => {
  test('import, search, export both formats, then fully delete', async () => {
    test.skip(!helper || !config, 'set SCRB_CAPTURE_HELPER and SCRB_FINAL_PASS_CONFIG to run');
    test.setTimeout(900_000);
    const { userData, root } = newUserData('scrb-gate7-');
    const aiff = join(userData, 'invented.aiff');
    const wav = join(userData, 'gate7 invented talk.wav');
    execFileSync('say', ['-o', aiff, SPEECH]);
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav]);

    const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
    try {
      await app.evaluate(({ dialog }, path) => {
        dialog.showOpenDialog = (async () => ({
          canceled: false,
          filePaths: [path],
        })) as unknown as typeof dialog.showOpenDialog;
      }, wav);
      const page = await app.firstWindow();
      await page.evaluate(() =>
        window.scribeBridge?.invoke('updateSettings', {
          location: { country: 'US', usState: 'NY' },
        }),
      );
      await page.reload();

      // Import from the Recordings screen.
      await page.getByRole('button', { name: 'Recordings', exact: true }).click();
      await page
        .getByRole('button', { name: /^Import/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Import', exact: true }).click();
      const metaFiles = () =>
        existsSync(join(root, 'meetings'))
          ? readdirSync(join(root, 'meetings'))
              .filter((name) => !name.startsWith('.'))
              .map((name) => join(root, 'meetings', name))
          : [];
      const status = () => {
        const folder = metaFiles()[0];
        return folder && existsSync(join(folder, 'meeting.json'))
          ? JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8')).status
          : 'none';
      };
      await expect.poll(status, { timeout: 600_000, intervals: [2000] }).toBe('ready');
      const folder = metaFiles()[0] as string;
      const meta = JSON.parse(readFileSync(join(folder, 'meeting.json'), 'utf8'));
      expect(meta.source).toBe('imported');
      const transcript = JSON.parse(readFileSync(join(folder, 'transcript.json'), 'utf8'));
      const lines: string[] = transcript.segments.map((s: { words: { text: string }[] }) =>
        s.words.map((w) => w.text).join(' '),
      );
      const spoken = tokens(lines.join(' '));
      expect(spoken.length).toBeGreaterThan(15);

      // Find it by a transcript word, then open it.
      const probe = ['lanterns', 'lantern', 'orchard', 'pelican', 'harbour', 'courier'].find((w) =>
        spoken.includes(w),
      ) as string;
      expect(probe, 'the transcript should contain a word that was spoken').toBeDefined();
      // meeting.json can say ready a moment before the search index answers, so wait for the index.
      await expect
        .poll(
          async () =>
            JSON.stringify(
              await page.evaluate(
                (w) => window.scribeBridge?.invoke('searchMeetings', { query: w }),
                probe,
              ),
            ).includes(meta.id),
          { timeout: 60_000 },
        )
        .toBe(true);
      await page.getByRole('searchbox', { name: 'Search recordings' }).fill(probe);
      const row = page.getByRole('button', { name: /\d+ speakers?/ }).first();
      await expect(row).toBeVisible({ timeout: 15_000 });
      // The list can refresh once more as the import finishes, so retry until the meeting opens.
      const transcriptTab = page.getByRole('tab', { name: 'Transcript' });
      await expect(async () => {
        await row.click({ timeout: 5_000 });
        await expect(transcriptTab).toBeVisible({ timeout: 3_000 });
      }).toPass({ timeout: 60_000 });
      await transcriptTab.click();
      await expect(page.getByText(probe, { exact: false }).first()).toBeVisible();

      // Export both formats through the dialog.
      const exportsDir = join(folder, 'exports');
      for (const format of ['DOCX', 'PDF']) {
        await page.getByRole('button', { name: 'Export', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Export meeting' });
        await dialog.getByLabel(format, { exact: true }).check();
        await dialog.getByRole('button', { name: 'Export', exact: true }).click();
        await expect(dialog.getByRole('status')).toContainText('Saved', { timeout: 120_000 });
        await dialog.getByRole('button', { name: 'Close' }).click();
      }
      const exported = readdirSync(exportsDir).sort();
      expect(exported.map((f) => f.split('.').pop())).toEqual(['docx', 'pdf']);
      const fromDocx = tokens(docxText(join(exportsDir, exported[0] as string)));
      const fromPdf = tokens(pdfText(join(exportsDir, exported[1] as string)));
      expect(isSubsequence(spoken, fromDocx), 'DOCX holds the whole transcript in order').toBe(
        true,
      );
      expect(isSubsequence(spoken, fromPdf), 'PDF holds the whole transcript in order').toBe(true);

      // Delete it from the meeting screen.
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
      await page
        .getByRole('dialog', { name: 'Delete meeting' })
        .getByRole('button', { name: 'Delete', exact: true })
        .click();
      await expect(page.getByText(/^Deleted /)).toBeVisible({ timeout: 60_000 });
      expect(walk(join(root, 'meetings')), 'the UI said deleted: nothing may be left').toEqual([]);

      // Residue: no folder, audio, export or index trace of the meeting's id.
      const id: string = meta.id;
      const everything = walk(root);
      expect(everything.filter((p) => p.includes(id) || p.includes('gate7'))).toEqual([]);
      expect(everything.filter((p) => /\.(wav|aiff|docx|pdf|m4a|opus|flac)$/i.test(p))).toEqual([]);
      for (const file of everything) {
        const full = join(root, file);
        // The app log keeps an audit line with the id (no content); it is reported, not scanned.
        if (statSync(full).isDirectory() || file.startsWith('logs')) continue;
        const bytes = readFileSync(full);
        expect(bytes.includes(id), `${file} still names the deleted meeting`).toBe(false);
      }
      const found = await page.evaluate(
        async ([word]) => window.scribeBridge?.invoke('searchMeetings', { query: word }),
        [probe] as const,
      );
      expect(JSON.stringify(found)).toContain('[]');
      expect(JSON.stringify(found)).not.toContain(id);
      const listed = await page.evaluate(() => window.scribeBridge?.invoke('listMeetings', {}));
      expect(JSON.stringify(listed)).not.toContain(id);
      // The source file the owner picked is never touched.
      expect(existsSync(wav)).toBe(true);
      console.log('gate7 user data', userData, 'probe word', probe);
    } finally {
      await app.close();
    }
  });

  test('auto-delete removes exactly the chosen data', async () => {
    test.setTimeout(240_000);
    const { root } = newUserData('scrb-gate7-auto-');
    const old = new Date(Date.now() - 200 * 86_400_000);
    const seeded = async (now: () => Date, title: string, word: string) => {
      const library = await Library.open({ root, now });
      const { id } = await library.createMeeting({
        title,
        date: now().toISOString(),
        source: 'recorded',
        status: 'ready',
        durationMs: 60_000,
      });
      await library.appendSegments(
        id,
        [
          {
            id: 's1',
            speakerId: 'a',
            track: 'meeting',
            pass: 'final',
            words: [{ id: 'w1', text: word, startMs: 0, endMs: 400 }],
          },
        ],
        [
          {
            id: 'a',
            label: 'Speaker 1',
            name: 'Ana',
            profileId: null,
            userNamed: true,
            mergedInto: null,
          },
        ],
      );
      const paths = library.meetingPaths(id);
      for (const dir of [paths.audioMicrophone, paths.audioMeeting]) {
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'chunk-000.wav'), 'invented audio bytes');
        writeFileSync(join(dir, 'chunks.json'), '{}');
      }
      writeFileSync(join(paths.audio, 'session.json'), '{}');
      writeFileSync(join(paths.exports, `${title}.docx`), 'invented export');
      const folder = paths.folder;
      return { library, id, folder, paths };
    };
    // Two meetings that entered the library long ago, one that is new.
    const oldA = await seeded(() => old, 'Old alpha', 'zebrafinch');
    await oldA.library.close();
    const oldB = await seeded(() => old, 'Old bravo', 'quillwort');
    oldB.library.settings.setAutoDelete({ period: '30d', scope: 'audio' });
    await oldB.library.close();
    const fresh = await seeded(() => new Date(), 'Fresh charlie', 'marmoset');
    const ids = { a: oldA.id, b: oldB.id, c: fresh.id };
    const snapshot = (folder: string) => walk(folder).sort();
    const beforeFresh = snapshot(fresh.folder);
    const beforeOldA = snapshot(oldA.folder);
    await fresh.library.close();

    const launch = async () =>
      electron.launch({ args: ['.', `--user-data-dir=${join(root, '..')}`] });
    const settle = async (app: ElectronApplication, done: () => boolean) => {
      await app.firstWindow();
      await expect.poll(done, { timeout: 60_000, intervals: [500] }).toBe(true);
    };

    // Round 1: delete audio only.
    let app = await launch();
    try {
      await settle(app, () => !existsSync(oldA.paths.audioMeeting));
    } finally {
      await app.close();
    }
    for (const old of [oldA, oldB]) {
      expect(existsSync(old.paths.audioMicrophone)).toBe(false);
      expect(existsSync(old.paths.audioMeeting)).toBe(false);
      expect(existsSync(join(old.paths.audio, 'session.json'))).toBe(false);
      expect(existsSync(old.paths.transcript)).toBe(true);
      expect(readdirSync(old.paths.exports)).toHaveLength(1);
      expect(JSON.parse(readFileSync(old.paths.meta, 'utf8')).audioDeletedAt).not.toBeNull();
    }
    // The text-side files of the old meeting are exactly what they were, minus the audio.
    expect(snapshot(oldA.folder).filter((p) => !p.startsWith('audio'))).toEqual(
      beforeOldA.filter((p) => !p.startsWith('audio')),
    );
    expect(snapshot(fresh.folder)).toEqual(beforeFresh);

    // Round 2: whole meeting. Only the two old meetings go.
    const reopen = await Library.open({ root });
    reopen.settings.setAutoDelete({ period: '30d', scope: 'meeting' });
    await reopen.close();
    app = await launch();
    try {
      await settle(app, () => !existsSync(oldA.folder) && !existsSync(oldB.folder));
      const page = await app.firstWindow();
      const listed = JSON.stringify(
        await page.evaluate(() => window.scribeBridge?.invoke('listMeetings', {})),
      );
      expect(listed).not.toContain(ids.a);
      expect(listed).not.toContain(ids.b);
      expect(listed).toContain(ids.c);
    } finally {
      await app.close();
    }
    expect(snapshot(fresh.folder)).toEqual(beforeFresh);
    const left = walk(join(root, 'meetings')).filter(
      (p) => !p.startsWith(fresh.folder.split('/').pop() as string),
    );
    expect(left.filter((p) => p.includes(ids.a) || p.includes(ids.b))).toEqual([]);
    for (const file of walk(root)) {
      const full = join(root, file);
      if (statSync(full).isDirectory() || file.startsWith('logs')) continue;
      const bytes = readFileSync(full);
      expect(bytes.includes(ids.a), `${file} still names a deleted meeting`).toBe(false);
      expect(bytes.includes(ids.b), `${file} still names a deleted meeting`).toBe(false);
    }
  });
});
