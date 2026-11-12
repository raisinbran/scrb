import { normalizeVocabularyTerm } from './db/settings.ts';
import type { Correction } from './formats/transcript.ts';

export const SUGGESTION_MEETING_LIMIT = 50;
export const SUGGESTION_RECORD_LIMIT = 5_000;
export const SUGGESTION_RESULT_LIMIT = 100;

const MIN_CORRECTIONS = 3;
const MIN_MEETINGS = 2;
const MAX_WORDS = 4;
const MAX_CHARS = 100;
const MAX_FORMS = 3;

export interface VocabularySuggestion {
  /** The newest meeting's correction (then lowest ID) that accepting the suggestion remembers. */
  meetingId: string;
  correctionId: string;
  term: string;
  misheard: string[];
  correctionCount: number;
  meetingCount: number;
}

export interface VocabularySuggestions {
  suggestions: VocabularySuggestion[];
  /** A meeting could not be read, so some suggestions may be missing. */
  incomplete: boolean;
  /** A scan limit was reached before every meeting was read. */
  truncated: boolean;
}

export interface ScannedMeeting {
  meetingId: string;
  corrections: Correction[];
}

export interface SuggestionGroup extends VocabularySuggestion {
  correctionIds: string[];
  replacements: string[];
}

/** `scanned` is newest meeting first. `excluded` rejects remembered, deleted and dismissed terms. */
export function buildSuggestionGroups(
  scanned: ScannedMeeting[],
  excluded: (term: string, replacements: string[]) => boolean,
): SuggestionGroup[] {
  interface Entry {
    meetingId: string;
    rank: number;
    correction: Correction;
    term: string;
    heard: string;
  }
  const entries: Entry[] = [];
  scanned.forEach(({ meetingId, corrections }, rank) => {
    for (const correction of corrections) {
      if (correction.state !== 'active') continue;
      const term = normalizeVocabularyTerm(correction.replacement);
      const heard = normalizeVocabularyTerm(correction.original.text);
      if (term === '' || heard === '' || term === heard) continue;
      entries.push({ meetingId, rank, correction, term, heard });
    }
  });

  const termsByForm = new Map<string, Set<string>>();
  for (const { heard, term } of entries) {
    termsByForm.set(heard, (termsByForm.get(heard) ?? new Set()).add(term));
  }

  const byTerm = new Map<string, Entry[]>();
  for (const entry of entries) {
    if (entry.correction.remember) continue;
    if (entry.term.length > MAX_CHARS || entry.term.split(' ').length > MAX_WORDS) continue;
    byTerm.set(entry.term, [...(byTerm.get(entry.term) ?? []), entry]);
  }

  const groups: SuggestionGroup[] = [];
  for (const [term, members] of byTerm) {
    const ids = new Set(members.map((m) => m.correction.id));
    const meetings = new Set(members.map((m) => m.meetingId));
    if (ids.size < MIN_CORRECTIONS || meetings.size < MIN_MEETINGS) continue;
    const formMeetings = new Map<string, Set<string>>();
    const formCounts = new Map<string, number>();
    for (const { heard, meetingId } of members) {
      formMeetings.set(heard, (formMeetings.get(heard) ?? new Set()).add(meetingId));
      formCounts.set(heard, (formCounts.get(heard) ?? 0) + 1);
    }
    if (![...formMeetings.values()].some((set) => set.size >= 2)) continue;
    if ([...formMeetings.keys()].some((form) => (termsByForm.get(form)?.size ?? 0) > 1)) continue;
    const replacements = [...new Set(members.map((m) => m.correction.replacement.trim()))];
    if (excluded(term, replacements)) continue;
    const [representative] = [...members].sort(
      (a, b) => a.rank - b.rank || (a.correction.id < b.correction.id ? -1 : 1),
    ) as [Entry];
    const misheard = [...formCounts]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, MAX_FORMS)
      .map(([form]) => form);
    groups.push({
      meetingId: representative.meetingId,
      correctionId: representative.correction.id,
      term: representative.correction.replacement.trim(),
      misheard,
      correctionCount: ids.size,
      meetingCount: meetings.size,
      correctionIds: [...ids],
      replacements,
    });
  }
  return groups
    .sort(
      (a, b) =>
        b.correctionCount - a.correctionCount ||
        b.meetingCount - a.meetingCount ||
        (normalizeVocabularyTerm(a.term) < normalizeVocabularyTerm(b.term) ? -1 : 1),
    )
    .slice(0, SUGGESTION_RESULT_LIMIT);
}
