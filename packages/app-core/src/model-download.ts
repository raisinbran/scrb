import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import type { PinnedModelArtifact } from './model-artifacts.ts';

export interface TrustedModelSource extends PinnedModelArtifact {
  /** Supplied only by an owner-reviewed, immutable model manifest; never by renderer IPC. */
  url: string;
}

export interface ModelDownloadOptions {
  signal?: AbortSignal;
  /** Test seam for a loopback fake server. Production always uses global fetch. */
  fetchSource?: typeof fetch;
}

const SHA256 = /^[a-f0-9]{64}$/i;
const activeDownloads = new Set<string>();
const UUID_SUFFIX = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

function validateSource(source: TrustedModelSource): void {
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error('Invalid pinned model URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.hash !== '' ||
    !SHA256.test(source.sha256) ||
    !Number.isSafeInteger(source.sizeBytes) ||
    source.sizeBytes <= 0 ||
    !source.path.trim()
  ) {
    throw new Error('Invalid pinned model manifest');
  }
}

/** Streams an owner-pinned HTTPS model into a private file; only verified bytes become visible. */
export async function downloadPinnedModel(
  source: TrustedModelSource,
  options: ModelDownloadOptions = {},
): Promise<void> {
  validateSource(source);
  options.signal?.throwIfAborted();
  const destination = resolve(source.path);
  if (activeDownloads.has(destination)) throw new Error('A model download is already in progress');
  const directory = dirname(source.path);
  const staged = join(directory, `.${basename(source.path)}.download-${randomUUID()}`);
  activeDownloads.add(destination);
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    await mkdir(directory, { recursive: true });
    const response = await (options.fetchSource ?? fetch)(source.url, {
      redirect: 'manual',
      ...(options.signal ? { signal: options.signal } : {}),
    });
    if (response.status !== 200 || response.redirected || !response.body) {
      throw new Error('Pinned model source did not return a direct file');
    }
    const declared = response.headers.get('content-length');
    if (declared && Number(declared) > source.sizeBytes) {
      throw new Error('Pinned model exceeds manifest size');
    }
    handle = await open(staged, 'wx', 0o600);
    const hash = createHash('sha256');
    const reader = response.body.getReader();
    let received = 0;
    try {
      for (;;) {
        options.signal?.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > source.sizeBytes) throw new Error('Pinned model exceeds manifest size');
        hash.update(value);
        let offset = 0;
        while (offset < value.byteLength) {
          const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset);
          if (bytesWritten === 0) throw new Error('Model write failed');
          offset += bytesWritten;
        }
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    if (received !== source.sizeBytes || hash.digest('hex') !== source.sha256.toLowerCase()) {
      throw new Error('Pinned model checksum or size mismatch');
    }
    options.signal?.throwIfAborted();
    await handle.sync();
    await handle.close();
    handle = null;
    options.signal?.throwIfAborted();
    await rename(staged, source.path);
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(staged, { force: true }).catch(() => undefined);
    activeDownloads.delete(destination);
  }
}

/** Startup-only cleanup: never delete models, unrelated files, symlinks or folders. */
export async function removeAbandonedModelDownloads(modelPath: string): Promise<number> {
  const directory = dirname(modelPath);
  const base = basename(modelPath).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^\\.${base}\\.download-${UUID_SUFFIX}$`, 'i');
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    },
  );
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !pattern.test(entry.name)) continue;
    await rm(join(directory, entry.name));
    removed += 1;
  }
  return removed;
}
