import type { AmiMeeting, RefTopic } from './ami.js';

/** A reference outline built from AMI topic labels, with the true label of every word. */
export interface Reference {
  /** Outline entries in order: level 1 or 2 and their text. */
  entries: { level: 1 | 2; text: string }[];
  /** Per word: index into entries, or null when the dialog belongs to no heading. */
  wordEntry: (number | null)[];
}

interface Slot {
  key: string;
  level: 1 | 2;
  text: string;
  parent: string | null;
  firstMs: number;
}

export function buildReference(meeting: AmiMeeting): Reference {
  const wordSlot: (string | null)[] = new Array(meeting.words.length).fill(null);
  const slots = new Map<string, Slot>();
  const lookup = new Map<string, number>();
  meeting.wordKeys.forEach((k, i) => lookup.set(`${k.speaker}:${k.index}`, i));

  const claim = (topic: RefTopic, key: string | null): void => {
    for (const [speaker, first, last] of topic.ranges) {
      for (let idx = first; idx <= last; idx += 1) {
        const w = lookup.get(`${speaker}:${idx}`);
        if (w === undefined) continue;
        wordSlot[w] = key;
        for (let k = key; k; k = slots.get(k)!.parent) {
          const slot = slots.get(k)!;
          slot.firstMs = Math.min(slot.firstMs, meeting.words[w]!.startMs);
        }
      }
    }
  };

  const visit = (topic: RefTopic, parentKey: string | null): void => {
    let key = parentKey;
    if (!topic.functional) {
      key = parentKey ? `${parentKey} / ${topic.label}` : topic.label;
      if (!slots.has(key))
        slots.set(key, {
          key,
          level: parentKey ? 2 : 1,
          text: topic.label,
          parent: parentKey,
          firstMs: Infinity,
        });
    }
    claim(topic, key);
    for (const kid of topic.kids) visit(kid, key && !topic.functional ? key : parentKey);
  };
  for (const top of meeting.topics) visit(top, null);

  // A child topic with the same label as its parent adds nothing.
  const used = [...slots.values()].filter((s) => Number.isFinite(s.firstMs));
  const top = used.filter((s) => s.level === 1).sort((a, b) => a.firstMs - b.firstMs);
  const entries: Reference['entries'] = [];
  const index = new Map<string, number>();
  for (const t of top) {
    index.set(t.key, entries.length);
    entries.push({ level: 1, text: t.text });
    for (const c of used.filter((s) => s.parent === t.key).sort((a, b) => a.firstMs - b.firstMs)) {
      index.set(c.key, entries.length);
      entries.push({ level: 2, text: c.text });
    }
  }
  // A child whose parent had no words of its own still needs its parent heading.
  return { entries, wordEntry: wordSlot.map((k) => (k && index.has(k) ? index.get(k)! : null)) };
}
