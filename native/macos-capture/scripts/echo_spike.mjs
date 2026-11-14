// Spike driver: node echo_spike.mjs <helper> <outDir> <on|off> [seconds]. Opens the helper with echoCancellation set,
// records, and prints open/health events plus the session.log. Play the test audio yourself (afplay) at a fixed volume.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
const [helper, out, mode, secs = '8'] = process.argv.slice(2);
const child = spawn(helper, [], { stdio: ['pipe', 'pipe', 'inherit'] });
const events = [];
const pending = new Map();
createInterface({ input: child.stdout }).on('line', (l) => {
  const m = JSON.parse(l);
  if (m.type === 'ack') pending.get(m.id)?.(m);
  else events.push(m);
});
let id = 0;
const send = (name, extra = {}) =>
  new Promise((res) => {
    const i = String(++id);
    pending.set(i, res);
    child.stdin.write(JSON.stringify({ id: i, name, ...extra }) + '\n');
  });
const opened = await send('open', { sessionId: 'echo-' + mode, outputDir: out, source: [], mic: 'default', echoCancellation: mode === 'on' });
console.log('open', JSON.stringify(opened));
await send('start');
await delay(Number(secs) * 1000);
console.log('stop', JSON.stringify(await send('stop')));
child.stdin.end();
await delay(500);
console.log('events', JSON.stringify(events.slice(0, 20)));
console.log((await readFile(out + '/audio/session.log', 'utf8')).slice(0, 3000));
