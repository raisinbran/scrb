export interface LiveSnapshotSegment {
  pass: string;
  track: string;
  words: { endMs: number }[];
}

/** Watch the meeting track independently so microphone activity cannot hide a stall. */
export class LiveProgressWatch {
  private lastMeetingMs = 0;
  private lastAdvanceAt: number;

  constructor(
    startedAt: number,
    private readonly limitMs: number,
  ) {
    this.lastAdvanceAt = startedAt;
  }

  observe(at: number, segments: LiveSnapshotSegment[]) {
    const meeting = segments
      .filter((s) => s.pass === 'live' && s.track === 'meeting')
      .flatMap((s) => s.words);
    const mic = segments
      .filter((s) => s.pass === 'live' && s.track === 'microphone')
      .flatMap((s) => s.words);
    const endMs = meeting.reduce((end, w) => Math.max(end, w.endMs), 0);
    if (endMs > this.lastMeetingMs) {
      this.lastMeetingMs = endMs;
      this.lastAdvanceAt = at;
    }
    return {
      meetingWords: meeting.length,
      micWords: mic.length,
      lastMeetingMs: this.lastMeetingMs,
      sinceProgressMs: at - this.lastAdvanceAt,
      stalled: at - this.lastAdvanceAt >= this.limitMs,
    };
  }
}

export function requirePhysicalInputs(env: Record<string, string | undefined>): void {
  for (const key of ['QA_EVIDENCE', 'SCRB_CAPTURE_HELPER', 'SCRB_LIVE_CONFIG']) {
    if (!env[key]) throw new Error(`Physical verification requires ${key}`);
  }
}
