import { collectTexts, loadEmbedder, readCache, writeCache } from './embedder.js';

/** Usage: tsx eval/embed-cache.ts [amiAnnotationDir]. Embeds every block and item text once. */
const dir = process.argv[2] ?? `${process.env.HOME}/scrb-dev-assets/downloads/ami/ann`;
const cache = readCache();
const texts = [...collectTexts(dir)].filter((t) => !cache.has(t));
console.log(`${cache.size} cached, ${texts.length} to embed`);
const embed = await loadEmbedder();
const BATCH = 32;
const started = Date.now();
for (let i = 0; i < texts.length; i += BATCH) {
  const batch = texts.slice(i, i + BATCH);
  const vecs = await embed(batch);
  batch.forEach((t, j) => cache.set(t, vecs[j]!));
  if ((i / BATCH) % 50 === 0) {
    const sec = (Date.now() - started) / 1000;
    console.log(`${i + batch.length}/${texts.length} ${sec.toFixed(0)}s`);
    writeCache(cache);
  }
}
writeCache(cache);
console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s`);
