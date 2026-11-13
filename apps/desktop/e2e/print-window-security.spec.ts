import { expect, test } from '@playwright/test';
import electronPath from 'electron';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Real Electron: the hidden print window is given a page that tries to load another local file
// and network URLs. The decisions are read from inside its own session, and a real server counts hits.
test('the print window refuses other local files and the network', async () => {
  test.setTimeout(120_000);
  const work = mkdtempSync(join(tmpdir(), 'scrb-print-probe-'));
  const bundle = join(work, 'probe.cjs');
  await build({
    entryPoints: [fileURLToPath(new URL('./fixtures/print-probe-main.ts', import.meta.url))],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'silent',
  });
  const out = join(work, 'result.json');
  // Started directly, not through Playwright's Electron launcher, whose debugger handshake can stall app start-up.
  const child = spawn(
    electronPath as unknown as string,
    [bundle, `--user-data-dir=${join(work, 'user-data')}`],
    {
      env: { ...process.env, PROBE_OUT: out, PROBE_DIR: work },
      stdio: ['ignore', 'ignore', 'pipe'] as const,
    },
  );
  let log = '';
  child.stderr.on('data', (chunk) => (log += String(chunk)));
  const code = await new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 90_000);
    child.once('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (!existsSync(out)) throw new Error(`probe wrote no result (exit ${code}): ${log}`);
  const result = JSON.parse(readFileSync(out, 'utf8')) as {
    requests: { url: string; allowed: boolean }[];
    hits: string[];
    pdfHeader: string;
    error: string;
    other: string;
    left: string[];
  };
  expect(result.error).toBe('');
  expect(result.pdfHeader).toBe('%PDF-');
  expect(result.hits).toEqual([]);
  const allowed = result.requests.filter((r) => r.allowed);
  expect(allowed).toHaveLength(1);
  expect(allowed[0]?.url).toMatch(/\.scrb-print-[0-9a-f-]+\.html$/);
  const blocked = result.requests.filter((r) => !r.allowed).map((r) => r.url);
  expect(blocked.some((url) => url.startsWith('http://127.0.0.1'))).toBe(true);
  expect(blocked.some((url) => url.endsWith('other-local.png'))).toBe(true);
  // The temporary page is gone afterwards.
  expect(result.left).toEqual(['other-local.png']);
});
