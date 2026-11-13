import { parentPort } from 'node:worker_threads';
import {
  buildExportDocument,
  renderDocx,
  type ExportMeeting,
  type ExportRequest,
  type PageSize,
} from '@scrb/export';

export interface DocxJob {
  meeting: ExportMeeting;
  request: ExportRequest;
  pageSize: PageSize;
}

// Runs in a worker thread so building a long DOCX never blocks the main process.
parentPort?.on('message', (job: DocxJob) => {
  void (async () => {
    try {
      const bytes = await renderDocx(buildExportDocument(job.meeting, job.request), {
        pageSize: job.pageSize,
      });
      const copy = new Uint8Array(bytes);
      parentPort?.postMessage({ ok: true, bytes: copy }, [copy.buffer]);
    } catch (error) {
      parentPort?.postMessage({ ok: false, message: String((error as Error)?.name ?? 'Error') });
    }
  })();
});
