import * as fs from 'node:fs/promises';
import { atomicWriteFile } from './atomic.ts';
import { StorageError } from './errors.ts';

/** One speaker's voice from a final pass: a unit vector and how many segments it came from. */
export interface VoiceEntry {
  speakerId: string;
  embedding: Float32Array;
  segments: number;
}

/** `voices.json`: numbers only, never audio. One model id covers every entry. */
export interface VoicesFile {
  modelId: string;
  speakers: VoiceEntry[];
}

interface StoredVoices {
  schemaVersion: 1;
  modelId: string;
  speakers: { speakerId: string; embedding: string; segments: number }[];
}

export function encodeVoices(voices: VoicesFile): string {
  const stored: StoredVoices = {
    schemaVersion: 1,
    modelId: voices.modelId,
    speakers: voices.speakers.map((entry) => ({
      speakerId: entry.speakerId,
      embedding: Buffer.from(
        entry.embedding.buffer,
        entry.embedding.byteOffset,
        entry.embedding.byteLength,
      ).toString('base64'),
      segments: entry.segments,
    })),
  };
  return JSON.stringify(stored);
}

function corrupt(): StorageError {
  return new StorageError('VOICES_CORRUPT', 'voices.json is not readable');
}

export function decodeVoices(text: string): VoicesFile {
  let parsed: Partial<StoredVoices>;
  try {
    parsed = JSON.parse(text) as Partial<StoredVoices>;
  } catch {
    throw corrupt();
  }
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.modelId !== 'string' ||
    !Array.isArray(parsed.speakers)
  ) {
    throw corrupt();
  }
  const speakers = parsed.speakers.map((raw): VoiceEntry => {
    if (
      typeof raw?.speakerId !== 'string' ||
      typeof raw.embedding !== 'string' ||
      !Number.isInteger(raw.segments) ||
      raw.segments < 1
    ) {
      throw corrupt();
    }
    const bytes = Buffer.from(raw.embedding, 'base64');
    if (bytes.length === 0 || bytes.length % 4 !== 0) throw corrupt();
    const copy = new Uint8Array(bytes);
    const embedding = new Float32Array(copy.buffer, 0, copy.byteLength / 4);
    if (embedding.some((value) => !Number.isFinite(value))) throw corrupt();
    return { speakerId: raw.speakerId, embedding, segments: raw.segments };
  });
  return { modelId: parsed.modelId, speakers };
}

/** Null when the file does not exist; throws `VOICES_CORRUPT` when it exists but is unusable. */
export async function readVoicesFile(file: string): Promise<VoicesFile | null> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  return decodeVoices(text);
}

export function writeVoicesFile(file: string, voices: VoicesFile): Promise<void> {
  return atomicWriteFile(file, encodeVoices(voices));
}
