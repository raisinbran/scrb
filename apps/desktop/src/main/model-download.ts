import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ModelDownloadFailure, ModelDownloadProgress, ModelRole } from '@scrb/contracts';

export type DownloadFailure =
  'cancelled' | 'offline' | 'checksum' | 'size' | 'diskSpace' | 'insecure' | 'http';

export class DownloadError extends Error {
  readonly code: DownloadFailure;
  constructor(code: DownloadFailure, message: string) {
    super(message);
    this.code = code;
  }
}

export interface DownloadSource {
  /** Final file name in the models folder; must equal a key of scripts/model-digests.json. */
  file: string;
  role: ModelRole;
  label: string;
  url: string;
  sha256: string;
  bytes: number;
  /** When set, `url` serves a .tar.bz2 whose `member` is the model; the archive is verified first. */
  archive?: { name: string; sha256: string; member: string };
}

/** Pinned URLs come from scripts/dev-assets.sh; the sizes and digests from scripts/model-digests.json. */
export const MODEL_URLS: Record<string, { url: string; archive?: DownloadSource['archive'] }> = {
  'ggml-large-v3-turbo-q5_0.bin': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin',
  },
  'ggml-small.en-q5_1.bin': {
    url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en-q5_1.bin',
  },
  'ggml-silero-v6.2.0.bin': {
    url: 'https://huggingface.co/ggml-org/whisper-vad/resolve/9ffd54a1e1ee413ddf265af9913beaf518d1639b/ggml-silero-v6.2.0.bin',
  },
  '3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx': {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-recongition-models/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx',
  },
  'segmentation-model.int8.onnx': {
    url: 'https://github.com/k2-fsa/sherpa-onnx/releases/download/speaker-segmentation-models/sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
    archive: {
      name: 'sherpa-onnx-pyannote-segmentation-3-0.tar.bz2',
      sha256: '24615ee884c897d9d2ba09bb4d30da6bb1b15e685065962db5b02e76e4996488',
      member: 'sherpa-onnx-pyannote-segmentation-3-0/model.int8.onnx',
    },
  },
};

/** Hosts a pinned URL may redirect to (the CDNs behind Hugging Face and GitHub releases). */
export const DEFAULT_ALLOWED_HOSTS = [
  'huggingface.co',
  'hf.co',
  'github.com',
  'githubusercontent.com',
];

const hostAllowed = (host: string, allowed: string[]): boolean =>
  allowed.some((entry) => host === entry || host.endsWith(`.${entry}`));

export interface DownloadOptions {
  dir: string;
  sources: DownloadSource[];
  signal?: AbortSignal;
  onProgress?: (progress: ModelDownloadProgress) => void;
  /** Files that are already installed and verified are skipped. */
  isInstalled?: (source: DownloadSource) => Promise<boolean>;
  /** Unpacks `member` of a verified archive into `outFile`. Required only for archive sources. */
  extract?: (archive: string, member: string, outFile: string) => Promise<void>;
  /** Tests only: the real fetch is the default. */
  fetchFn?: typeof fetch;
  /** Tests only: the real free-space reading is the default. */
  freeBytes?: (dir: string) => Promise<number>;
  /** Tests only: plain-http hosts that are accepted, e.g. `127.0.0.1`. */
  insecureHosts?: string[];
  allowedHosts?: string[];
  retries?: number;
  retryDelayMs?: number;
  progressIntervalMs?: number;
  /** Space kept free beyond the download itself. */
  marginBytes?: number;
  /** Tests may lower the periodic disk-space check interval. */
  freeSpaceCheckIntervalBytes?: number;
}

const MAX_REDIRECTS = 5;
const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const FREE_SPACE_CHECK_INTERVAL = 64 * 1024 * 1024;

async function freeBytesOf(dir: string): Promise<number> {
  const info = await statfs(dir);
  return Number(info.bavail) * Number(info.bsize);
}

async function checkedFreeBytes(
  read: (dir: string) => Promise<number>,
  dir: string,
): Promise<number> {
  try {
    const free = await read(dir);
    if (!Number.isFinite(free) || free < 0) throw new Error('Invalid free-space value');
    return free;
  } catch {
    throw new DownloadError('diskSpace', 'Could not check free disk space for the download.');
  }
}

async function sizeOr0(file: string): Promise<number> {
  try {
    return (await stat(file)).size;
  } catch {
    return 0;
  }
}

