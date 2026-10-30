import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach } from 'vitest';
import type { Segment, Speaker, Track, TranscriptFile, Word } from '../src/formats/transcript.ts';
import { emptyTranscript } from '../src/formats/transcript.ts';

const made: string[] = [];

export async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'scrb-storage-'));
  made.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(made.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

let wordCounter = 0;

/** Words 500 ms apart from `startMs`. */
export function words(text: string, startMs: number, prefix = 'w'): Word[] {
  return text.split(' ').map((token, index) => {
    wordCounter += 1;
    return {
      id: `${prefix}${wordCounter}`,
      text: token,
      startMs: startMs + index * 500,
      endMs: startMs + index * 500 + 400,
    };
  });
}

export function segment(
  id: string,
  speakerId: string,
  wordList: Word[],
  pass: Segment['pass'] = 'live',
  track: Track = 'meeting',
): Segment {
  return { id, speakerId, track, pass, words: wordList };
}

export function speaker(id: string, label = id): Speaker {
  return { id, label, name: null, profileId: null, userNamed: false, mergedInto: null };
}

export function transcript(segments: Segment[], speakers: Speaker[]): TranscriptFile {
  return { ...emptyTranscript('m1'), segments, speakers };
}
