import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

/** First line of every results file; only a file starting with it may be overwritten. */
export const RESULTS_HEADER = 'Outline-fill accuracy on private meetings (numbers only).';

export type ErrorCode = 'E_INPUT_MISSING' | 'E_OUTPUT_UNSAFE' | 'E_PARSE' | 'E_UNKNOWN';
const MESSAGES: Record<ErrorCode, string> = {
  E_INPUT_MISSING: 'Meetings folder not found.',
  E_OUTPUT_UNSAFE:
    'Output path refused (inside the repository, a symlink, an input file, or not a previous results file).',
  E_PARSE: 'An input file could not be parsed.',
  E_UNKNOWN: 'Unexpected error; no details are printed to protect private data.',
};

/** An error that carries only a fixed code; never built from file names or exception text. */
export class RunError extends Error {
  constructor(readonly code: ErrorCode) {
    super(code);
  }
}
export const messageFor = (code: ErrorCode): string => `Error ${code}: ${MESSAGES[code]}`;

function realTarget(path: string): string {
  const tail: string[] = [];
  let p = resolve(path);
  for (;;) {
    try {
      return join(realpathSync(p), ...tail.reverse());
    } catch {
      const parent = dirname(p);
      if (parent === p) return resolve(path);
      tail.push(basename(p));
      p = parent;
    }
  }
}

const isInside = (parent: string, child: string): boolean => {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
};

/** Files inside the meeting sub-folders (inputs and recordings), to a small depth. */
function inputFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isDirectory()) {
        if (depth < 4) walk(full, depth + 1);
      } else if (depth > 0) out.push(full);
    }
  };
  walk(root, 0);
  return out;
}

function startsWithHeader(file: string): boolean {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(RESULTS_HEADER.length);
    const n = readSync(fd, buf, 0, buf.length, 0);
    return buf.toString('utf8', 0, n) === RESULTS_HEADER;
  } finally {
    closeSync(fd);
  }
}

/**
 * Returns the real path to write, or throws E_OUTPUT_UNSAFE. Refused: a path inside the repository (also
 * through a symlinked parent), a symlink at the path itself (dangling or not), a directory, the same file
 * as any input or recording (also by hard link), and any existing file that is not a previous results file.
 */
export function safeOutputPath(requested: string, repoRoot: string, meetingsRoot: string): string {
  const unsafe = new RunError('E_OUTPUT_UNSAFE');
  const abs = resolve(requested);
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    st = null;
  }
  if (st?.isSymbolicLink()) throw unsafe;
  const real = realTarget(abs);
  if (isInside(realpathSync(repoRoot), real)) throw unsafe;
  if (st === null && existsSync(abs)) throw unsafe;
  if (st !== null) {
    if (!st.isFile()) throw unsafe;
    for (const f of inputFiles(meetingsRoot)) {
      const other = statSync(f);
      if (other.ino === st.ino && other.dev === st.dev) throw unsafe;
    }
    if (!startsWithHeader(abs)) throw unsafe;
  }
  return real;
}
