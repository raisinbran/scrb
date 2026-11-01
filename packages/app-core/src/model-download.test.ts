// @vitest-environment node
import { createHash } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { type AddressInfo } from 'node:net';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  downloadPinnedModel,
  removeAbandonedModelDownloads,
  type TrustedModelSource,
} from './model-download.ts';

const MODEL_BYTES = Buffer.from('Invented model weights. No external model is downloaded.');
const sources: string[] = [];

async function fixture(): Promise<TrustedModelSource> {
  const folder = await mkdtemp(join(tmpdir(), 'scrb-model-download-'));
  sources.push(folder);
  return {
    path: join(folder, 'invented.gguf'),
    url: 'https://fictional-model.example.invalid/pinned/invented.gguf',
    sha256: createHash('sha256').update(MODEL_BYTES).digest('hex'),
    sizeBytes: MODEL_BYTES.length,
  };
}

async function stages(model: TrustedModelSource): Promise<string[]> {
  return (await readdir(dirname(model.path))).filter((name) => name.includes('.download-'));
}

async function fakeServer(
  respond: (response: ServerResponse) => void,
  run: (fakeFetch: typeof fetch) => Promise<void>,
): Promise<void> {
  const server = createServer((_request, response) => respond(response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as AddressInfo;
    const replacement: typeof fetch = (_url, init) =>
      fetch(`http://127.0.0.1:${address.port}/invented.gguf`, init);
    await run(replacement);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

afterEach(async () => {
  await Promise.all(
    sources.splice(0).map((folder) => rm(folder, { recursive: true, force: true })),
  );
});

describe('pinned model staging, with an invented loopback HTTP fixture', () => {
  it('publishes exact checksum-verified bytes and leaves no staging file', async () => {
    const model = await fixture();
    await fakeServer(
      (res) => {
        res.writeHead(200, { 'Content-Length': MODEL_BYTES.length });
        res.end(MODEL_BYTES);
      },
      async (fetchSource) => downloadPinnedModel(model, { fetchSource }),
    );
    expect(await readFile(model.path)).toEqual(MODEL_BYTES);
    expect(await stages(model)).toEqual([]);
  });

  it('preserves the previously installed file after a same-length corrupt download', async () => {
    const model = await fixture();
    await writeFile(model.path, 'previous installed model');
    await fakeServer(
      (res) => res.end(Buffer.alloc(MODEL_BYTES.length, 42)),
      async (fetchSource) =>
        expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow('checksum'),
    );
    expect(await readFile(model.path, 'utf8')).toBe('previous installed model');
    expect(await stages(model)).toEqual([]);
  });

  it('refuses a chunked response exceeding the pinned maximum size', async () => {
    const model = await fixture();
    await fakeServer(
      (res) => {
        res.write(Buffer.alloc(MODEL_BYTES.length, 65));
        res.end('extra bytes');
      },
      async (fetchSource) =>
        expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow('exceeds'),
    );
    expect(await stages(model)).toEqual([]);
    await expect(readFile(model.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not follow a model-host redirect or retain downloaded bytes', async () => {
    const model = await fixture();
    await fakeServer(
      (res) => {
        res.writeHead(302, { Location: 'https://unapproved.example.invalid/other.gguf' });
        res.end();
      },
      async (fetchSource) =>
        expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow('direct file'),
    );
    expect(await stages(model)).toEqual([]);
  });

  it('removes partial bytes after a socket interruption', async () => {
    const model = await fixture();
    await fakeServer(
      (res) => {
        res.writeHead(200);
        res.write(MODEL_BYTES.subarray(0, 8));
        setImmediate(() => res.destroy());
      },
      async (fetchSource) =>
        expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow(),
    );
    expect(await stages(model)).toEqual([]);
    await expect(readFile(model.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('aborts an active transfer without publishing the incomplete model', async () => {
    const model = await fixture();
    const abort = new AbortController();
    await fakeServer(
      (res) => {
        res.writeHead(200);
        res.write(MODEL_BYTES.subarray(0, 8));
        setTimeout(() => res.end(MODEL_BYTES.subarray(8)), 100);
      },
      async (fetchSource) => {
        const start: typeof fetch = async (url, init) => {
          const response = await fetchSource(url, init);
          setTimeout(() => abort.abort(), 10);
          return response;
        };
        await expect(downloadPinnedModel(model, { fetchSource: start, signal: abort.signal }))
          .rejects.toThrow();
      },
    );
    expect(await stages(model)).toEqual([]);
    await expect(readFile(model.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('refuses a second concurrent download to one destination without corrupting the first', async () => {
    const model = await fixture();
    let release!: (response: Response) => void;
    const fetchSource = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    const first = downloadPinnedModel(model, { fetchSource });
    await vi.waitFor(() => expect(fetchSource).toHaveBeenCalledOnce());
    await expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow('in progress');
    expect(fetchSource).toHaveBeenCalledOnce();
    release(new Response(MODEL_BYTES, { status: 200 }));
    await first;
    expect(await readFile(model.path)).toEqual(MODEL_BYTES);
    expect(await stages(model)).toEqual([]);
  });

  it('does not replace installed model bytes when its staging folder is unavailable', async () => {
    const model = await fixture();
    const parent = dirname(model.path);
    const blocked = join(parent, 'blocked');
    await writeFile(blocked, 'invented existing file');
    const destination = join(blocked, 'unwritable.gguf');
    const fetchSource = vi.fn<typeof fetch>();
    await expect(
      downloadPinnedModel({ ...model, path: destination }, { fetchSource }),
    ).rejects.toThrow();
    expect(await readFile(blocked, 'utf8')).toBe('invented existing file');
    expect(fetchSource).not.toHaveBeenCalled();
  });

  it('rejects invalid source schemes before contacting a provider', async () => {
    const model = await fixture();
    const fetchSource = vi.fn<typeof fetch>();
    await expect(
      downloadPinnedModel({ ...model, url: 'http://models.invalid/unsafe' }, { fetchSource }),
    ).rejects.toThrow('manifest');
    expect(fetchSource).not.toHaveBeenCalled();
    expect(await stages(model)).toEqual([]);
  });

  it('fails closed on a simulated TLS rejection without a partial install', async () => {
    const model = await fixture();
    const fetchSource: typeof fetch = async () => {
      throw new Error('synthetic TLS certificate rejection');
    };
    await expect(downloadPinnedModel(model, { fetchSource })).rejects.toThrow('TLS');
    expect(await stages(model)).toEqual([]);
  });

  it('on restart removes only UUID-named staging files, not folders or other assets', async () => {
    const model = await fixture();
    const folder = sources[sources.length - 1]!;
    const orphan = '.invented.gguf.download-81790608-4aee-4b84-98fc-a2fcd33a7590';
    await writeFile(join(folder, orphan), 'abandoned synthetic bytes');
    await writeFile(join(folder, '.invented.gguf.download-unrelated'), 'keep');
    await mkdir(join(folder, '.invented.gguf.download-81790608-4aee-4b84-98fc-a2fcd33a7591'));
    expect(await removeAbandonedModelDownloads(model.path)).toBe(1);
    expect((await readdir(folder)).sort()).toEqual([
      '.invented.gguf.download-81790608-4aee-4b84-98fc-a2fcd33a7591',
      '.invented.gguf.download-unrelated',
    ]);
  });
});