async function hashFile(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

function abortIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new DownloadError('cancelled', 'The download was cancelled.');
}

/**
 * Fetches `url`, following at most five redirects by hand so each hop is checked: https only
 * (except listed test hosts) and only to allowed hosts. No credentials are ever sent.
 */
async function open(
  url: string,
  start: number,
  o: Required<Pick<DownloadOptions, 'allowedHosts' | 'insecureHosts'>> & {
    fetchFn: typeof fetch;
    signal: AbortSignal | undefined;
  },
): Promise<Response> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current);
    const insecureOk = o.insecureHosts.includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && insecureOk))
      throw new DownloadError('insecure', 'Downloads must use https.');
    if (!insecureOk && !hostAllowed(parsed.hostname, o.allowedHosts))
      throw new DownloadError('insecure', 'The download tried to leave its trusted hosts.');
    let response: Response;
    try {
      response = await o.fetchFn(current, {
        redirect: 'manual',
        headers: start > 0 ? { Range: `bytes=${start}-` } : {},
        ...(o.signal ? { signal: o.signal } : {}),
      });
    } catch (error) {
      if (o.signal?.aborted) throw new DownloadError('cancelled', 'The download was cancelled.');
      throw new DownloadError('offline', `Could not reach the download server: ${String(error)}`);
    }
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get('location');
      await response.body?.cancel();
      if (!next) throw new DownloadError('http', 'A redirect had no destination.');
      current = new URL(next, current).toString();
      continue;
    }
    return response;
  }
  throw new DownloadError('http', 'Too many redirects.');
}

/**
 * Downloads every source that is not installed, one at a time, into `dir`. Each file goes to
 * `<name>.part`, resumes with a Range request after a drop or restart, is size- and SHA-256-checked
 * and only then renamed into place, so a half-written or wrong file never carries a model's name.
 * Cancel keeps the .part for resume; a checksum or size mismatch deletes it.
 */
export async function downloadModels(options: DownloadOptions): Promise<void> {
  const { dir, sources, signal } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const retries = options.retries ?? 3;
  const delay = options.retryDelayMs ?? 1000;
  const interval = options.progressIntervalMs ?? 250;
  const net = {
    fetchFn,
    signal,
    allowedHosts: options.allowedHosts ?? DEFAULT_ALLOWED_HOSTS,
    insecureHosts: options.insecureHosts ?? [],
  };
  const todo: DownloadSource[] = [];
  const overallTotal = sources.reduce((sum, item) => sum + item.bytes, 0);
  // Failures before the first byte (disk space, unreadable folder) must reach the user too.
  const failBeforeStart = (error: unknown): never => {
    const first = todo[0] ?? sources[0];
    if (first && !(error instanceof DownloadError && error.code === 'cancelled'))
      options.onProgress?.({
        role: first.role,
        modelName: first.label,
        state: 'failed',
        bytesDone: 0,
        bytesTotal: first.bytes,
        overallBytesDone: 0,
        overallBytesTotal: overallTotal,
        ...(error instanceof DownloadError ? { reason: error.code as ModelDownloadFailure } : {}),
        message: error instanceof DownloadError ? error.message : 'The download could not start.',
      });
    throw error;
  };
  try {
    await mkdir(dir, { recursive: true });
    for (const source of sources) if (!(await options.isInstalled?.(source))) todo.push(source);
    if (todo.length === 0) return;

    let needed = 0;
    for (const source of todo)
      needed += Math.max(0, source.bytes - (await sizeOr0(path.join(dir, `${source.file}.part`))));
    const free = await checkedFreeBytes(options.freeBytes ?? freeBytesOf, dir);
    if (free < needed + (options.marginBytes ?? 256 * 1024 * 1024))
      throw new DownloadError(
        'diskSpace',
        `Not enough free disk space. Free up about ${Math.ceil((needed + (options.marginBytes ?? 256 * 1024 * 1024)) / 1e6)} MB and try again.`,
      );
  } catch (error) {
    failBeforeStart(error);
  }
  const todoTotal = todo.reduce((sum, item) => sum + item.bytes, 0);
  let finished = 0;
  for (const source of todo) {
    const report = (
      state: ModelDownloadProgress['state'],
      done: number,
      message?: string,
      reason?: ModelDownloadFailure,
    ) =>
      options.onProgress?.({
        overallBytesDone: finished + (state === 'done' ? 0 : done),
        overallBytesTotal: todoTotal,
        ...(reason ? { reason } : {}),
        role: source.role,
        modelName: source.label,
        state,
        bytesDone: done,
        bytesTotal: source.bytes,
        ...(message ? { message } : {}),
      });
    try {
      await fetchOne(
        source,
        dir,
        net,
        retries,
        delay,
        interval,
        report,
        options.extract,
        options.freeBytes ?? freeBytesOf,
        options.marginBytes ?? 256 * 1024 * 1024,
        options.freeSpaceCheckIntervalBytes ?? FREE_SPACE_CHECK_INTERVAL,
      );
    } catch (error) {
      const message =
        error instanceof DownloadError ? error.message : 'The download failed unexpectedly.';
      if (!(error instanceof DownloadError && error.code === 'cancelled'))
        report(
          'failed',
          0,
          message,
          error instanceof DownloadError ? (error.code as ModelDownloadFailure) : undefined,
        );
      throw error;
    }
    finished += source.bytes;
    report('done', source.bytes);
  }
}

