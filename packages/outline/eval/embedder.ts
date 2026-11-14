import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildBlocks } from '../src/blocks.js';
import { evaluate } from './evaluate.js';

/**
 * Level B experiment support. The model and the vector cache live OUTSIDE git, under
 * ~/Library/Application Support/scrb-experiments. Nothing here ships.
 */
export const MODEL_DIR =
  process.env.SCRB_MINILM_DIR ??
  `${process.env.HOME}/Library/Application Support/scrb-experiments/minilm`;
export const CACHE_FILE =
  process.env.SCRB_VEC_CACHE ??
  `${process.env.HOME}/Library/Application Support/scrb-experiments/minilm-vectors.bin`;
const DIM = 384;

export type Embed = (texts: string[]) => Promise<Float32Array[]>;

/** Loads the quantised ONNX model through transformers.js, from local files only. */
export async function loadEmbedder(): Promise<Embed> {
  const { pipeline, env } = await import('@huggingface/transformers');
  env.allowRemoteModels = false;
  env.localModelPath = dirname(MODEL_DIR) + '/';
  const name = MODEL_DIR.split('/').pop()!;
  const extractor = await pipeline('feature-extraction', name, { dtype: 'q8', device: 'cpu' });
  return async (texts) => {
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = out.data as Float32Array;
    return texts.map((_, i) => data.slice(i * DIM, (i + 1) * DIM));
  };
}

/** Binary cache: repeated [4-byte text length][text utf8][384 float32]. */
export function readCache(): Map<string, Float32Array> {
  const map = new Map<string, Float32Array>();
  if (!existsSync(CACHE_FILE)) return map;
  const buf = readFileSync(CACHE_FILE);
  let o = 0;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o);
    const text = buf.toString('utf8', o + 4, o + 4 + len);
    o += 4 + len;
    const v = new Float32Array(DIM);
    for (let i = 0; i < DIM; i += 1) v[i] = buf.readFloatLE(o + 4 * i);
    o += 4 * DIM;
    map.set(text, v);
  }
  return map;
}

export function writeCache(map: Map<string, Float32Array>): void {
  mkdirSync(dirname(CACHE_FILE), { recursive: true });
  const parts: Buffer[] = [];
  for (const [text, v] of map) {
    const t = Buffer.from(text, 'utf8');
    const head = Buffer.alloc(4);
    head.writeUInt32LE(t.length);
    parts.push(head, t, Buffer.from(v.buffer, v.byteOffset, v.byteLength));
  }
  writeFileSync(CACHE_FILE, Buffer.concat(parts));
}

/** Collects every text the evaluation will ask for, so they can be embedded once. */
export function collectTexts(dir: string): Set<string> {
  const texts = new Set<string>();
  const zero = new Float32Array(DIM);
  evaluate(dir, { semanticWeight: 0.5 }, undefined, (t) => (texts.add(t), zero));
  return texts;
}

export { buildBlocks };
