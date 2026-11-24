// B0 Teams-call kit generator (macOS only: needs `say` and `afconvert`; plays nothing).
// Usage: node scripts/b0-teams-kit.mjs <new output folder> [--lead 10]
// Writes remote.wav, teams-b0-remote.m4a, teams-b0-cue.html (audio embedded, one file to copy) and expected.json.
// The 30-turn script is the frozen B0 script (docs/gates/m1-mac-b0-run-sheet-20261124.md section 2). Never edit it.
import { Buffer } from 'node:buffer';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RATE, findBeeps } from './b0-track-sync.mjs';

// [role, text] in slot order 1..30.
export const SCRIPT = [
  ['Y', 'A copper lantern marks the quiet doorway.'],
  ['A', 'The blue bicycle stopped beside the bakery.'],
  ['B', 'Seven smooth pebbles lie along the river.'],
  ['B', 'The garden clock chimed shortly after noon.'],
  ['Y', 'Morning sunlight crossed the wooden table.'],
  ['A', 'A small violet kite floated above the park.'],
  ['A', 'The old bridge spans a narrow mountain creek.'],
  ['B', 'Three paper folders rested under the monitor.'],
  ['Y', 'Fresh orange slices filled the ceramic bowl.'],
  ['Y', 'A green umbrella leaned against the fence.'],
  ['B', 'Two bright candles stood near the window.'],
  ['A', 'The distant ferry crossed the silver harbor.'],
  ['B', 'The white teapot cooled beside the stove.'],
  ['A', 'A red suitcase rolled across the station.'],
  ['Y', 'The quiet hallway smelled of fresh paint.'],
  ['A', 'The tall lighthouse faced the eastern shore.'],
  ['Y', 'A black notebook contained twelve simple sketches.'],
  ['B', 'Five yellow leaves settled on the steps.'],
  ['Y', 'The marble counter reflected the afternoon sky.'],
  ['A', 'A narrow footpath circled the vegetable garden.'],
  ['B', 'The museum doors closed before the rain.'],
  ['B', 'The bakery window displayed round honey cakes.'],
  ['Y', 'The brown parcel waited behind the front desk.'],
  ['A', 'A striped scarf hung beside the winter coats.'],
  ['A', 'The empty bus paused under the streetlight.'],
  ['B', 'A silver camera sat inside the backpack.'],
  ['Y', 'A little brass bell rang at the entrance.'],
  ['B', 'Four clean glasses stood upon the shelf.'],
  ['A', 'The wooden canoe rested along the beach.'],
  ['Y', 'A paper map covered the kitchen island.'],
];

export const SLOT_S = 9;
export const MAX_REMOTE_S = 7.5;
export const BEEP_S = 0.25;
export const BEEP_AMPLITUDE = 0.4;
const VOICE = { A: 'Samantha', B: 'Daniel' };

/** Turn list with ids (Y01..Y10 etc. by round) and times in file seconds. `lead` is silent pre-roll. */
export function buildSchedule(lead = 10) {
  const count = { Y: 0, A: 0, B: 0 };
  const turns = SCRIPT.map(([role, text], i) => {
    count[role] += 1;
    const slotS = lead + 3.5 + SLOT_S * i; // frozen T(k) = 3.5 + 9 (k - 1), shifted by the lead
    return { k: i + 1, role, id: `${role}${String(count[role]).padStart(2, '0')}`, text, slotS };
  });
  const startBeepS = lead + 1.8;
  const endBeepS = lead + 274.0;
  return { lead, turns, startBeepS, endBeepS, totalS: endBeepS + BEEP_S + 3 };
}

/** Pure function, shipped verbatim inside the cue page. What the owner should see at file time t. */
export function phaseAt(schedule, t) {
  const ys = schedule.turns.filter((x) => x.role === 'Y');
  const sb = schedule.startBeepS;
  const eb = schedule.endBeepS;
  const out = (phase, extra) => ({ phase, ...extra });
  const nextIdx = ys.findIndex((y) => t < y.slotS + 7.5);
  const next = nextIdx >= 0 ? ys[nextIdx] : null;
  const after = nextIdx >= 0 ? (ys[nextIdx + 1] ?? null) : null;
  const info = (y) => (y ? { id: y.id, line: y.text, n: ys.indexOf(y) + 1 } : null);
  if (t < 0) return out('idle', {});
  if (t >= eb + 3) return out('done', {});
  if ((t >= sb - 0.5 && t < sb + 1.1) || (t >= eb - 0.5 && t < eb + 1.1) || t < sb - 0.5) {
    return out('quiet', { next: info(next), untilS: next ? Math.max(0, next.slotS - t) : null });
  }
  if (t >= eb + 1.1) return out('quiet', { next: null, untilS: null, finishing: true });
  if (!next) return out('quiet', { next: null, untilS: null });
  if (next && t >= next.slotS) {
    return out('now', {
      current: info(next),
      remainingS: next.slotS + 7.5 - t,
      after: info(after),
    });
  }
  if (next && t >= next.slotS - 3) {
    return out('ready', { next: info(next), untilS: next.slotS - t, after: info(after) });
  }
  return out('wait', { next: info(next), untilS: next ? next.slotS - t : null });
}

