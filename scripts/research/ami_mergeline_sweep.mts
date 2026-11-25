// Applies the shipped relabel rules at several `mergeLine` values to dumps made by
// ami_speaker_dump.mts and writes hypotheses for ami_speaker_score.py.
// Usage: tsx ami_mergeline_sweep.mts <dumpDir> <hypDir>
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decideSpeakers } from '../../packages/transcription/src/finalPass.js';
import { RELABEL_DEFAULTS } from '../../packages/transcription/src/speakers.js';

const [dumpDir, hypDir] = process.argv.slice(2) as [string, string];
const lines = [0.6, 0.65, 0.7, 0.75];
for (const f of readdirSync(dumpDir).filter((n) => n.endsWith('.json'))) {
  const meeting = f.replace('.json', '');
  const { raw, embedded } = JSON.parse(readFileSync(join(dumpDir, f), 'utf8'));
  for (const mergeLine of lines) {
    const name = `merge${mergeLine}`;
    const { spans } = decideSpeakers(raw, embedded, {
      minSpeakerMs: RELABEL_DEFAULTS.minSpeakerMs,
      shortSpeakerMs: RELABEL_DEFAULTS.shortSpeakerMs,
      shortMergeLine: RELABEL_DEFAULTS.shortMergeLine,
      mergeLine,
    });
    mkdirSync(join(hypDir, name), { recursive: true });
    writeFileSync(
      join(hypDir, name, `${meeting}.txt`),
      spans.map((s) => `${s.startMs / 1000} ${s.endMs / 1000} ${s.speakerId}`).join('\n') + '\n',
    );
  }
}
console.log(lines.map((l) => `merge${l}`).join(' '));
