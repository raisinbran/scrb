import { readFile, stat } from 'node:fs/promises';
import { activeSpeakers, resolveDisplay, StaleRevisionError, type Library } from '@scrb/storage';
import { toGeneratedSummary } from '@scrb/app-core';
import {
  ContractError,
  type BackendEvents,
  type EventName,
  type SummaryLength,
} from '@scrb/contracts';
import {
  extractItems,
  writeSummary,
  LlamaServerWorker,
} from '../../../../packages/summary/src/index.ts';
import type { MeetingSummary, Transcript } from '../../../../packages/summary/src/types.ts';
import type { CallHandlers } from './dispatch.ts';

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;

export interface SummaryRunnerInput {
  transcript: Transcript;
  length: SummaryLength;
  signal: AbortSignal;
  progress(done: number, total: number): void;
}
export type RunSummary = (input: SummaryRunnerInput) => Promise<MeetingSummary>;

export function createConfiguredSummaryRunner(configPath: string): RunSummary {
  return async ({ transcript, length, signal, progress }) => {
    const parsed = JSON.parse(await readFile(configPath, 'utf8')) as {
      serverPath: string;
      modelPath: string;
    };
    if (!parsed.serverPath || !parsed.modelPath) throw new Error('Summary model is not configured');
    const [binary, model] = await Promise.all([stat(parsed.serverPath), stat(parsed.modelPath)]);
    if (!binary.isFile() || !model.isFile()) throw new Error('Summary model is unavailable');
    const worker = new LlamaServerWorker({
      serverPath: parsed.serverPath,
      modelPath: parsed.modelPath,
    });
    try {
      await worker.start();
      const extracted = await extractItems(transcript, worker, { signal, onProgress: progress });
      return await writeSummary(extracted, worker, length, { signal });
    } finally {
      await worker.stop();
    }
  };
}

/** Keeps a generated summary linked to precisely the transcript revision it read. */
export class SummaryCoordinator {
  private active: { meetingId: string; abort: AbortController; done: Promise<void> } | null = null;
  private starting = false;

  constructor(
    private readonly library: Library,
    private readonly run: RunSummary,
    private readonly emit: Emit,
  ) {}

  isGenerating(meetingId: string): boolean {
    return this.active?.meetingId === meetingId;
  }

  private async generate(input: { meetingId: string; length: SummaryLength }): Promise<void> {
    if (this.active || this.starting) {
      throw new ContractError({
        code: 'conflict',
        message: 'A summary is already being generated.',
      });
    }
    this.starting = true;
    try {
      const meeting = await this.library.getMeeting(input.meetingId);
      if (
        meeting.status === 'recording' ||
        meeting.status === 'importing' ||
        meeting.status === 'finalPassRunning'
      ) {
        throw new ContractError({
          code: 'conflict',
          message: 'Finish transcription before summarizing.',
        });
      }
      const abort = new AbortController();
      const done = this.work(input, abort);
      this.active = { meetingId: input.meetingId, abort, done };
    } finally {
      this.starting = false;
    }
  }

  private async work(
    input: { meetingId: string; length: SummaryLength },
    abort: AbortController,
  ): Promise<void> {
    const { meetingId, length } = input;
    const emit = (
      stage: 'extracting' | 'coverageCheck' | 'writing' | 'done' | 'failed',
      fraction: number,
      message?: string,
    ) =>
      this.emit('summaryProgress', { meetingId, stage, fraction, ...(message ? { message } : {}) });
    try {
      const snapshot = await this.library.readTranscript(meetingId);
      const speakerNames = new Map(
        activeSpeakers(snapshot).map((speaker) => [speaker.id, speaker.name ?? speaker.label]),
      );
      const transcript: Transcript = {
        lines: resolveDisplay(snapshot).flatMap((segment) => {
          const text = segment.tokens
            .map((token) => token.text)
            .join(' ')
            .trim();
          if (!text) return [];
          return [
            {
              startSec: (segment.tokens[0]?.startMs ?? 0) / 1000,
              speaker: speakerNames.get(segment.speakerId) ?? 'Speaker',
              text,
            },
          ];
        }),
      };
      if (transcript.lines.length === 0) throw new Error('No transcript available');
      emit('extracting', 0);
      const summary = await this.run({
        transcript,
        length,
        signal: abort.signal,
        progress: (done, total) => emit('extracting', total > 0 ? (done / total) * 0.9 : 0),
      });
      if (abort.signal.aborted) return;
      emit('writing', 0.95);
      await this.library.saveGeneratedSummary(
        meetingId,
        toGeneratedSummary(summary, new Date().toISOString()),
        snapshot.revision,
      );
      emit('done', 1);
    } catch (error) {
      if (!abort.signal.aborted) {
        emit(
          'failed',
          0,
          error instanceof StaleRevisionError
            ? 'Transcript changed while generating. Retry the summary.'
            : 'Summary generation failed. Your transcript was kept.',
        );
      }
    } finally {
      if (this.active?.meetingId === meetingId) this.active = null;
    }
  }

  get handlers(): CallHandlers {
    return {
      generateSummary: (input) =>
        this.generate(input as { meetingId: string; length: SummaryLength }),
    };
  }

  async shutdown(): Promise<void> {
    const active = this.active;
    if (!active) return;
    active.abort.abort();
    await active.done;
  }
}
