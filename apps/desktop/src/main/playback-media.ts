import { randomBytes } from 'node:crypto';
import { ContractError, type BackendEvents, type EventName, type TrackKind } from '@scrb/contracts';
import type { Library } from '@scrb/storage';
import type { CallHandlers } from './dispatch.ts';
import {
  MAX_RANGE,
  locatePlayback,
  readPlaybackChunk,
  readPlaybackTimeline,
  type PlaybackChunk,
  type PlaybackTimeline,
} from './playback-media-source.ts';

export const MEDIA_SCHEME = 'scribe-media';
const MEDIA_HOST = 'media';
const TICK_MS = 250;
/** How long a chunk's URL outlives the chunk's own length, for a reader still finishing it. */
const GRANT_GRACE_MS = 30_000;
const MEDIA_PATH = /^\/([0-9a-f]{64})\/(microphone|meeting)\/(\d{6,}\.opus)$/;
const RANGE = /^bytes=(\d+)-(\d*)$/;

type Emit = <K extends EventName>(name: K, payload: BackendEvents[K]) => void;
type LibraryAccess = Pick<Library, 'getMeeting' | 'meetingPaths'>;

interface Session {
  meetingId: string;
  nonce: string;
  /** Timeline position at `anchorAt`, on the monotonic clock. */
  anchorMs: number;
  anchorAt: number;
  timeline: PlaybackTimeline;
  /** `track/file` to the time its URL stops working. */
  grants: Map<string, number>;
}

const notFound = () => new Response('Not found', { status: 404 });

function notSaved(): ContractError {
  return new ContractError({ code: 'conflict', message: 'That audio is not saved yet.' });
}

/** Plays one meeting at a time: the clock runs here and the renderer's audio follows it. */
export class PlaybackMedia {
  private session: Session | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  /** Bumped by every start and stop, so a slower earlier call cannot act on a newer state. */
  private turn = 0;

