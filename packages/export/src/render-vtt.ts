import type { ExportMeeting, ExportSegment } from './types.js';

export interface VttOptions {
  /** Wrap each cue in a `<v Name>` voice tag. Default true. */
  speakerNames?: boolean;
}

const MAX_LINE_CHARS = 42;
const MAX_LINES = 2;
const MAX_CUE_MS = 7000;
const MAX_WORD_GAP_MS = 2000;
const MIN_CUE_MS = 500;
const ESTIMATED_WORD_MS = 350;

interface Word {
  text: string;
  startMs: number;
  endMs: number;
}

interface Cue {
  startMs: number;
  endMs: number;
  speaker: string;
  lines: string[];
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Voice annotations may not hold line breaks or `>`; names are plain text. */
function annotation(name: string): string {
  return escapeText(name.replace(/\s+/g, ' ').trim());
}

export function formatVttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor(total / 60_000) % 60;
  const seconds = Math.floor(total / 1000) % 60;
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}.${pad(total % 1000, 3)}`;
}

/** Splits corrected text into words, each with its own timing or an estimate. */
function wordsOf(segment: ExportSegment): Word[] {
  const words: Word[] = [];
  let cursor = Math.max(0, segment.startMs);
  for (const part of segment.parts) {
    const pieces = part.text.split(/\s+/).filter((piece) => piece.length > 0);
    const { startMs, endMs } = part;
    const timed = startMs !== undefined && endMs !== undefined;
    // A part with timing shares its span evenly between its words.
    const span = timed ? Math.max(1, endMs - startMs) / pieces.length : ESTIMATED_WORD_MS;
    pieces.forEach((text, index) => {
      const from = timed ? Math.max(0, startMs) + span * index : cursor;
      words.push({ text, startMs: from, endMs: from + span });
      cursor = from + span;
    });
  }
  return words;
}

function cuesOf(segment: ExportSegment, speaker: string): Cue[] {
  const words = wordsOf(segment);
  const cues: Cue[] = [];
  let lines: string[] = [];
  let current = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    if (current) lines.push(current);
    if (lines.length > 0) cues.push({ startMs: start, endMs: end, speaker, lines });
    lines = [];
    current = '';
  };
  for (const word of words) {
    if (!current && lines.length === 0) {
      start = word.startMs;
    } else if (word.startMs - end > MAX_WORD_GAP_MS || word.endMs - start > MAX_CUE_MS) {
      flush();
      start = word.startMs;
    }
    const joined = current ? `${current} ${word.text}` : word.text;
    if (current && joined.length > MAX_LINE_CHARS) {
      if (lines.length + 1 >= MAX_LINES) {
        flush();
        start = word.startMs;
        current = word.text;
      } else {
        lines.push(current);
        current = word.text;
      }
    } else {
      current = joined;
    }
    end = Math.max(end, word.endMs);
  }
  flush();
  return cues;
}

/**
 * WebVTT captions of the corrected transcript. Cues never overlap and never go
 * backwards; a speaker change always starts a new cue.
 */
export function renderVtt(meeting: ExportMeeting, options: VttOptions = {}): string {
  const names = new Map(meeting.speakers.map((speaker) => [speaker.id, speaker.name]));
  const all: Cue[] = [];
  for (const segment of meeting.segments) {
    const name = segment.speakerId === null ? undefined : names.get(segment.speakerId);
    all.push(...cuesOf(segment, name?.trim() || 'Unknown speaker'));
  }
  // Stable sort keeps the stored order for cues that start together.
  all.sort((a, b) => a.startMs - b.startMs);
  const voiced = options.speakerNames !== false;
  const blocks: string[] = [];
  let previousEnd = 0;
  all.forEach((cue, index) => {
    const startMs = Math.max(Math.round(cue.startMs), previousEnd);
    const endMs = Math.max(Math.round(cue.endMs), startMs + MIN_CUE_MS);
    previousEnd = endMs;
    const body = cue.lines.map(escapeText).join('\n');
    const text = voiced ? `<v ${annotation(cue.speaker)}>${body}</v>` : body;
    blocks.push(`${index + 1}\n${formatVttTime(startMs)} --> ${formatVttTime(endMs)}\n${text}`);
  });
  return `WEBVTT\n\n${blocks.map((block) => `${block}\n`).join('\n')}`;
}
