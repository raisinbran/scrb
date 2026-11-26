import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateFacts,
  parseLines,
  ratio,
  scoreAgenda,
  verify,
  type AgendaMeeting,
  type AgendaScore,
  type GenFact,
} from './agenda.js';
import { loadAmiAgenda } from './agenda-ami.js';
import { synthMeeting } from './agenda-synth.js';
import { httpBackend, type Backend } from './backend.js';
import { norm } from './taskA.js';
import { agendaPromptHash, promptA, promptHash, SYSTEM } from './prompts.js';
import { parseJson, prepare } from './run.js';
import { reconcile, type ReconcileStats } from './reconcile.js';
import { trigramEmbedder, tuneTau, validateAll } from './validate.js';
import { parseOutline } from '../../src/parse.js';

/**
 * Dev-only comparison on invented meetings: the existing Task A prompt against the agenda-aware
 * extraction, same transcripts, same scorer. Usage (from packages/outline):
 *   npx tsx eval/model-test/agenda-compare.ts --url http://127.0.0.1:8089 --seeds 1,2,3 --out <dir outside repo>
 * Prints numbers only. Never run it on real recordings, agendas or notes.
 */

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Task A text points, mapped onto agenda ids by title and filed as kind "info" (Task A has no kinds). */
async function taskAFacts(
  m: AgendaMeeting,
  backend: Backend,
): Promise<{ facts: GenFact[]; failed: number; chunks: number; reconciled: ReconcileStats }> {
  const items = parseOutline(m.agenda).items;
  const byTitle = new Map(items.map((i) => [norm(i.text), i.id]));
  const p = prepare(m);
  let facts: GenFact[] = [];
  const reconciled: ReconcileStats = { duplicates: 0, reversals: 0 };
  let failed = 0;
  for (const c of p.chunks) {
    const transcript = m.lines
      .slice(c.from, c.to + 1)
      .map((l, k) => `[L${c.from + k + 1}] ${l.speaker}: ${l.text}`)
      .join('\n');
    try {
      const out = parseJson(
        await backend.complete({ system: SYSTEM, user: promptA(m.outline, transcript) }),
      ) as { topics?: { title?: unknown; points?: { text?: unknown; cite?: unknown }[] }[] };
      if (!Array.isArray(out.topics)) throw new Error('shape');
      const incoming: GenFact[] = [];
      for (const t of out.topics) {
        const title = typeof t.title === 'string' ? t.title : '';
        const id = byTitle.get(norm(title));
        for (const pt of t.points ?? []) {
          if (typeof pt.text !== 'string' || !pt.text) continue;
          let cite = parseLines(pt.cite, m.lines.length);
          if (cite && (cite.from < c.from + 1 || cite.to > c.to + 1)) cite = null;
          incoming.push({
            topic: id ?? 'new',
            ...(id ? {} : { newTopic: title || 'Untitled' }),
            kind: 'info',
            text: pt.text,
            cite,
          });
        }
      }
      facts = reconcile(facts, incoming, reconciled);
    } catch {
      failed += 1;
    }
  }
  return { facts, failed, chunks: p.chunks.length, reconciled };
}

function sample(): { serverMiB: number | null; gpuMiB: number | null } {
  let serverMiB: number | null = null;
  let gpuMiB: number | null = null;
  try {
    const t = execFileSync(
      'tasklist',
      ['/FI', 'IMAGENAME eq llama-server.exe', '/FO', 'CSV', '/NH'],
      {
        encoding: 'utf8',
      },
    );
    const kb = /"([\d,]+) K"\s*$/m.exec(t.trim());
    if (kb) serverMiB = Math.round(Number(kb[1]!.replace(/,/g, '')) / 1024);
  } catch {
    /* unavailable */
  }
  try {
    const t = execFileSync(
      'nvidia-smi',
      ['--query-gpu=memory.used', '--format=csv,noheader,nounits'],
      { encoding: 'utf8' },
    );
    gpuMiB = Number(t.trim().split(/\s+/)[0]);
  } catch {
    /* unavailable */
  }
  return { serverMiB, gpuMiB };
}

const pct = (r: { num: number; den: number }): string => (r.den > 0 ? `${r.num}/${r.den}` : 'n/a');

function line(name: string, s: AgendaScore, extra: object): object {
  return {
    name,
    decisionRecall: pct(s.decisionRecall),
    dateRecall: pct(s.dateRecall),
    hallucination: pct(s.hallucination),
    hallucinationRate: ratio(s.hallucination),
    validCitations: pct(s.validCitations),
    editDistance: s.editDistance,
    wordEdit: s.wordEdit,
    review: s.review,
    ...extra,
  };
}

