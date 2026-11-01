import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lockfiles = [
  'package-lock.json',
  'packages/export/package-lock.json',
  'packages/summary/package-lock.json',
  'packages/transcription/package-lock.json',
];

const external = new Map();
const workspaceLinks = new Set();
const problems = [];

for (const lockfile of lockfiles) {
  const lock = JSON.parse(readFileSync(resolve(root, lockfile), 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages) {
    problems.push(`${lockfile}: expected npm lockfile v3 with packages`);
    continue;
  }
  for (const [location, entry] of Object.entries(lock.packages)) {
    if (!location.includes('node_modules/')) continue;
    const name = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
    if (entry.link) {
      workspaceLinks.add(name);
      continue;
    }
    const version = entry.version ?? 'unknown';
    const license = entry.license ?? 'UNKNOWN';
    const id = `${name}@${version}`;
    const record = external.get(id) ?? {
      name, version, license, runtimeCandidate: false, lockfiles: [],
    };
    if (record.license !== license) {
      problems.push(`${id}: conflicting license metadata across lockfiles`);
    }
    // npm's dev/devOptional flags are dependency-install hints, not bundle evidence.
    record.runtimeCandidate ||= entry.dev !== true && entry.devOptional !== true;
    if (!record.lockfiles.includes(lockfile)) record.lockfiles.push(lockfile);
    external.set(id, record);
  }
}

const entries = [...external.values()].sort(
  (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
const candidates = entries.filter((entry) => entry.runtimeCandidate);
const withoutMetadata = entries.filter((entry) => entry.license === 'UNKNOWN');
for (const entry of withoutMetadata) problems.push(
  `${entry.name}@${entry.version}: missing npm license metadata`,
);

const report = {
  scope: 'npm lockfile metadata only; not a shipped-bundle or legal-notice audit',
  lockfiles,
  summary: {
    uniqueExternalNameVersions: entries.length,
    uniqueWorkspaceLinks: workspaceLinks.size,
    runtimeCandidates: candidates.length,
    withoutLicenseMetadata: withoutMetadata.length,
  },
  runtimeCandidates: candidates,
  workspaceLinks: [...workspaceLinks].sort(),
  problems,
};
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  const { summary } = report;
  process.stdout.write(
    `External npm name/version entries: ${summary.uniqueExternalNameVersions}; ` +
    `runtime candidates: ${summary.runtimeCandidates}; ` +
    `internal workspace links: ${summary.uniqueWorkspaceLinks}; ` +
    `missing external license metadata: ${summary.withoutLicenseMetadata}.\n`,
  );
  for (const entry of candidates) {
    process.stdout.write(`${entry.name}@${entry.version} | ${entry.license}\n`);
  }
  for (const problem of problems) process.stderr.write(`Metadata warning: ${problem}\n`);
}
process.stderr.write(
  'Not proof of distribution: identify built assets and inspect exact installed license texts, ' +
    'native binaries, models and redistribution rights before publishing notices.\n',
);
if (process.argv.includes('--check') && problems.length > 0) process.exitCode = 1;
