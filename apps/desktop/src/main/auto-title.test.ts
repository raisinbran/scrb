// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LargeModelGate } from '@scrb/app-core';
import { Library } from '@scrb/storage';
import { AutoTitleController, datePrefix, type AutoTitleDeps } from './auto-title.ts';
import { SummaryUnavailableError, type ModelServer, type SummaryEngine } from './summary.ts';

// Invented meeting: started 2026-11-13 15:00 local time.
const STARTED = new Date(2026, 10, 13, 15, 0).toISOString();
const word = (id: string, text: string, startMs: number) => ({
  id,
  text,
  startMs,
  endMs: startMs + 400,
});
const speaker = {
  id: 'a',
  label: 'Speaker A',
  name: 'Sam',
  profileId: null,
  userNamed: false,
  mergedInto: null,
};

describe('AutoTitleController', () => {
  let library: Library;
  let recording: boolean;
  let generated: Array<string | null | Error>;
  let calls: number;
  let servers: { starts: number; stops: number };
  let unavailable: boolean;
  let titles: AutoTitleController;

  const engine: SummaryEngine = {
    server: (): ModelServer => ({
      modelName: 'fake',
      pid: undefined,
      complete: () => Promise.reject(new Error('not used')),
      start: async () => {
        servers.starts += 1;
      },
      stop: async () => {
        servers.stops += 1;
      },
    }),
    extractItems: () => Promise.reject(new Error('not used')),
    writeSummary: () => Promise.reject(new Error('not used')),
  };

  const deps = (): AutoTitleDeps => ({
    library,
    gate: new LargeModelGate(),
    engine,
    recordingActive: () => recording,
    readPaths: async () => {
      if (unavailable) throw new SummaryUnavailableError('no model');
      return { serverPath: '/fake/server', modelPath: '/fake/model.gguf' };
    },
    generate: async () => {
      calls += 1;
      const next = generated.shift() ?? null;
      if (next instanceof Error) throw next;
      return next;
    },
  });

  const seed = async (
    over: { title?: string; status?: 'ready' | 'finalPassRunning'; words?: boolean } = {},
  ) => {
    const meeting = await library.createMeeting({
      title: over.title ?? 'Meeting',
      date: STARTED,
      source: 'recorded',
      status: over.status ?? 'ready',
      durationMs: 5000,
    });
    if (over.words !== false) {
      await library.appendSegments(
        meeting.id,
        [
          {
            id: 's1',
            speakerId: 'a',
            track: 'meeting',
            pass: 'final',
            words: [word('w1', 'Budget', 0), word('w2', 'review', 500)],
          },
        ],
        [speaker],
      );
    }
    return meeting.id;
  };
  const titleOf = async (id: string) => (await library.getMeeting(id)).title;
  const run = async (id: string) => {
    titles.enqueue(id);
    await titles.idle();
  };

  beforeEach(async () => {
    library = await Library.open({ root: mkdtempSync(join(tmpdir(), 'scrb-title-')) });
    recording = false;
    generated = [];
    calls = 0;
    unavailable = false;
    servers = { starts: 0, stops: 0 };
    titles = new AutoTitleController(deps());
  });

  afterEach(async () => {
    await titles.shutdown();
    await library.close();
  });

  it('formats the local start date', () => {
    expect(datePrefix(STARTED)).toBe('20261113');
    expect(datePrefix('not a date')).toBe('');
  });

  it('names a default-titled meeting with the date and the generated title', async () => {
    const id = await seed();
    generated = ['Quarterly Budget Review'];
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Quarterly Budget Review');
    expect(servers).toEqual({ starts: 1, stops: 1 });
  });

  it('never overwrites a title the user set', async () => {
    const id = await seed({ title: 'Board prep' });
    generated = ['Quarterly Budget Review'];
    await run(id);
    expect(await titleOf(id)).toBe('Board prep');
    expect(calls).toBe(0);
  });

  it('is idempotent: a generated title is final, across a restart too', async () => {
    const id = await seed();
    generated = ['Quarterly Budget Review', 'Something Else'];
    await run(id);
    await run(id);
    titles = new AutoTitleController(deps());
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Quarterly Budget Review');
    expect(calls).toBe(1);
  });

  it('leaves a title the user changed after the app named it', async () => {
    const id = await seed();
    generated = ['First Name'];
    await run(id);
    await library.updateMeeting(id, { title: 'My own name' });
    generated = ['Second Name'];
    await run(id);
    expect(await titleOf(id)).toBe('My own name');
  });

  it('does not overwrite a rename that lands while the model runs', async () => {
    const id = await seed();
    titles = new AutoTitleController({
      ...deps(),
      generate: async () => {
        await library.updateMeeting(id, { title: 'Renamed meanwhile' });
        return 'Quarterly Budget Review';
      },
    });
    await run(id);
    expect(await titleOf(id)).toBe('Renamed meanwhile');
  });

  it('falls back to date and a neutral label when the model is not set up', async () => {
    const id = await seed();
    unavailable = true;
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Meeting');
    expect(servers.starts).toBe(0);
  });

  it('retries a fallback on a later run, once the model works', async () => {
    const id = await seed();
    unavailable = true;
    await run(id);
    unavailable = false;
    generated = ['Quarterly Budget Review'];
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Quarterly Budget Review');
  });

  it.each([
    ['null', null],
    ['an error', new Error('model crashed')],
  ])('falls back when the model gives %s, and still stops the server', async (_name, outcome) => {
    const id = await seed();
    generated = [outcome];
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Meeting');
    expect(servers.stops).toBe(servers.starts);
  });

  it('falls back without calling the model for an empty transcript', async () => {
    const id = await seed({ words: false });
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Meeting');
    expect(calls).toBe(0);
  });

  it('falls back instead of loading the model while a recording is active', async () => {
    const id = await seed();
    recording = true;
    generated = ['Quarterly Budget Review'];
    await run(id);
    expect(await titleOf(id)).toBe('20261113 Meeting');
    expect(servers.starts).toBe(0);
  });

  it('waits for the meeting to be ready', async () => {
    const id = await seed({ status: 'finalPassRunning' });
    generated = ['Quarterly Budget Review'];
    await run(id);
    expect(await titleOf(id)).toBe('Meeting');
  });

  it('ignores a meeting that no longer exists', async () => {
    await run('missing');
    expect(calls).toBe(0);
  });
});
