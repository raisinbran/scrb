// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { emptyTranscript, type Library, type TranscriptFile } from '@scrb/storage';
import { StaleRevisionError } from '@scrb/storage';
import { SummaryCoordinator, type RunSummary } from './summaries.ts';

function example() {
  const transcript: TranscriptFile = emptyTranscript('invented-meeting');
  transcript.revision = 7;
  transcript.speakers = [
    {
      id: 'one',
      label: 'Speaker One',
      name: null,
      profileId: null,
      userNamed: false,
      mergedInto: null,
    },
  ];
  transcript.segments = [
    {
      id: 'seg-one',
      speakerId: 'one',
      track: 'meeting',
      pass: 'final',
      words: [{ id: 'word-one', text: 'Invented', startMs: 1000, endMs: 1500 }],
    },
  ];
  const emit = vi.fn();
  const save = vi.fn(async () => undefined);
  const library = {
    getMeeting: vi.fn(async () => ({ status: 'ready' })),
    readTranscript: vi.fn(async () => transcript),
    saveGeneratedSummary: save,
  } as unknown as Library;
  const run = vi.fn(async ({ progress }: Parameters<RunSummary>[0]) => {
    progress(1, 2);
    return {
      schemaVersion: 1 as const,
      sourceHash: 'invented-hash',
      model: 'invented-model',
      body: { length: 'brief' as const, paragraphs: ['Invented summary'] },
      actions: [],
      decisions: [],
      impacts: [],
      openQuestions: [],
      warnings: [],
    };
  });
  const coordinator = new SummaryCoordinator(library, run, emit);
  return { library, emit, save, run, coordinator };
}

describe('summary job coordination', () => {
  it('saves only a generated summary tied to the read transcript revision', async () => {
    const f = example();
    await f.coordinator.handlers.generateSummary!({
      meetingId: 'invented-meeting',
      length: 'brief',
    });
    await vi.waitFor(() =>
      expect(f.emit).toHaveBeenCalledWith('summaryProgress', {
        meetingId: 'invented-meeting',
        stage: 'done',
        fraction: 1,
      }),
    );
    expect(f.save).toHaveBeenCalledWith(
      'invented-meeting',
      expect.objectContaining({
        brief: { sections: [expect.objectContaining({ text: 'Invented summary' })] },
      }),
      7,
    );
    expect(f.run.mock.calls[0]?.[0].transcript.lines).toEqual([
      {
        startSec: 1,
        speaker: 'Speaker One',
        text: 'Invented',
      },
    ]);
    await f.coordinator.shutdown();
  });

  it('fails safely when a transcript is revised during generation', async () => {
    const f = example();
    f.save.mockRejectedValueOnce(new StaleRevisionError(7, 8));
    await f.coordinator.handlers.generateSummary!({
      meetingId: 'invented-meeting',
      length: 'full',
    });
    await vi.waitFor(() =>
      expect(f.emit).toHaveBeenCalledWith('summaryProgress', {
        meetingId: 'invented-meeting',
        stage: 'failed',
        fraction: 0,
        message: 'Transcript changed while generating. Retry the summary.',
      }),
    );
    await f.coordinator.shutdown();
  });

  it('refuses overlapping generation instead of running two large models', async () => {
    const f = example();
    let finish!: () => void;
    f.run.mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return {
        schemaVersion: 1,
        sourceHash: 'invented',
        model: 'invented',
        body: { length: 'brief', paragraphs: ['Invented'] },
        actions: [],
        decisions: [],
        impacts: [],
        openQuestions: [],
        warnings: [],
      };
    });
    await f.coordinator.handlers.generateSummary!({
      meetingId: 'invented-meeting',
      length: 'brief',
    });
    await expect(
      f.coordinator.handlers.generateSummary!({
        meetingId: 'invented-meeting',
        length: 'brief',
      }),
    ).rejects.toMatchObject({ code: 'conflict' });
    finish();
    await f.coordinator.shutdown();
  });
});
