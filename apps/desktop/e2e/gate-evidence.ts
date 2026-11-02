import { mkdirSync, mkdtempSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export function createGateUserData(name: string): string {
  const root = resolve(
    process.env['SCRB_GATE_EVIDENCE_ROOT'] ?? join(homedir(), 'scrb-gate-evidence', 'manual'),
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  return mkdtempSync(join(root, name + '-'));
}
