import type { LargeModelGate } from '@scrb/app-core';
import { errorFields, type Library, type MeetingMeta } from '@scrb/storage';
import type { LlmClient, Transcript } from '@scrb/summary';
import {
  SummaryUnavailableError,
  withModelServer,
  type SummaryDeps,
  type SummaryPaths,
} from './summary.ts';
import { toEngineTranscript } from './meetings.ts';

/** The title a recording gets until it is named; only a meeting still carrying it is auto-titled. */
export const DEFAULT_TITLE = 'Meeting';
const FALLBACK_LABEL = 'Meeting';

export interface AutoTitleDeps extends Pick<SummaryDeps, 'engine' | 'pidFile' | 'readPaths'> {
  library: Library;
  gate: LargeModelGate;
  recordingActive: () => boolean;
  generate: (
    transcript: Transcript,
    llm: LlmClient,
    options: { signal?: AbortSignal },
  ) => Promise<string | null>;
}

/** `YYYYMMDD` of the meeting start in the computer's local time. */
export function datePrefix(startedAt: string): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

/** A title still the app's to set: the default, or its own earlier fallback and nothing else. */
export function isAutoTitleable(meeting: MeetingMeta): boolean {
  if (meeting.status !== 'ready') return false;
  const auto = meeting.autoTitle;
  if (auto === undefined) return meeting.title === DEFAULT_TITLE;
  return auto.kind === 'fallback' && meeting.title === auto.text;
}

/**
 * Names a meeting after its final pass, once, in the background. It never delays readiness and
 * never touches a title the user chose. A model that is missing or fails gives date plus a neutral
 * label. Recording always wins over the model, as for summaries.
 */
export class AutoTitleController {
  private readonly waiting: string[] = [];
  private running: Promise<void> | null = null;
  private abort = new AbortController();
  private closing = false;

  constructor(private readonly deps: AutoTitleDeps) {}

  enqueue(meetingId: string): void {
    if (this.closing || this.waiting.includes(meetingId)) return;
    this.waiting.push(meetingId);
    this.running ??= this.drain();
  }

  /** Resolves once nothing is queued or running. */
  async idle(): Promise<void> {
    await this.running;
  }

  recordingStarted(): void {
    this.abort.abort();
  }

  async shutdown(): Promise<void> {
    this.closing = true;
    this.waiting.length = 0;
    this.abort.abort();
    await this.running;
  }

  private async drain(): Promise<void> {
    for (let id = this.waiting.shift(); id !== undefined; id = this.waiting.shift()) {
      if (this.abort.signal.aborted && !this.closing) {
        this.abort = new AbortController();
      }
      try {
        await this.title(id);
      } catch (error) {
        this.deps.library.logger.log('error', 'auto-title-failed', {
          meetingId: id,
          ...errorFields(error),
        });
      }
    }
    this.running = null;
  }

  private async title(meetingId: string): Promise<void> {
    const { library } = this.deps;
    const meeting = await library.getMeeting(meetingId).catch(() => null);
    if (!meeting || !isAutoTitleable(meeting)) return;
    const prefix = datePrefix(meeting.date);
    const generated = await this.generate(meetingId);
    if (generated === 'shutdown') return;
    const text =
      generated === null
        ? [prefix, FALLBACK_LABEL].filter(Boolean).join(' ')
        : [prefix, generated].filter(Boolean).join(' ');
    // Read again: the user may have renamed the meeting while the model ran.
    const latest = await library.getMeeting(meetingId).catch(() => null);
    if (!latest || !isAutoTitleable(latest)) return;
    await library.updateMeeting(meetingId, {
      title: text,
      autoTitle: { kind: generated === null ? 'fallback' : 'generated', text },
    });
  }

  /** The model's title, null for "use the fallback", or 'shutdown' to leave the meeting alone. */
  private async generate(meetingId: string): Promise<string | 'shutdown' | null> {
    const { library, gate } = this.deps;
    const signal = this.abort.signal;
    try {
      const transcript = toEngineTranscript(await library.readTranscript(meetingId)).engine;
      if (transcript.lines.length === 0 || this.deps.recordingActive()) return null;
      const paths: SummaryPaths = await this.deps.readPaths();
      return await gate.run(async () => {
        if (signal.aborted || this.deps.recordingActive()) return null;
        return withModelServer(this.deps, paths, undefined, signal, (server) =>
          this.deps.generate(transcript, server, { signal }),
        );
      }, signal);
    } catch (error) {
      if (this.closing) return 'shutdown';
      if (!(error instanceof SummaryUnavailableError) && !signal.aborted) {
        library.logger.log('warn', 'auto-title-model-failed', errorFields(error));
      }
      return null;
    }
  }
}
