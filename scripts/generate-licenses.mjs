import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LICENSE_FILE = /^(licen[sc]e|copying|unlicense)([-._].*)?$/i;
// Shipped although declared as dev dependencies, because the build bundles or packages them.
const EXTRA_ROOTS = ['electron'];

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

function findPackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (dir === path.dirname(dir)) return null;
  }
}

function licenseId(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license && typeof pkg.license.type === 'string') return pkg.license.type;
  if (Array.isArray(pkg.licenses) && pkg.licenses.length) {
    return pkg.licenses.map((l) => (typeof l === 'string' ? l : l.type)).join(' OR ');
  }
  return '';
}

function readLicenseText(dir) {
  const files = readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort();
  const text = files
    .map((f) => readFileSync(path.join(dir, f), 'utf8').trim())
    .join('\n\n')
    .trim();
  return text || readmeLicenseSection(dir);
}

/** Some old packages carry their license only as a README section; accept it when it is a full grant. */
function readmeLicenseSection(dir) {
  const readme = readdirSync(dir).find((f) => /^readme(\.md|\.markdown|\.txt)?$/i.test(f));
  if (!readme) return '';
  const body = readFileSync(path.join(dir, readme), 'utf8');
  const heading = /^#{1,6}\s*licen[sc]e\b.*$/im.exec(body);
  const section = heading ? body.slice(heading.index).trim() : '';
  return /permission is hereby granted|apache license|redistribution and use/i.test(section)
    ? section
    : '';
}

/** Every installed npm package the app ships, as problems-or-entries. Pure over `root`. */
export function collectNpmLicenses(root, { startDirs, extraRoots = EXTRA_ROOTS } = {}) {
  const entries = new Map();
  const problems = [];
  const seenDirs = new Set();
  const visit = (name, fromDir, optional, shallow = false) => {
    const dir = findPackageDir(name, fromDir);
    if (!dir) {
      if (!optional) problems.push(`${name}: not installed`);
      return;
    }
    if (seenDirs.has(dir)) return;
    seenDirs.add(dir);
    const pkg = readJson(path.join(dir, 'package.json'));
    const isWorkspace = name.startsWith('@scrb/');
    if (!isWorkspace) {
      const license = licenseId(pkg);
      const text = readLicenseText(dir);
      if (!license) problems.push(`${name}@${pkg.version}: no license identifier`);
      else if (!text) problems.push(`${name}@${pkg.version}: no license text file`);
      else entries.set(`${name}@${pkg.version}`, { name, version: pkg.version, license, text });
    }
    if (shallow) return;
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir, false);
    for (const dep of Object.keys(pkg.optionalDependencies ?? {})) visit(dep, dir, true);
  };
  for (const start of startDirs ?? [path.join(root, 'apps/desktop')]) {
    const pkg = readJson(path.join(start, 'package.json'));
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, start, false);
  }
  // Electron's own npm dependencies only download the binary; they are not shipped.
  for (const name of extraRoots) visit(name, root, false, true);
  return { entries: [...entries.values()], problems };
}

export function collectCatalogLicenses(root, catalog, digests) {
  const entries = [];
  const problems = [];
  for (const item of [...catalog.components, ...catalog.models]) {
    if (item.digestFile && !digests[item.digestFile]) {
      problems.push(`${item.name}: ${item.digestFile} is not in scripts/model-digests.json`);
    }
    const file = path.join(root, item.textFile);
    const text = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
    if (!item.license || !text)
      problems.push(`${item.name}: missing license or text (${item.textFile})`);
    else entries.push({ name: item.name, version: item.version, license: item.license, text });
  }
  return { entries, problems };
}

export function generateLicenses(root = repo) {
  const npm = collectNpmLicenses(root);
  const catalog = readJson(path.join(root, 'third_party/license-catalog.json'));
  const digests = readJson(path.join(root, 'scripts/model-digests.json'));
  const native = collectCatalogLicenses(root, catalog, digests);
  const problems = [...npm.problems, ...native.problems];
  if (problems.length) {
    throw new Error(
      `Cannot resolve licenses for shipped dependencies:\n- ${problems.join('\n- ')}`,
    );
  }
  return [...npm.entries, ...native.entries].sort(
    (a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  );
}

export function writeLicenses(outFile, root = repo) {
  const list = generateLicenses(root);
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(list, null, 1) + '\n');
  return list.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2] ?? path.join(repo, 'apps/desktop/dist-electron/licenses.json');
  process.stdout.write(`Wrote ${writeLicenses(out)} licenses to ${out}\n`);
}