  constructor(
    private readonly library: LibraryAccess,
    private readonly emit: Emit,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** Adds the playback calls. Audio stops first, so a delete never races an open reader. */
  wrap(handlers: CallHandlers): CallHandlers {
    const remove = handlers.deleteMeeting;
    return {
      ...handlers,
      seekAudio: (request) => this.seek(request as { meetingId: string; positionMs: number }),
      pauseAudio: async (request) => this.pause((request as { meetingId: string }).meetingId),
      getPlaybackMedia: (request) =>
        this.media(request as { meetingId: string; positionMs: number }),
      ...(remove && {
        deleteMeeting: async (request) => {
          this.revokeMeeting((request as { meetingId: string }).meetingId);
          return remove(request);
        },
      }),
    };
  }

  private position(session: Session): number {
    return session.anchorMs + (this.now() - session.anchorAt);
  }

  private async seek({ meetingId, positionMs }: { meetingId: string; positionMs: number }) {
    const turn = ++this.turn;
    const timeline = await readPlaybackTimeline(this.library, meetingId);
    if (turn !== this.turn) return;
    if (timeline.chunks.length === 0 && !timeline.live) {
      throw new ContractError({ code: 'notFound', message: 'Saved audio is unavailable.' });
    }
    const spot = locatePlayback(timeline.chunks, positionMs);
    if (!spot) {
      if (timeline.live) throw notSaved();
      this.stop();
      const endMs = Math.max(...timeline.chunks.map((chunk) => chunk.endMs));
      this.emit('playbackPosition', { meetingId, positionMs: endMs, isPlaying: false });
      return;
    }
    if (this.session?.meetingId !== meetingId) this.stop();
    this.session ??= {
      meetingId,
      nonce: randomBytes(32).toString('hex'),
      anchorMs: 0,
      anchorAt: 0,
      timeline,
      grants: new Map(),
    };
    Object.assign(this.session, { anchorMs: spot.positionMs, anchorAt: this.now(), timeline });
    this.timer ??= setInterval(() => void this.tick(), TICK_MS);
    this.emit('playbackPosition', { meetingId, positionMs: spot.positionMs, isPlaying: true });
  }

  private async tick(): Promise<void> {
    const session = this.session;
    if (!session) return;
    const positionMs = this.position(session);
    let spot = locatePlayback(session.timeline.chunks, positionMs);
    if (!spot && session.timeline.live) {
      const turn = this.turn;
      const timeline = await readPlaybackTimeline(this.library, session.meetingId).catch(
        () => null,
      );
      if (turn !== this.turn || this.session !== session) return;
      if (timeline) session.timeline = timeline;
      spot = locatePlayback(session.timeline.chunks, positionMs);
    }
    const { meetingId } = session;
    if (!spot) {
      const endMs = Math.max(0, ...session.timeline.chunks.map((chunk) => chunk.endMs));
      this.stop();
      this.emit('playbackPosition', {
        meetingId,
        positionMs: Math.round(Math.min(endMs, positionMs)),
        isPlaying: false,
      });
      return;
    }
    if (spot.positionMs > positionMs) {
      session.anchorMs = spot.positionMs;
      session.anchorAt = this.now();
    }
    this.emit('playbackPosition', {
      meetingId,
      positionMs: Math.round(spot.positionMs),
      isPlaying: true,
    });
  }

  private pause(meetingId: string): void {
    this.turn += 1;
    const session = this.session?.meetingId === meetingId ? this.session : null;
    const positionMs = session ? this.position(session) : 0;
    if (session) this.stop();
    this.emit('playbackPosition', {
      meetingId,
      positionMs: Math.round(positionMs),
      isPlaying: false,
    });
  }

  /** Stops this meeting in the renderer as well as revoking its media grants. */
  revokeMeeting(meetingId: string): void {
    if (this.session?.meetingId === meetingId) this.pause(meetingId);
  }

  /** Revokes every URL at once. Safe when nothing plays. */
  stop(): void {
    this.turn += 1;
    clearInterval(this.timer);
    this.timer = undefined;
    this.session = null;
  }

  private async media({ meetingId, positionMs }: { meetingId: string; positionMs: number }) {
    const session = this.session;
    if (session?.meetingId !== meetingId) throw notSaved();
    let timeline: PlaybackTimeline;
    try {
      timeline = await readPlaybackTimeline(this.library, meetingId);
    } catch (error) {
      if (this.session === session) {
        this.stop();
        this.emit('playbackPosition', {
          meetingId,
          positionMs: Math.round(this.position(session)),
          isPlaying: false,
        });
      }
      throw error;
    }
    if (this.session !== session) throw notSaved();
    session.timeline = timeline;
    const spot = locatePlayback(timeline.chunks, positionMs);
    if (!spot) {
      if (timeline.live) throw notSaved();
      return { chunks: [], nextPositionMs: null };
    }
    const now = this.now();
    for (const [key, expires] of session.grants) {
      if (expires <= now) session.grants.delete(key);
    }
    return {
      chunks: spot.chunks.map((chunk) => this.grant(session, chunk, now)),
      nextPositionMs: spot.nextPositionMs,
    };
  }

  private grant(session: Session, chunk: PlaybackChunk, now: number) {
    const { track, file, startMs, endMs } = chunk;
    session.grants.set(`${track}/${file}`, now + (endMs - startMs) + GRANT_GRACE_MS);
    const url = `${MEDIA_SCHEME}://${MEDIA_HOST}/${session.nonce}/${track}/${file}`;
    return { track, startMs, endMs, url };
  }

  /** The `scribe-media:` handler. Every failure looks the same, so nothing can be probed. */
  async serve(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const match = MEDIA_PATH.exec(url.pathname);
    const session = this.session;
    if (
      request.method !== 'GET' ||
      url.host !== MEDIA_HOST ||
      url.search !== '' ||
      !match ||
      !session ||
      match[1] !== session.nonce
    )
      return notFound();
    const [, , track, file] = match as unknown as [string, string, TrackKind, string];
    const expires = session.grants.get(`${track}/${file}`);
    if (expires === undefined || expires <= this.now()) return notFound();

    const header = request.headers.get('range');
    const range = header === null ? null : RANGE.exec(header);
    const start = Number(range?.[1] ?? 0);
    const last = range?.[2] ? Number(range[2]) : Infinity;
    if ((header !== null && !range) || last < start) {
      return new Response(null, { status: 416 });
    }
    try {
      const { bytes, totalBytes } = await readPlaybackChunk(
        this.library,
        session.meetingId,
        track,
        file,
        start,
        Math.min(last - start + 1, MAX_RANGE),
      );
      if (this.session !== session) return notFound();
      const whole = header === null && bytes.length === totalBytes;
      return new Response(new Uint8Array(bytes), {
        status: whole ? 200 : 206,
        headers: {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-store',
          'Content-Length': String(bytes.length),
          'Content-Type': 'audio/ogg; codecs=opus',
          'X-Content-Type-Options': 'nosniff',
          ...(!whole && {
            'Content-Range': `bytes ${start}-${start + bytes.length - 1}/${totalBytes}`,
          }),
        },
      });
    } catch {
      return notFound();
    }
  }
}
