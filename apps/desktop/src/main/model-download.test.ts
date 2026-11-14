// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelDownloadProgress } from '@scrb/contracts';
import {
  DownloadError,
  MODEL_URLS,
  downloadModels,
  type DownloadSource,
  type DownloadOptions,
} from './model-download.ts';
import digests from '../../../../scripts/model-digests.json';

const sha = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const body = Buffer.alloc(100_000, 'scribe-fixture-');

describe('downloadModels', () => {
  let dir: string;
  let server: Server;
  let base: string;
  let handler: Parameters<typeof createServer>[1];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'scrb-dl-'));
    handler = (_req, res) => res.end();
    server = createServer((req, res) => handler!(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  });

  const source = (over: Partial<DownloadSource> = {}): DownloadSource => ({
    file: 'm.bin',
    role: 'liveSpeech',
    label: 'Test model',
    url: `${base}/m.bin`,
    sha256: sha(body),
    bytes: body.length,
    ...over,
  });
  const run = (sources: DownloadSource[], over: Partial<DownloadOptions> = {}) =>
    downloadModels({
      dir,
      sources,
      insecureHosts: ['127.0.0.1'],
      retryDelayMs: 0,
      progressIntervalMs: 0,
      freeBytes: async () => 1e12,
      ...over,
    });
  // Serves `body`, honoring Range like a real file host.
  const serveBody = (cut?: number) => {
    handler = (req, res) => {
      const range = /bytes=(\d+)-/.exec(req.headers.range ?? '');
      const from = range ? Number(range[1]) : 0;
      const slice = body.subarray(from, cut !== undefined && !range ? cut : undefined);
      res.writeHead(range ? 206 : 200, { 'content-length': body.length - from });
      if (cut !== undefined && !range) res.write(slice, () => setTimeout(() => res.destroy(), 20));
      else res.end(slice);
    };
  };
  const fails = async (p: Promise<void>, code: string) => {
    const error = await p.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DownloadError);
    expect((error as DownloadError).code).toBe(code);
  };

  it('downloads, verifies and installs a matching file', async () => {
    serveBody();
    const events: ModelDownloadProgress[] = [];
    await run([source()], { onProgress: (e) => events.push(e) });
    expect(await readFile(join(dir, 'm.bin'))).toEqual(body);
    await expect(stat(join(dir, 'm.bin.part'))).rejects.toThrow();
    expect(events.map((e) => e.state)).toContain('verifying');
    expect(events.at(-1)).toMatchObject({
      state: 'done',
      bytesDone: body.length,
      overallBytesDone: body.length,
      overallBytesTotal: body.length,
    });
  });

  it('rejects a checksum mismatch and leaves no file or part', async () => {
    serveBody();
    const events: ModelDownloadProgress[] = [];
    await fails(
      run([source({ sha256: sha(Buffer.from('other')) })], { onProgress: (e) => events.push(e) }),
      'checksum',
    );
    await expect(stat(join(dir, 'm.bin'))).rejects.toThrow();
    await expect(stat(join(dir, 'm.bin.part'))).rejects.toThrow();
    expect(events.at(-1)).toMatchObject({ state: 'failed', reason: 'checksum' });
  });

  it('rejects an oversize file', async () => {
    serveBody();
    await fails(run([source({ bytes: 10 })], { freeBytes: async () => 1e12 }), 'size');
    await expect(stat(join(dir, 'm.bin'))).rejects.toThrow();
  });

  it('recovers from a truncated body by resuming with a Range request', async () => {
    serveBody(40_000);
    await run([source()]);
    expect(await readFile(join(dir, 'm.bin'))).toEqual(body);
  });

  it('resumes from a leftover .part after a restart', async () => {
    await writeFile(join(dir, 'm.bin.part'), body.subarray(0, 60_000));
    const ranges: (string | undefined)[] = [];
    serveBody();
    const inner = handler;
    handler = (req, res) => {
      ranges.push(req.headers.range);
      inner!(req, res);
    };
    await run([source()]);
    expect(ranges).toEqual(['bytes=60000-']);
    expect(await readFile(join(dir, 'm.bin'))).toEqual(body);
  });

  it('restarts when the server ignores Range and answers 200', async () => {
    await writeFile(join(dir, 'm.bin.part'), body.subarray(0, 60_000));
    handler = (_req, res) => res.end(body);
    await run([source()]);
    expect(await readFile(join(dir, 'm.bin'))).toEqual(body);
  });

  it('fails as offline after the retries when the server is unreachable', async () => {
    await new Promise((r) => server.close(r));
    await fails(run([source()], { retries: 2 }), 'offline');
    await expect(stat(join(dir, 'm.bin'))).rejects.toThrow();
  });

  it('cancels, keeps the part for resume and reports no failure', async () => {
    const controller = new AbortController();
    handler = (_req, res) => {
      res.writeHead(200, { 'content-length': body.length });
      res.write(body.subarray(0, 30_000));
    };
    const events: ModelDownloadProgress[] = [];
    const p = run([source()], {
      signal: controller.signal,
      onProgress: (e) => {
        events.push(e);
        if (e.bytesDone > 0) controller.abort();
      },
    });
    await fails(p, 'cancelled');
    expect(events.some((e) => e.state === 'failed')).toBe(false);
    await expect(stat(join(dir, 'm.bin'))).rejects.toThrow();
  });

  it('refuses without enough free disk space and downloads nothing', async () => {
    let hits = 0;
    handler = (_req, res) => {
      hits++;
      res.end(body);
    };
    await fails(run([source()], { freeBytes: async () => 1000 }), 'diskSpace');
    expect(hits).toBe(0);
  });

  it('skips files that are already installed', async () => {
    let hits = 0;
    handler = (_req, res) => {
      hits++;
      res.end(body);
    };
    await run([source()], { isInstalled: async () => true });
    expect(hits).toBe(0);
  });

  it('refuses plain http to a host that is not a listed test host', async () => {
    await fails(run([source()], { insecureHosts: [] }), 'insecure');
  });

  it('follows a redirect on a trusted host but refuses one to another host', async () => {
    serveBody();
    handler = (req, res) => {
      if (req.url === '/m.bin') {
        res.writeHead(302, { location: '/real.bin' }).end();
        return;
      }
      res.end(body);
    };
    await run([source()]);
    expect(await readFile(join(dir, 'm.bin'))).toEqual(body);

    await rm(join(dir, 'm.bin'));
    handler = (_req, res) => res.writeHead(302, { location: 'https://evil.example/m.bin' }).end();
    await fails(run([source()]), 'insecure');
  });

  it('refuses a redirect from https to http', async () => {
    const fetchFn = (async () =>
      new Response(null, {
        status: 302,
        headers: { location: 'http://huggingface.co/x' },
      })) as unknown as typeof fetch;
    await fails(run([source({ url: 'https://huggingface.co/x' })], { fetchFn }), 'insecure');
  });

  it('does not retry a 404', async () => {
    let hits = 0;
    handler = (_req, res) => {
      hits++;
      res.writeHead(404).end();
    };
    await fails(run([source()]), 'http');
    expect(hits).toBe(1);
  });

  it('verifies an archive, extracts the member and checks its digest', async () => {
    const archive = Buffer.from('fake-archive');
    const model = Buffer.from('extracted-model');
    handler = (_req, res) => res.end(archive);
    const src = source({
      file: 'seg.onnx',
      sha256: sha(model),
      bytes: model.length,
      archive: { name: 'seg.tar.bz2', sha256: sha(archive), member: 'dir/model.onnx' },
    });
    const extract = async (_a: string, member: string, out: string) => {
      expect(member).toBe('dir/model.onnx');
      await writeFile(out, model);
    };
    await run([src], { extract, freeBytes: async () => 1e12 });
    expect(await readFile(join(dir, 'seg.onnx'))).toEqual(model);
    await expect(stat(join(dir, 'seg.tar.bz2.part'))).rejects.toThrow();

    await rm(join(dir, 'seg.onnx'));
    const bad = async (_a: string, _m: string, out: string) => writeFile(out, 'wrong');
    await fails(run([src], { extract: bad }), 'checksum');
    await expect(stat(join(dir, 'seg.onnx'))).rejects.toThrow();
  });
});

describe('model URL table', () => {
  it('has a url for every pinned digest and only https urls on allowed hosts', () => {
    expect(Object.keys(MODEL_URLS).sort()).toEqual(Object.keys(digests).sort());
    for (const { url } of Object.values(MODEL_URLS)) expect(new URL(url).protocol).toBe('https:');
  });
});