async function fetchOne(
  source: DownloadSource,
  dir: string,
  net: Parameters<typeof open>[2],
  retries: number,
  delay: number,
  interval: number,
  report: (state: ModelDownloadProgress['state'], done: number, message?: string) => void,
  extract: DownloadOptions['extract'],
  freeBytes: (dir: string) => Promise<number>,
  marginBytes: number,
  freeSpaceCheckInterval: number,
): Promise<void> {
  const target = source.archive
    ? { name: source.archive.name, sha256: source.archive.sha256, bytes: MAX_ARCHIVE_BYTES }
    : { name: source.file, sha256: source.sha256, bytes: source.bytes };
  const part = path.join(dir, `${target.name}.part`);
  let lastError: DownloadError | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    abortIfCancelled(net.signal);
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    let have = await sizeOr0(part);
    if (have > target.bytes) {
      await rm(part, { force: true });
      have = 0;
    }
    try {
      if (have < target.bytes) {
        const response = await open(source.url, have, net);
        if (response.status === 416) {
          // The part is not a prefix of this file: start over.
          await rm(part, { force: true });
          throw new DownloadError('offline', 'The partial download was stale; restarting.');
        }
        if (response.status !== 200 && response.status !== 206) {
          await response.body?.cancel();
          // A server fault may pass; a refusal (404, 403) will not.
          throw new DownloadError(
            response.status >= 500 ? 'offline' : 'http',
            `The server answered ${response.status}.`,
          );
        }
        const resumed = response.status === 206 && have > 0;
        if (!resumed) have = 0;
        if (!response.body) throw new DownloadError('offline', 'The server sent no data.');
        const contentLength = Number(response.headers.get('content-length'));
        if (
          Number.isFinite(contentLength) &&
          contentLength >= 0 &&
          have + contentLength > target.bytes
        ) {
          await response.body.cancel();
          await rm(part, { force: true });
          throw new DownloadError('size', `${source.label} exceeds its allowed download size.`);
        }
        let done = have;
        let last = 0;
        const body = Readable.fromWeb(response.body as never);
        let nextSpaceCheck = done + Math.max(1, freeSpaceCheckInterval);
        const bounded = new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            done += chunk.length;
            if (done > target.bytes) {
              callback(
                new DownloadError('size', `${source.label} exceeds its allowed download size.`),
              );
              return;
            }
            const sendProgress = () => {
              const now = Date.now();
              if (now - last >= interval) {
                last = now;
                report('downloading', Math.min(done, source.bytes));
              }
            };
            const checkSpace = async (): Promise<void> => {
              if (done < nextSpaceCheck) return;
              nextSpaceCheck = done + Math.max(1, freeSpaceCheckInterval);
              const beforeChunk = done - chunk.length;
              const reserve = source.archive
                ? Math.min(
                    Math.max(0, target.bytes - beforeChunk),
                    Math.max(1, freeSpaceCheckInterval) + chunk.length,
                  )
                : Math.max(0, source.bytes - beforeChunk);
              if ((await checkedFreeBytes(freeBytes, dir)) < marginBytes + reserve) {
                throw new DownloadError(
                  'diskSpace',
                  'Free disk space fell below the download reserve.',
                );
              }
            };
            void checkSpace().then(() => {
              sendProgress();
              callback(null, chunk);
            }, callback);
          },
        });
        try {
          await pipeline(
            body,
            bounded,
            createWriteStream(part, {
              flags: resumed ? 'a' : 'w',
              mode: process.platform === 'win32' ? undefined : 0o600,
            }),
            {
              ...(net.signal ? { signal: net.signal } : {}),
            },
          );
        } catch (error) {
          if (error instanceof DownloadError) throw error;
          if (net.signal?.aborted)
            throw new DownloadError('cancelled', 'The download was cancelled.');
          throw new DownloadError('offline', `The connection dropped: ${String(error)}`);
        }
      }
      const size = await sizeOr0(part);
      if (target.name === source.file && size < target.bytes) {
        // Truncated: keep the part and ask again from where it ended.
        throw new DownloadError('offline', 'The connection ended before the file was complete.');
      }
      if (size > target.bytes || (target.name === source.file && size !== target.bytes)) {
        await rm(part, { force: true });
        throw new DownloadError('size', `${source.label} has the wrong size.`);
      }
      report('verifying', source.bytes);
      if ((await hashFile(part)) !== target.sha256) {
        await rm(part, { force: true });
        throw new DownloadError('checksum', `${source.label} failed its integrity check.`);
      }
      // Hashing cannot be interrupted: a cancel that came meanwhile must not install the file.
      abortIfCancelled(net.signal);
      const final = path.join(dir, source.file);
      if (source.archive) {
        if (!extract) throw new DownloadError('http', 'No archive extractor is configured.');
        const out = `${final}.part`;
        await extract(part, source.archive.member, out);
        if (net.signal?.aborted) {
          await rm(out, { force: true });
          abortIfCancelled(net.signal);
        }
        const ok = (await sizeOr0(out)) === source.bytes && (await hashFile(out)) === source.sha256;
        if (!ok) {
          await rm(out, { force: true });
          await rm(part, { force: true });
          throw new DownloadError('checksum', `${source.label} failed its integrity check.`);
        }
        if (net.signal?.aborted) {
          await rm(out, { force: true });
          abortIfCancelled(net.signal);
        }
        await rename(out, final);
        await rm(part, { force: true });
      } else {
        await rename(part, final);
      }
      return;
    } catch (error) {
      if (!(error instanceof DownloadError)) throw error;
      if (error.code === 'size') await rm(part, { force: true });
      // Only dropped connections, server faults and stale ranges are worth another try.
      const retryable = error.code === 'offline';
      if (!retryable) throw error;
      lastError = error;
    }
  }
  throw lastError ?? new DownloadError('offline', 'The download failed.');
}

