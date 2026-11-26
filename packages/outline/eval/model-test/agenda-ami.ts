import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgendaMeeting, RefFact } from './agenda.js';
import { loadMeeting } from '../ami.js';

/**
 * AMI meetings as agenda meetings. AMI has no agenda-and-notes gold, so the agenda below is invented and
 * the reference facts are AMI's own annotated decisions and actions, filed under it by keyword.
 * Dev-only. AMI stays outside git (see scripts/dev-assets.sh ami).
 */
export const AMI_AGENDA = [
  '1. Opening and introductions',
  '2. Finance and market',
  '3. Design and functions',
  '4. Next steps',
].join('\n');

const FINANCE = /\b(price|selling|sell|sold|cost|profit|euro|market|financ)/i;

function sentences(xml: string, tag: string): string[] {
  const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(xml);
  if (!m) return [];
  return [...m[1]!.matchAll(/<sentence[^>]*>([\s\S]*?)<\/sentence>/g)]
    .flatMap((s) => s[1]!.split(/\n-?/))
    .map((s) =>
      s
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

export function loadAmiAgenda(dir: string, id: string): AgendaMeeting | null {
  const m = loadMeeting(dir, id);
  if (!m) return null;
  const idx = m.words.map((w, i) => ({ w, s: m.wordKeys[i]!.speaker, i }));
  idx.sort((a, b) => a.w.startMs - b.w.startMs || a.i - b.i);
  const lines: { speaker: string; text: string }[] = [];
  let cur: { speaker: string; words: string[]; end: number } | null = null;
  for (const { w, s } of idx) {
    if (!cur || cur.speaker !== s || w.startMs - cur.end > 1500 || cur.words.length >= 40) {
      if (cur) lines.push({ speaker: cur.speaker, text: cur.words.join(' ') });
      cur = { speaker: s, words: [], end: w.endMs };
    }
    cur.words.push(w.text);
    cur.end = w.endMs;
  }
  if (cur) lines.push({ speaker: cur.speaker, text: cur.words.join(' ') });
  const xml = readFileSync(join(dir, 'abstractive', `${id}.abssumm.xml`), 'latin1');
  const facts: RefFact[] = [
    ...sentences(xml, 'decisions').map((text): RefFact => ({
      topic: FINANCE.test(text) ? 'o2' : 'o3',
      kind: 'decision',
      text,
    })),
    ...sentences(xml, 'actions').map((text): RefFact => ({ topic: 'o4', kind: 'action', text })),
  ];
  return {
    agenda: AMI_AGENDA,
    outline: [
      'Opening and introductions',
      'Finance and market',
      'Design and functions',
      'Next steps',
    ],
    reference: [],
    lines,
    facts,
  };
}
