// Applies decideSpeakers with each relabel setting to dumps made by ami_speaker_dump.mts and
// writes "<start> <end> <speaker>" hypotheses for scripts/research/ami_speaker_score.py.
// Usage: tsx ami_speaker_sweep.mts <dumpDir> <hypDir>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideSpeakers } from '../../packages/transcription/src/finalPass.js';

const [dumpDir, hypDir] = process.argv.slice(2) as [string, string];
const ESTABLISHED_MS = 30_000;
const configs: { name: string; options: Record<string, number> }[] = [
  { name: 'legacy13', options: { minSpeakerMs: 13_000 } },
  { name: 'legacy30', options: { minSpeakerMs: 30_000 } },
];
for (const m of [3, 5, 10, 15, 20]) {
  for (const g of [0.4, 0.5, 0.6, 0.65]) {
    configs.push({
      name: `m${m}_g${g}`,
      options: { minSpeakerMs: ESTABLISHED_MS, shortSpeakerMs: m * 1000, shortMergeLine: g },
    });
  }
}
for (const f of readdirSync(dumpDir).filter((n) => n.endsWith('.json'))) {
  const meeting = f.replace('.json', '');
  const { raw, embedded } = JSON.parse(readFileSync(join(dumpDir, f), 'utf8'));
  for (const c of configs) {
    const { spans } = decideSpeakers(raw, embedded, c.options);
    mkdirSync(join(hypDir, c.name), { recursive: true });
    writeFileSync(
      join(hypDir, c.name, `${meeting}.txt`),
      spans.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${s.speakerId}`).join('\n') + '\n',
    );
  }
}
console.log(configs.map((c) => c.name).join(' '));
