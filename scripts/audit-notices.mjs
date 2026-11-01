import { readFileSync } from 'node:fs';

// Inventory only. npm metadata is not a substitute for redistributable license text.
const lockfiles = [
  'package-lock.json',
  'packages/export/package-lock.json',
  'packages/summary/package-lock.json',
  'packages/transcription/package-lock.json',
];
const inventory = new Map();
for (const path of lockfiles) {
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  for (const [location, entry] of Object.entries(lock.packages ?? {})) {
    if (!location.includes('node_modules/') || !entry || typeof entry !== 'object') continue;
    const name = location.slice(location.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const key = `${name}@${entry.version ?? 'unknown'}`;
    const record = inventory.get(key) ?? { name, version: entry.version ?? 'unknown', license: entry.license ?? 'UNKNOWN', lockfiles: [] };
    record.lockfiles.push(path);
    inventory.set(key, record);
  }
}
const items = [...inventory.values()].sort((a, b) =>
  a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
);
const missingMetadata = items.filter((item) => item.license === 'UNKNOWN');
process.stdout.write(JSON.stringify({
  totalUniqueNameVersions: items.length,
  packagesWithoutLicenseMetadata: missingMetadata.length,
  packages: items,
}, null, 2) + '\n');
process.stderr.write(
  'Inventory only: verify actual shipped binaries/models, source licenses, exact notice text and permissions before claiming coverage.\n',
);
if (missingMetadata.length) process.exitCode = 1;
