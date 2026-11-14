// Start-up checks for the overnight long run: where the evidence may go and how long a default run is.
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export const DEFAULT_SECONDS = 300;

/** Resolves symlinks in the part of the path that exists, and keeps the rest as written. */
export function canonical(path) {
  let head = resolve(path);
  const tail = [];
  while (!existsSync(head) && dirname(head) !== head) {
    // A dangling symlink exists as a link but not as a target: refuse to guess where it points.
    try {
      lstatSync(head);
      throw new Error(`${head} is a broken link`);
    } catch (error) {
      if (error.message.endsWith('is a broken link')) throw error;
    }
    tail.unshift(basename(head));
    head = dirname(head);
  }
  return join(realpathSync(head), ...tail);
}

const inside = (child, parent) => {
  const path = relative(parent, child);
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
};

/** The evidence folder must be new or empty, and neither the repository nor anything under it. */
export function assertEvidenceDir(work, repoRoots) {
  const target = canonical(work);
  for (const root of repoRoots) {
    const repo = canonical(root);
    if (inside(target, repo) || inside(repo, target)) {
      throw new Error(`the evidence folder ${target} must be outside the repository ${repo}`);
    }
  }
  if (existsSync(target)) {
    if (!lstatSync(target).isDirectory()) throw new Error(`${target} is not a folder`);
    if (readdirSync(target).length > 0) {
      throw new Error(`${target} is not empty: use a fresh folder for each run`);
    }
  }
  return target;
}

/** Anything longer than the 5-minute default must be asked for with an explicit duration. */
export function chooseSeconds(explicit) {
  if (explicit === undefined) return DEFAULT_SECONDS;
  const seconds = Number(explicit);
  if (!(seconds >= 60)) throw new Error('--seconds must be a number of at least 60');
  return seconds;
}