function wavDataOf(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('not a WAVE file');
  let at = 12;
  let rate = 0;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    if (id === 'fmt ') {
      if (
        ![1, 0xfffe].includes(buf.readUInt16LE(at + 8)) ||
        buf.readUInt16LE(at + 10) !== 1 ||
        buf.readUInt16LE(at + 22) !== 16
      )
        throw new Error('expected 16-bit mono PCM');
      rate = buf.readUInt32LE(at + 12);
    }
    if (id === 'data') {
      const n = Math.min(size, buf.length - at - 8) >> 1;
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(at + 8 + 2 * i) / 32768;
      return { samples: out, rate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error('no data chunk');
}
export const readWav16 = (file) => wavDataOf(readFileSync(file));

export function wav16Buffer(samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(RATE, 24);
  buf.writeUInt32LE(RATE * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++)
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + 2 * i);
  return buf;
}

/** Compose the call audio: silence, start beep, A and B turns at their slots (Y slots silent), end beep. */
export function composeRemote(schedule, turnSamples) {
  const out = new Float32Array(Math.ceil(schedule.totalS * RATE));
  const beep = (at) => {
    const from = Math.round(at * RATE);
    for (let i = 0; i < BEEP_S * RATE; i++)
      out[from + i] = BEEP_AMPLITUDE * Math.sin((2 * Math.PI * 1000 * i) / RATE);
  };
  beep(schedule.startBeepS);
  beep(schedule.endBeepS);
  const ends = {};
  for (const turn of schedule.turns) {
    if (turn.role === 'Y') continue;
    const s = turnSamples.get(turn.k);
    if (!s) throw new Error(`missing audio for slot ${turn.k}`);
    const seconds = s.length / RATE;
    if (seconds > MAX_REMOTE_S)
      throw new Error(
        `slot ${turn.k} (${turn.id}) lasts ${seconds.toFixed(2)} s, over ${MAX_REMOTE_S} s; the script may not be edited`,
      );
    let peak = 0;
    for (const v of s) peak = Math.max(peak, Math.abs(v));
    const gain = peak > 0 ? 0.5 / peak : 1;
    const from = Math.round(turn.slotS * RATE);
    for (let i = 0; i < s.length; i++) out[from + i] = s[i] * gain;
    ends[turn.k] = turn.slotS + seconds;
  }
  return { samples: out, ends };
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Scribe Teams B0 cue</title><style>
html,body{margin:0;height:100%;font-family:system-ui,sans-serif;color:#fff;background:#222}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2vw;box-sizing:border-box}
#big{font-weight:800;font-size:11vw;line-height:1.05}#line{font-weight:700;font-size:7vw;line-height:1.15;margin:2vw 0}
#count{font-size:9vw;font-weight:800}#small{font-size:3.6vw;opacity:.9;margin-top:2vw}
body.idle{background:#222}body.wait{background:#1d3557}body.ready{background:#b45f06}body.now{background:#0a7a2f}body.quiet{background:#8b1a1a}body.done{background:#222}
button{font-size:6vw;padding:3vw 6vw;border-radius:2vw;border:0;margin:2vw;font-weight:700}
#err{color:#ffd;font-size:4vw}
</style></head><body class="idle">
<div id="big">Teams B0 cue</div><div id="line"></div><div id="count"></div><div id="small"></div><div id="err"></div>
<div id="btns"><button id="go">START (plays audio and cues)</button><br><button id="cue" style="font-size:3vw">Cue only (audio plays elsewhere)</button></div>
<audio id="au" preload="auto" src="__AUDIO__"></audio>
<script>
const S=__SCHEDULE__;
const phaseAt=__PHASEAT__;
const $=(i)=>document.getElementById(i);let t0=null,useAudio=true;
const f=(x)=>Math.max(0,x).toFixed(1);
function render(t){const p=phaseAt(S,t);document.body.className=p.phase;
 let big='',line='',count='',small='';
 if(p.phase==='quiet'){big='STAY SILENT';small=p.finishing?'End beep playing. Then press Stop in Scribe.':'Sync beep. Do not speak.';
  if(p.next){line='Next: '+p.next.line;count='in '+f(p.untilS)+' s';}}
 else if(p.phase==='ready'){big='GET READY';line=p.next.line;count='in '+f(p.untilS)+' s';small='Line '+p.next.n+' of 10';}
 else if(p.phase==='now'){big='YOUR TURN';line=p.current.line;count=f(p.remainingS)+' s left';small='Line '+p.current.n+' of 10'+(p.after?'. Next: '+p.after.line:'. Last line.');}
 else if(p.phase==='wait'&&p.next){big='Wait';line='Next: '+p.next.line;count='in '+f(p.untilS)+' s';small='Line '+p.next.n+' of 10';}
 else if(p.phase==='done'){big='DONE';small='Press Stop in Scribe now, then Stop the Teams call.';}
 $('big').textContent=big;$('line').textContent=line;$('count').textContent=count;$('small').textContent=small;}
function tick(){const au=$('au');let t;
 if(useAudio)t=au.currentTime;
 else t=(performance.now()-t0)/1000;
 render(t);if(t<S.endBeepS+4&&!(useAudio&&au.ended))requestAnimationFrame(tick);}
async function start(audio){useAudio=audio;$('btns').style.display='none';
 try{if(navigator.wakeLock)await navigator.wakeLock.request('screen');}catch(e){}
 if(audio){try{await $('au').play();}catch(e){$('err').textContent='AUDIO DID NOT START: '+e+' Reload and tap START again.';document.body.className='quiet';$('btns').style.display='';return;}}
 else t0=performance.now();
 requestAnimationFrame(tick);}
$('go').onclick=()=>start(true);$('cue').onclick=()=>start(false);
</script></body></html>`;

export function cuePage(schedule, audioDataUri) {
  const sched = JSON.stringify({
    turns: schedule.turns.filter((t) => t.role === 'Y'),
    startBeepS: schedule.startBeepS,
    endBeepS: schedule.endBeepS,
    totalS: schedule.totalS,
  }).replaceAll('<', '\\u003c');
  // Replacer functions: `$` in the script text must not be read as a replacement pattern.
  return PAGE.replace('__AUDIO__', () => audioDataUri)
    .replace('__SCHEDULE__', () => sched)
    .replace('__PHASEAT__', () => phaseAt.toString());
}

function render(outDir, lead) {
  if (existsSync(outDir)) throw new Error(`${outDir} already exists; choose a new folder`);
  mkdirSync(outDir, { recursive: true });
  const work = mkdtempSync(join(tmpdir(), 'b0-teams-kit-'));
  const schedule = buildSchedule(lead);
  try {
    const turnSamples = new Map();
    for (const turn of schedule.turns) {
      if (turn.role === 'Y') continue;
      const file = join(work, `${turn.id}.wav`);
      execFileSync('say', [
        '-v',
        VOICE[turn.role],
        '--file-format=WAVE',
        '--data-format=LEI16@16000',
        '-o',
        file,
        turn.text,
      ]);
      const { samples, rate } = readWav16(file);
      if (rate !== RATE) throw new Error(`${turn.id}: sample rate ${rate}, expected ${RATE}`);
      turnSamples.set(turn.k, samples);
    }
    const { samples, ends } = composeRemote(schedule, turnSamples);
    const found = findBeeps(samples);
    if (
      found.length !== 2 ||
      Math.abs(found[0] - schedule.startBeepS) > 0.05 ||
      Math.abs(found[1] - schedule.endBeepS) > 0.05
    )
      throw new Error(`self-check: beep detector found ${JSON.stringify(found)}`);
    const wav = join(outDir, 'remote.wav');
    writeFileSync(wav, wav16Buffer(samples));
    const m4a = join(outDir, 'teams-b0-remote.m4a');
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '48000', wav, m4a]);
    const uri = `data:audio/mp4;base64,${readFileSync(m4a).toString('base64')}`;
    writeFileSync(join(outDir, 'teams-b0-cue.html'), cuePage(schedule, uri));
    const expected = {
      note: 'File times in seconds from the moment Start is tapped (audio file time zero).',
      lead,
      startBeepS: schedule.startBeepS,
      endBeepS: schedule.endBeepS,
      turns: schedule.turns.map((t) => ({ ...t, endS: ends[t.k] ?? null })),
    };
    writeFileSync(join(outDir, 'expected.json'), JSON.stringify(expected, null, 2));
    console.log(
      `start beep ${schedule.startBeepS.toFixed(1)} s, end beep ${schedule.endBeepS.toFixed(1)} s, total ${schedule.totalS.toFixed(1)} s`,
    );
    for (const t of schedule.turns.filter((x) => x.role === 'Y'))
      console.log(`${t.id}  slot ${t.slotS.toFixed(1)} s  ${t.text}`);
    console.log(`Copy to the phone or PC2: ${join(outDir, 'teams-b0-cue.html')}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const lead = args.includes('--lead') ? Number(args[args.indexOf('--lead') + 1]) : 10;
  const outDir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--lead');
  if (!outDir || !Number.isFinite(lead) || lead < 5) {
    console.error('usage: node b0-teams-kit.mjs <new output folder> [--lead 10]');
    process.exit(2);
  }
  try {
    render(outDir, lead);
  } catch (e) {
    console.error(`STOP: ${e.message}`);
    process.exit(1);
  }
}
