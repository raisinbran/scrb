import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TranscriptWord } from '../src/types.js';

/** Reads AMI annotation XML (words and topics). Fixtures stay outside git. */

const FUNCTIONAL = new Set(['opening', 'closing', 'agenda/equipment issues', 'chitchat', 'other']);

export interface RefTopic {
  label: string;
  functional: boolean;
  freeText: boolean;
  /** [speaker, firstIndex, lastIndex] ranges of word ids in that speaker's file. */
  ranges: [string, number, number][];
  kids: RefTopic[];
}

export interface AmiMeeting {
  id: string;
  words: TranscriptWord[];
  /** Parallel to words: speaker file letter plus numeric index of the word id. */
  wordKeys: { speaker: string; index: number }[];
  topics: RefTopic[];
  freeText: boolean;
}

function topicNames(dir: string): Map<string, string> {
  const text = readFileSync(join(dir, 'ontologies', 'default-topics.xml'), 'latin1');
  const map = new Map<string, string>();
  for (const m of text.matchAll(/nite:id="(top\.\d+)"\s+name="([^"]*)"/g)) map.set(m[1]!, m[2]!);
  return map;
}

function loadWords(
  dir: string,
  id: string,
): { words: TranscriptWord[]; keys: { speaker: string; index: number }[] } {
  const out: { w: TranscriptWord; key: { speaker: string; index: number } }[] = [];
  const files = readdirSync(join(dir, 'words')).filter(
    (f) => f.startsWith(`${id}.`) && f.endsWith('.words.xml'),
  );
  for (const file of files) {
    const speaker = file.split('.')[1]!;
    const text = readFileSync(join(dir, 'words', file), 'latin1');
    for (const m of text.matchAll(/<w ([^>]*)>([^<]*)<\/w>/g)) {
      const attrs = m[1]!;
      if (/punc="true"/.test(attrs)) continue;
      const idMatch = /nite:id="([^"]+)"/.exec(attrs);
      const s = /starttime="([\d.]+)"/.exec(attrs);
      const e = /endtime="([\d.]+)"/.exec(attrs);
      const index = /words(\d+)"/.exec(attrs);
      if (!idMatch || !s || !e || !index) continue;
      const startMs = Math.round(Number(s[1]) * 1000);
      const endMs = Math.round(Number(e[1]) * 1000);
      out.push({
        w: {
          id: idMatch[1]!,
          startMs,
          endMs: Math.max(endMs, startMs + 1),
          text: decode(m[2]!),
          speaker,
        },
        key: { speaker, index: Number(index[1]) },
      });
    }
  }
  // Like the app's transcript: words stay together in per-speaker turns (pause over 1 s ends a
  // turn) and turns are ordered by start time, so overlapped speech is not interleaved word by word.
  out.sort((a, b) => a.key.speaker.localeCompare(b.key.speaker) || a.key.index - b.key.index);
  const turns: (typeof out)[] = [];
  for (const o of out) {
    const turn = turns[turns.length - 1];
    const prev = turn?.[turn.length - 1];
    if (turn && prev && prev.key.speaker === o.key.speaker && o.w.startMs - prev.w.endMs <= 1000)
      turn.push(o);
    else turns.push([o]);
  }
  turns.sort((a, b) => a[0]!.w.startMs - b[0]!.w.startMs || a[0]!.w.id.localeCompare(b[0]!.w.id));
  const flat = turns.flat();
  return { words: flat.map((o) => o.w), keys: flat.map((o) => o.key) };
}

function decode(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function loadTopics(
  dir: string,
  id: string,
  names: Map<string, string>,
): { topics: RefTopic[]; freeText: boolean } | null {
  const path = join(dir, 'topics', `${id}.topic.xml`);
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'latin1');
  const roots: RefTopic[] = [];
  const stack: RefTopic[] = [];
  let freeText = false;
  for (const tag of text.matchAll(/<(\/?)(topic|nite:pointer|nite:child)\b([^>]*?)(\/?)>/g)) {
    const [, close, name, attrs, selfClose] = tag;
    if (name === 'topic') {
      if (close) {
        stack.pop();
        continue;
      }
      const desc = /other_description="([^"]*)"/.exec(attrs!);
      const node: RefTopic = {
        label: desc ? decode(desc[1]!) : '',
        functional: false,
        freeText: Boolean(desc),
        ranges: [],
        kids: [],
      };
      if (desc) freeText = true;
      (stack.length ? stack[stack.length - 1]!.kids : roots).push(node);
      if (!selfClose) stack.push(node);
    } else if (name === 'nite:pointer' && stack.length) {
      const m = /#id\((top\.\d+)\)/.exec(attrs!);
      const node = stack[stack.length - 1]!;
      if (m && !node.freeText) node.label = names.get(m[1]!) ?? '';
    } else if (name === 'nite:child' && stack.length) {
      const m = /\.([A-Z])\.words\.xml#id\([^)]*?words(\d+)\)(?:\.\.id\([^)]*?words(\d+)\))?/.exec(
        attrs!,
      );
      if (m) stack[stack.length - 1]!.ranges.push([m[1]!, Number(m[2]), Number(m[3] ?? m[2])]);
    }
  }
  const mark = (t: RefTopic): void => {
    t.functional = FUNCTIONAL.has(t.label) || t.label === '';
    t.kids.forEach(mark);
  };
  roots.forEach(mark);
  return { topics: roots, freeText };
}

export function listMeetings(dir: string): string[] {
  return readdirSync(join(dir, 'topics'))
    .filter((f) => f.endsWith('.topic.xml'))
    .map((f) => f.replace('.topic.xml', ''))
    .sort();
}

export function loadMeeting(dir: string, id: string): AmiMeeting | null {
  const t = loadTopics(dir, id, topicNames(dir));
  if (!t) return null;
  const { words, keys } = loadWords(dir, id);
  if (words.length === 0) return null;
  return { id, words, wordKeys: keys, topics: t.topics, freeText: t.freeText };
}
