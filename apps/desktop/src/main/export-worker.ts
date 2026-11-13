import { Worker } from 'node:worker_threads';
import type { DocxJob } from './exportWorkerEntry.ts';

export type DocxRenderer = (job: DocxJob) => Promise<Uint8Array>;

/** Renders one DOCX in a fresh worker thread. The timeout terminates a stuck worker. */
export function createDocxRenderer(entry: string, timeoutMs = 60_000): DocxRenderer {
  return (job) =>
    new Promise<Uint8Array>((resolve, reject) => {
      const worker = new Worker(entry);
      const done = (settle: () => void) => {
        clearTimeout(timer);
        void worker.terminate();
        settle();
      };
      const timer = setTimeout(
        () => done(() => reject(new Error('DOCX worker timed out'))),
        timeoutMs,
      );
      worker.once('message', (reply: { ok: boolean; bytes?: Uint8Array; message?: string }) =>
        done(() =>
          reply.ok && reply.bytes
            ? resolve(reply.bytes)
            : reject(new Error(`DOCX worker failed: ${reply.message ?? 'unknown'}`)),
        ),
      );
      worker.once('error', (error) => done(() => reject(error)));
      worker.once('exit', (code) =>
        done(() => reject(new Error(`DOCX worker exited with code ${code}`))),
      );
      worker.postMessage(job);
    });
}
