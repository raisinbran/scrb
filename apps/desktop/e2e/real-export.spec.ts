import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Library } from '@scrb/storage';

// Real Electron, invented data: both formats are written by the real handler into the meeting's folder.
test('exports an invented transcript to real DOCX and PDF files', async () => {
  test.setTimeout(120_000);
  const userData = mkdtempSync(join(tmpdir(), 'scrb-export-e2e-'));
  const root = join(userData, 'library');
  writeFileSync(join(userData, 'library-location.json'), JSON.stringify({ root }));
  const library = await Library.open({ root });
  const { id } = await library.createMeeting({
    title: 'Invented export check',
    date: '2026-11-03T10:00:00Z',
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
        words: [
          { id: 'w1', text: 'Invented', startMs: 0, endMs: 400 },
          { id: 'w2', text: 'sentence', startMs: 500, endMs: 900 },
        ],
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
  const exportsDir = library.meetingPaths(id).exports;
  await library.close();

  const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`] });
  try {
    const page = await app.firstWindow();
    const results = await page.evaluate(async (meetingId) => {
      const bridge = window.scribeBridge;
      if (!bridge) throw new Error('no bridge');
      const events: { ok: boolean; fileName?: string; message?: string }[] = [];
      bridge.subscribe('exportFinished', (payload) =>
        events.push(payload as { ok: boolean; fileName?: string; message?: string }),
      );
      const options = {
        title: true,
        date: true,
        duration: true,
        speakerNames: true,
        timestamps: true,
        showCorrections: true,
      };
      for (const format of ['docx', 'pdf']) {
        await bridge.invoke('exportMeeting', {
          meetingId,
          content: 'transcript',
          format,
          transcript: options,
          summary: { length: 'brief', openQuestions: true, sourceTimestamps: true },
        });
      }
      const until = Date.now() + 60_000;
      while (events.length < 2 && Date.now() < until) await new Promise((r) => setTimeout(r, 200));
      return events;
    }, id);
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    const files = readdirSync(exportsDir).sort();
    expect(files).toEqual([
      'Invented export check-2026-11-03.docx',
      'Invented export check-2026-11-03.pdf',
    ]);
    const docx = readFileSync(join(exportsDir, files[0] as string));
    const pdf = readFileSync(join(exportsDir, files[1] as string));
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  } finally {
    await app.close();
  }
});
