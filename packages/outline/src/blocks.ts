import { BLOCK_MAX_MS, BLOCK_PAUSE_MS } from './constants.js';
import type { Block, TranscriptWord } from './types.js';

export interface PinAssignment {
  pinId: string;
  itemId: string | null;
}

export interface BlockOptions {
  pauseMs?: number;
  maxMs?: number;
}

/**
 * Cuts time-ordered words into blocks: one speaker, no pause of `pauseMs` or more,
 * at most `maxMs` long. Pinned words are cut around: each pin's run is its own block,
 * whatever its speakers, pauses or length.
 * `pinned[i]` is the pin covering word i, if any.
 */
export function buildBlocks(
  words: readonly TranscriptWord[],
  pinned: readonly (PinAssignment | undefined)[] = [],
  options: BlockOptions = {},
): Block[] {
  const pauseMs = options.pauseMs ?? BLOCK_PAUSE_MS;
  const maxMs = options.maxMs ?? BLOCK_MAX_MS;
  const blocks: Block[] = [];
  let start = 0;

  const close = (end: number): void => {
    const first = words[start]!;
    const last = words[end]!;
    const pin = pinned[start];
    const block: Block = {
      first: start,
      last: end,
      startMs: first.startMs,
      endMs: last.endMs,
      speaker: first.speaker,
      text: words
        .slice(start, end + 1)
        .map((w) => w.text)
        .join(' '),
    };
    if (pin) block.pin = { pinId: pin.pinId, itemId: pin.itemId };
    blocks.push(block);
  };

  for (let i = 1; i <= words.length; i += 1) {
    if (i === words.length) {
      if (words.length > 0) close(i - 1);
      break;
    }
    const prev = words[i - 1]!;
    const word = words[i]!;
    const prevPin = pinned[i - 1];
    const pin = pinned[i];
    let cut: boolean;
    if (prevPin || pin) cut = prevPin?.pinId !== pin?.pinId;
    else
      cut =
        word.speaker !== prev.speaker ||
        word.startMs - prev.endMs >= pauseMs ||
        word.endMs - words[start]!.startMs > maxMs;
    if (cut) {
      close(i - 1);
      start = i;
    }
  }
  return blocks;
}