async function main(): Promise<void> {
  const url = arg('url') ?? 'http://127.0.0.1:8089';
  const seeds = (arg('seeds') ?? '1,2,3').split(',').map(Number);
  const out = arg('out');
  const inner = httpBackend(url, 'qwen2.5-7b-instruct-q4_k_m');
  const raws: { agenda: boolean; text: string; total: number }[] = [];
  let totalLines = 0;
  const backend: Backend = {
    id: inner.id,
    async complete(req) {
      const text = await inner.complete(req);
      raws.push({ agenda: req.user.startsWith('Agenda topics'), text, total: totalLines });
      return text;
    },
  };
  const embedderId = arg('embedder') ?? 'trigram';
  const embed =
    embedderId === 'minilm'
      ? await (await import('../embedder.js')).loadEmbedder()
      : trigramEmbedder();
  let tau = Number(arg('tau') ?? 0.6);
  let validation: unknown = null;
  if (arg('validate')) {
    tau = await tuneTau(embed);
    const v = await validateAll(embed, tau);
    validation = { tau, ...v };
  }
  const opt = { tau };
  const amiDir = arg('ami');
  const amiIds = (arg('ami-ids') ?? '').split(',').filter(Boolean);
  const peak = { serverMiB: 0, gpuMiB: 0 };
  const timer = setInterval(() => {
    const s = sample();
    peak.serverMiB = Math.max(peak.serverMiB, s.serverMiB ?? 0);
    peak.gpuMiB = Math.max(peak.gpuMiB, s.gpuMiB ?? 0);
  }, 5000);
  const rows: object[] = [];
  const t0 = Date.now();
  const todo: { label: string; m: AgendaMeeting }[] = [
    ...(arg('seeds') === 'none' ? [] : seeds).map((seed) => ({
      label: `synth-${seed}`,
      m: synthMeeting(seed),
    })),
    ...amiIds.map((id) => ({ label: `ami-${id}`, m: loadAmiAgenda(amiDir!, id)! })),
  ];
  for (const { label: seed, m } of todo) {
    totalLines = m.lines.length;
    const items = parseOutline(m.agenda).items;
    const words = m.lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
    let t = Date.now();
    const a = await taskAFacts(m, backend);
    const secA = (Date.now() - t) / 1000;
    t = Date.now();
    const g = await generateFacts(m, backend);
    const secG = (Date.now() - t) / 1000;
    const aVerdicts = a.facts.map((f) => verify(f, items, m.lines));
    const meta = { seed, lines: m.lines.length, words, refFacts: m.facts.length };
    const aStrict = await scoreAgenda(m, a.facts, aVerdicts, embed, opt);
    const aLoose = await scoreAgenda(m, a.facts, aVerdicts, embed, { ...opt, kindStrict: false });
    const gStrict = await scoreAgenda(m, g.facts, g.verdicts, embed, opt);
    const gLoose = await scoreAgenda(m, g.facts, g.verdicts, embed, { ...opt, kindStrict: false });
    const kinds: Record<string, number> = {};
    for (const f of g.facts) kinds[f.kind] = (kinds[f.kind] ?? 0) + 1;
    const verdictCounts: Record<string, number> = {};
    for (const v of g.verdicts) verdictCounts[v] = (verdictCounts[v] ?? 0) + 1;
    rows.push(
      line('taskA-prompt (kind-agnostic credit)', aLoose, {
        ...meta,
        facts: a.facts.length,
        failedChunks: a.failed,
        chunks: a.chunks,
        reconciled: a.reconciled,
        wallSeconds: secA,
      }),
      line('taskA-prompt (strict kinds)', aStrict, { ...meta }),
      line('agenda-aware (kind-agnostic credit)', gLoose, {
        ...meta,
        kinds,
        verdictCounts,
        causes: g.causes,
      }),
      line('agenda-aware (strict kinds)', gStrict, {
        ...meta,
        facts: g.facts.length,
        failedChunks: g.failedChunks,
        chunks: g.chunks,
        reconciled: g.reconciled,
        wallSeconds: secG,
      }),
    );
  }
  clearInterval(timer);
  const citeStats: Record<string, Record<string, { count: number; parsed: number }>> = {
    agenda: {},
    taskA: {},
  };
  const rejected: string[] = [];
  for (const r of raws) {
    let facts: { cite?: unknown }[] = [];
    try {
      const j = parseJson(r.text) as {
        facts?: { cite?: unknown }[];
        topics?: { points?: { cite?: unknown }[] }[];
      };
      facts = j.facts ?? (j.topics ?? []).flatMap((t) => t.points ?? []);
    } catch {
      continue;
    }
    for (const f of facts) {
      const c = f.cite;
      const shape =
        typeof c === 'string'
          ? `"${c.replace(/\d+/g, 'N')}"`
          : c === undefined
            ? 'missing'
            : Array.isArray(c)
              ? 'array'
              : typeof c;
      const bucket = (citeStats[r.agenda ? 'agenda' : 'taskA'] ??= {});
      const e = (bucket[shape] ??= { count: 0, parsed: 0 });
      e.count += 1;
      if (parseLines(c, r.total)) e.parsed += 1;
      else if (rejected.length < 40)
        rejected.push(`${r.agenda ? 'agenda' : 'taskA'} ${JSON.stringify(c)} of ${r.total}`);
    }
  }
  const result = {
    promptHash: promptHash(),
    agendaPromptHash: agendaPromptHash(),
    embedder: embedderId,
    tau,
    validation,
    totalWallSeconds: (Date.now() - t0) / 1000,
    peakServerWorkingSetMiB: peak.serverMiB || null,
    peakGpuUsedMiB: peak.gpuMiB || null,
    citeStats,
    rejected,
    rows,
  };
  console.log(JSON.stringify(result, null, 2));
  if (out) {
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(out, JSON.stringify(result, null, 2));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e: unknown) => {
    console.log('FAILED', e instanceof Error ? e.message : 'unknown');
    process.exitCode = 1;
  });
}
