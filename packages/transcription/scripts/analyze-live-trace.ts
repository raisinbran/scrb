import { readFile } from 'node:fs/promises';
import { analyzeLiveTrace } from '../src/liveTraceAnalysis.js';
import { TRACE_STAGES, type TraceRecord } from '../src/liveTrace.js';

const records: TraceRecord[] = [];
let malformed = false;
for (const file of process.argv.slice(2)) {
  try {
    for (const line of (await readFile(file, 'utf8')).split(/\r?\n/).filter(Boolean)) {
      try {
        const r = JSON.parse(line) as TraceRecord;
        if (
          r.version !== 1 ||
          !TRACE_STAGES.includes(r.stage) ||
          typeof r.session !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(r.session) ||
          typeof r.stream !== 'string' ||
          !/^[0-9a-f]{8}-[0-9a-f-]{27}$/.test(r.stream) ||
          !['worker', 'supervisor'].includes(r.role) ||
          (r.track !== undefined && r.track !== 'mic' && r.track !== 'meeting') ||
          (r.spanId !== undefined && !/^(mic|meeting):\d+:\d+:\d+$/.test(r.spanId)) ||
          ['workerRun', 'evaluation', 'call', 'wordCount', 'spanCount', 'queueDelayMs'].some(
            (k) => {
              const v = (r as unknown as Record<string, unknown>)[k];
              return v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0);
            },
          ) ||
          !Number.isFinite(r.serial) ||
          !Number.isFinite(r.monoMs)
        )
          throw new Error('Invalid record');
        records.push(r);
      } catch {
        malformed = true;
      }
    }
  } catch {
    malformed = true;
  }
}
// Only the analyzer's allowlisted summary is printed; never raw input records or paths.
console.log(JSON.stringify(analyzeLiveTrace(records, malformed), null, 2));
