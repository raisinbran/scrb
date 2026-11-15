import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { totalmem } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { httpBackend, isLocalUrl, type Backend } from './backend.js';
import { codeOf, logCode, RunError } from './errors.js';
import { SCORER, type Embed } from './match.js';
import { mockBackend } from './mock.js';
import { assertOffline } from './netcheck.js';
import {
  cleanTemp,
  manifest,
  runMeeting,
  writeResults,
  type Meeting,
  type MeetingResult,
} from './run.js';
import { trigramEmbedder, tuneTau, validateAll } from './validate.js';

/**
 * Dev-only entry point (no runtime dependency in the app).
 *   validate                       scorer validation on the invented suites (no model, no private data)
 *   run --meeting F [--meeting F]  --out DIR --backend URL|mock|mock-fail --model NAME --tau N
 * stdout and stderr carry fixed codes and numbers only.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function arg(name: string, all = false): string[] {
  const out: string[] = [];
  const a = process.argv;
  for (let i = 0; i < a.length - 1; i += 1) if (a[i] === `--${name}`) out.push(a[i + 1]!);
  return all ? out : out.slice(0, 1);
}

/** Output must live outside the repo (plan section 8). */
export function assertOutsideRepo(out: string, root: string = REPO_ROOT): void {
  mkdirSync(out, { recursive: true });
  const rel = relative(realpathSync(root), realpathSync(out));
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[a-z]:/i.test(rel)))
    throw new RunError('E_OUT_IN_REPO');
}

function loadMeeting(path: string): Meeting {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new RunError('E_MEETING_READ');
  }
  const m = raw as Partial<Meeting>;
  if (!Array.isArray(m.outline) || !Array.isArray(m.lines) || !Array.isArray(m.reference))
    throw new RunError('E_MEETING_SHAPE');
  return m as Meeting;
}

async function embedderFor(id: string): Promise<Embed> {
  if (id === 'trigram') return trigramEmbedder();
  if (id === 'minilm') {
    const { loadEmbedder } = await import('../embedder.js');
    return loadEmbedder();
  }
  throw new RunError('E_EMBEDDER');
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === 'validate') {
    const embed = trigramEmbedder();
    const tau = await tuneTau(embed);
    const r = await validateAll(embed, tau);
    logCode(
      r.ok ? 'VALIDATE_OK' : 'VALIDATE_FAIL',
      Math.round(tau * 100),
      r.adversarial.num,
      r.adversarial.den,
      r.tuningAdversarial.num,
      r.tuningAdversarial.den,
    );
    process.exitCode = r.ok ? 0 : 1;
    return;
  }
  if (cmd !== 'run') throw new RunError('E_USAGE');

  const out = arg('out')[0];
  const files = arg('meeting', true);
  const backendArg = arg('backend')[0] ?? '';
  if (!out || files.length === 0 || !backendArg) throw new RunError('E_USAGE');
  assertOutsideRepo(out);

  const isMock = backendArg === 'mock' || backendArg === 'mock-fail';
  let backend: Backend;
  if (isMock) backend = mockBackend(backendArg === 'mock-fail' ? 'fail' : 'echo');
  else {
    if (!isLocalUrl(backendArg)) throw new RunError('E_BACKEND_NOT_LOCAL');
    backend = httpBackend(backendArg, arg('model')[0] ?? 'model');
    await assertOffline();
  }
  const embedderId = arg('embedder')[0] ?? (isMock ? 'trigram' : 'minilm');
  const embed = await embedderFor(embedderId);
  const tau = Number(arg('tau')[0] ?? SCORER.tau);
  if (!(tau > 0 && tau < 1)) throw new RunError('E_USAGE');

  const meetings = files.map(loadMeeting);
  const results: MeetingResult[] = [];
  for (const [i, m] of meetings.entries()) {
    const r = await runMeeting(i, m, backend, embed, { outDir: out, tau });
    results.push(r);
    logCode('MEETING_DONE', i, r.a ? 1 : 0, r.b ? 1 : 0);
    if (r.codeA) logCode(`TASK_A_${r.codeA}`, i);
    if (r.codeB) logCode(`TASK_B_${r.codeB}`, i);
  }
  writeResults(out, manifest(backend, embedderId, tau, meetings.length, totalmem()), results);
  cleanTemp(out);
  logCode('RUN_DONE', meetings.length);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    logCode(`FAILED_${codeOf(e)}`);
    process.exitCode = 1;
  });
}