/** The packaged download list: the models in `rows` missing from `dir`, with pinned URL, size and digest. */
export function sourcesFor(
  rows: { file: string; role: ModelRole; label: string }[],
  table: Record<string, { sha256: string; bytes: number }>,
): DownloadSource[] {
  return rows.flatMap((row) => {
    const pin = table[row.file];
    const where = MODEL_URLS[row.file];
    if (!pin || !where) return [];
    return [
      {
        ...row,
        url: where.url,
        sha256: pin.sha256,
        bytes: pin.bytes,
        ...(where.archive ? { archive: where.archive } : {}),
      },
    ];
  });
}

/**
 * Unpacks one member of a hash-verified .tar.bz2 with the system `tar` (macOS and Windows 10+
 * ship one). Only the named member is extracted, to a temp folder, then moved to `outFile`.
 */
export async function extractWithTar(
  archive: string,
  member: string,
  outFile: string,
): Promise<void> {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { mkdtemp, copyFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const work = await mkdtemp(path.join(tmpdir(), 'scrb-extract-'));
  try {
    await promisify(execFile)('tar', ['-xjf', archive, '-C', work, member]);
    await copyFile(path.join(work, member), outFile);
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * One download at a time. Starting while one runs does nothing; `cancel` aborts it and keeps the
 * partial files for resume. Failures reach the UI as `failed` progress events, never as throws.
 */
export function createModelDownloader(base: Omit<DownloadOptions, 'signal'>) {
  let running: AbortController | null = null;
  return {
    start(): void {
      if (running) return;
      const controller = new AbortController();
      running = controller;
      void downloadModels({ ...base, signal: controller.signal })
        .catch(() => undefined)
        .finally(() => {
          running = null;
        });
    },
    cancel(): void {
      running?.abort();
    },
    isRunning: (): boolean => running !== null,
  };
}
