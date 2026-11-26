import * as fs from 'node:fs/promises';
import { atomicWriteFile } from './atomic.ts';

/** One offered speaker-to-profile match. Ids and a score only: no voice data. */
export interface StoredSuggestion {
  speakerId: string;
  profileId: string;
  score: number;
  status: 'pending' | 'declined';
}

/**
 * `suggestions.json`. A missing, damaged or unrecognised file reads as no suggestions: it only
 * saves the owner a question, so it never blocks anything.
 */
export async function readSuggestionsFile(file: string): Promise<StoredSuggestion[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as {
      schemaVersion?: unknown;
      suggestions?: unknown;
    };
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.suggestions)) return [];
    return parsed.suggestions.flatMap((raw: Partial<StoredSuggestion> | null) =>
      typeof raw?.speakerId === 'string' &&
      typeof raw.profileId === 'string' &&
      typeof raw.score === 'number' &&
      (raw.status === 'pending' || raw.status === 'declined')
        ? [
            {
              speakerId: raw.speakerId,
              profileId: raw.profileId,
              score: raw.score,
              status: raw.status,
            },
          ]
        : [],
    );
  } catch {
    return [];
  }
}

export async function writeSuggestionsFile(
  file: string,
  suggestions: StoredSuggestion[],
): Promise<void> {
  if (suggestions.length === 0) {
    await fs.rm(file, { force: true });
    return;
  }
  await atomicWriteFile(file, JSON.stringify({ schemaVersion: 1, suggestions }));
}
