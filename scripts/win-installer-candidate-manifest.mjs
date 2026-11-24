// Candidate-specific integrity record for a verified Windows package; no binaries are uploaded.
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA = /^[a-f0-9]{64}$/i;
const COMMIT = /^[a-f0-9]{40}$/i;
const INSTALLER = /^Scribe Setup [0-9]+\.[0-9]+\.[0-9]+\.exe$/;

function requiredRegularFile(file) {
  if (!file) throw new Error('candidate input path is missing');
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error('candidate input is not a nonempty regular file: ' + file);
  }
  return stat;
}

async function record(file) {
  const stat = requiredRegularFile(file);
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return { name: path.basename(file), bytes: stat.size, sha256: hash.digest('hex') };
}

function checkShape(manifest) {
  if (!manifest || manifest.schemaVersion !== 1 || !COMMIT.test(manifest.sourceCommit ?? '')) {
    throw new Error('candidate manifest schema or source commit is invalid');
  }
  if (manifest.installMode !== 'perUser') throw new Error('candidate must be a per-user installer');
  for (const field of ['installer', 'application', 'provenance', 'dependencyAudit']) {
    const item = manifest[field];
    if (
      !item ||
      typeof item.name !== 'string' ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes <= 0 ||
      !SHA.test(item.sha256 ?? '')
    )
      throw new Error('candidate manifest has invalid ' + field);
  }
  if (!INSTALLER.test(manifest.installer.name) || manifest.application.name !== 'Scribe.exe') {
    throw new Error('candidate manifest has an unexpected executable name');
  }
  if (
    manifest.provenance.name !== 'PROVENANCE.json' ||
    manifest.dependencyAudit.name !== 'DEPENDENCY-AUDIT.json'
  )
    throw new Error('candidate staging manifest filenames are invalid');
  return manifest;
}

export async function makeCandidateManifest({
  installerPath,
  applicationPath,
  provenancePath,
  auditPath,
  sourceCommit,
}) {
  if (!COMMIT.test(sourceCommit ?? '')) throw new Error('invalid source commit');
  const [installer, application, provenance, dependencyAudit] = await Promise.all([
    record(installerPath),
    record(applicationPath),
    record(provenancePath),
    record(auditPath),
  ]);
  return checkShape({
    schemaVersion: 1,
    sourceCommit: sourceCommit.toLowerCase(),
    installMode: 'perUser',
    installer,
    application,
    provenance,
    dependencyAudit,
  });
}

export async function verifyCandidateManifest(manifest, options) {
  checkShape(manifest);
  const actual = await makeCandidateManifest(options);
  if (JSON.stringify(manifest) !== JSON.stringify(actual)) {
    throw new Error(
      'candidate manifest differs from the current source, installer, application or staging inputs',
    );
  }
  return actual;
}

function parseArgs(args) {
  if (args.length < 1 || !['create', 'verify'].includes(args[0])) {
    throw new Error(
      'usage: <create|verify> --installer FILE --application FILE --provenance FILE --audit FILE --commit SHA --manifest FILE',
    );
  }
  const mode = args.shift();
  const options = {};
  const allowed = new Set([
    'installer',
    'application',
    'provenance',
    'audit',
    'commit',
    'manifest',
  ]);
  if (args.length !== 12) throw new Error('candidate manifest expects six named arguments');
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].slice(2);
    if (!args[i].startsWith('--') || !allowed.has(key) || !args[i + 1] || key in options) {
      throw new Error('invalid or duplicate candidate argument: ' + args[i]);
    }
    options[key] = args[i + 1];
  }
  if (Object.keys(options).length !== 6) throw new Error('incomplete candidate arguments');
  return { mode, options };
}

async function run() {
  const { mode, options } = parseArgs(process.argv.slice(2));
  const files = {
    installerPath: options.installer,
    applicationPath: options.application,
    provenancePath: options.provenance,
    auditPath: options.audit,
    sourceCommit: options.commit,
  };
  if (mode === 'create') {
    if (existsSync(options.manifest)) throw new Error('refusing to overwrite candidate manifest');
    const manifest = await makeCandidateManifest(files);
    writeFileSync(options.manifest, JSON.stringify(manifest, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log('Candidate manifest created with source, tool-stage and package SHA-256 checks');
  } else {
    requiredRegularFile(options.manifest);
    if (lstatSync(options.manifest).size > 16_384) throw new Error('oversized candidate manifest');
    const manifest = JSON.parse(readFileSync(options.manifest, 'utf8'));
    await verifyCandidateManifest(manifest, files);
    console.log(
      'Candidate manifest verified against current installer and prepackaged application',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
