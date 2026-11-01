// A real full disk under a recording: passes if each track reports one writeError, recording keeps
// running, and only whole chunks are logged. Play a sound, under run-muted.sh. No admin needed.
// Usage: node --experimental-transform-types disk_case.mjs <helper> <work dir>
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProcessAdapter } from '../../../packages/capture/src/process-adapter.ts';
import { RecordingSession } from '../../../packages/app-core/src/recording.ts';

const [helper, work] = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
mkdirSync(work, { recursive: true });
const image = join(work, 'small.dmg');
const volume = join(work, 'volume');
execFileSync('hdiutil', ['create', '-size', '2m', '-fs', 'HFS+', '-volname', 'scrbfull', image]);
execFileSync('hdiutil', ['attach', image, '-mountpoint', volume, '-nobrowse']);
const free = () =>
  Number(execFileSync('df', ['-k', volume]).toString().split('\n')[1].trim().split(/\s+/)[3]);
// Room for several seconds of chunks, then none.
writeFileSync(join(volume, 'filler'), Buffer.alloc(Math.max(0, free() - 60) * 1024));
console.log('free KB', free());

const errors = [];
let id = 0;
const recording = new RecordingSession({
  launch: () => {
    const adapter = new ProcessAdapter(helper);
    adapter.onEvent((event) => {
      if (event.type === 'writeError') errors.push(event);
    });
    return adapter;
  },
  onStateChanged: () => undefined,
  onTrackMissing: (track) => console.log('missing', track),
  onEnded: (end) => console.log('ended', end),
  newCommandId: () => `c${(id += 1)}`,
});
await recording.start({
  name: 'open',
  sessionId: 'disk',
  outputDir: volume,
  source: 'wholeComputer',
  mic: 'default',
});
await sleep(60_000);
console.log('state after 60 s', recording.state.status, 'free KB', free());
await recording.stop();
console.log('writeErrors', JSON.stringify(errors));
for (const track of ['microphone', 'meeting']) {
  let logged = [];
  try {
    logged = readFileSync(join(volume, 'audio', track, 'chunks.log'), 'utf8')
      .trim()
      .split('\n');
  } catch {
    // A log that never reached the disk is a result too.
  }
  const files = execFileSync('ls', [join(volume, 'audio', track)])
    .toString()
    .trim()
    .split('\n');
  console.log(track, 'logged', logged.filter(Boolean).length, 'files', files.join(' '));
}
execFileSync('hdiutil', ['detach', volume, '-force']);
process.exit(0);
