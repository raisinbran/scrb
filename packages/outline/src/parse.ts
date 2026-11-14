import { MAX_ITEMS, MAX_TEXT_CHARS } from './constants.js';
import type { OutlineItem, ParseResult } from './types.js';

type Marker = 'heading' | 'numeric' | 'letter' | 'bullet' | 'plain';

interface Line {
  indent: number;
  marker: Marker;
  explicitLevel: number | null;
  text: string;
}

const NAME = "[A-Z][\\p{L}.'’-]*(?: [A-Z][\\p{L}.'’-]*){0,2}";
const OWNER_PAREN = new RegExp(`\\s*\\((${NAME})\\)\\s*$`, 'u');
const OWNER_DASH = new RegExp(`\\s+[-–—]\\s+(${NAME})\\s*$`, 'u');

function indentWidth(raw: string): number {
  let width = 0;
  for (const ch of raw) {
    if (ch === ' ') width += 1;
    else if (ch === '\t') width += 2;
    else break;
  }
  return width;
}

function classify(trimmed: string, indent: number): Line | null {
  let m = /^(#{1,6})\s+(.*)$/.exec(trimmed);
  if (m) return { indent, marker: 'heading', explicitLevel: m[1]!.length, text: m[2]! };
  m = /^(\d+(?:\.\d+)*)[.)]?\s+(.*)$/.exec(trimmed);
  if (m) return { indent, marker: 'numeric', explicitLevel: m[1]!.split('.').length, text: m[2]! };
  m = /^\(?([A-Za-z])[.)]\s+(.*)$/.exec(trimmed);
  if (m) return { indent, marker: 'letter', explicitLevel: null, text: m[2]! };
  m = /^[-*•+]\s+(.*)$/.exec(trimmed);
  if (m) return { indent, marker: 'bullet', explicitLevel: null, text: m[1]! };
  return { indent, marker: 'plain', explicitLevel: null, text: trimmed };
}

function splitOwner(text: string): { text: string; owner?: string } {
  const m = OWNER_PAREN.exec(text) ?? OWNER_DASH.exec(text);
  if (!m) return { text };
  const rest = text.slice(0, m.index).trim();
  return rest ? { text: rest, owner: m[1]! } : { text };
}

/** Pure parser: pasted outline text to a flat, ordered item list with levels. */
export function parseOutline(
  input: string,
  previous: readonly OutlineItem[] = [],
  nextId = 1,
): ParseResult {
  const startId = highestIssued(previous, nextId);
  if (input.trim() === '') return { items: [], notes: [], nextId: startId, error: 'empty' };
  if (input.length > MAX_TEXT_CHARS)
    return { items: [], notes: [], nextId: startId, error: 'tooLong' };

  const lines: Line[] = [];
  for (const raw of input.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = classify(raw.trim(), indentWidth(raw));
    if (line && line.text.trim() !== '') lines.push(line);
  }
  if (lines.length > MAX_ITEMS)
    return { items: [], notes: [], nextId: startId, error: 'tooManyItems' };

  const notes: string[] = [];
  const items: OutlineItem[] = [];
  const stack: { indent: number; level: number; major: boolean }[] = [];
  let prevLevel = 0;

  for (const line of lines) {
    const major = line.marker === 'heading' || line.marker === 'numeric' || line.marker === 'plain';
    let level: number;
    if (line.explicitLevel !== null) {
      level = line.explicitLevel;
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) stack.pop();
    } else {
      let parent: (typeof stack)[number] | undefined;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        const entry = stack[i]!;
        if (entry.indent < line.indent || (entry.indent === line.indent && entry.major && !major)) {
          parent = entry;
          break;
        }
      }
      level = parent ? parent.level + 1 : 1;
      while (stack.length > 0 && (!parent || stack[stack.length - 1]! !== parent)) stack.pop();
    }
    if (level > prevLevel + 1) {
      notes.push(`Line "${line.text.slice(0, 40)}" skips a level; read as level ${prevLevel + 1}.`);
      level = prevLevel + 1;
    }
    stack.push({ indent: line.indent, level, major });
    prevLevel = level;
    const { text, owner } = splitOwner(line.text.trim());
    const item: OutlineItem = { id: '', level, text };
    if (owner) item.ownerName = owner;
    items.push(item);
  }
  const issued = assignIds(items, previous, startId);
  return { items, notes, nextId: issued };
}

function pathKeys(items: readonly OutlineItem[]): string[] {
  const trail: string[] = [];
  return items.map((it) => {
    trail.length = it.level - 1;
    trail.push(it.text.trim().toLowerCase());
    return trail.join('\u0000');
  });
}

/**
 * Ids are stable across outline revisions: an item keeps the id of the earlier item with the
 * same heading text under the same parent headings (matched in order). Anything else, including
 * an edited heading, gets a new id that is never reused (the caller keeps `nextId`, which also covers deleted headings), so a pin made on an old id can never
 * attach to a different heading.
 */
function highestIssued(previous: readonly OutlineItem[], nextId: number): number {
  let next = Math.max(1, nextId);
  for (const p of previous) {
    const n = /^o(\d+)$/.exec(p.id);
    if (n) next = Math.max(next, Number(n[1]) + 1);
  }
  return next;
}

function assignIds(items: OutlineItem[], previous: readonly OutlineItem[], first: number): number {
  const old = pathKeys(previous);
  const taken = new Set<number>();
  const keys = pathKeys(items);
  let next = first;
  items.forEach((item, i) => {
    const hit = old.findIndex((k, j) => k === keys[i] && !taken.has(j));
    if (hit >= 0) {
      taken.add(hit);
      item.id = previous[hit]!.id;
    } else {
      item.id = `o${next}`;
      next += 1;
    }
  });
  return next;
}
