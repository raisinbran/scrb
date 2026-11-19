import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_BY_SLICE = {
  2: [
    'whisper-cli.exe',
    'whisper-server.exe',
    'whisper-vad-speech-segments.exe',
    'scrb-sherpa.exe',
    'ffmpeg.exe',
    'ffprobe.exe',
  ],
  3: [
    'whisper-cli.exe',
    'whisper-server.exe',
    'whisper-vad-speech-segments.exe',
    'scrb-sherpa.exe',
    'ffmpeg.exe',
    'ffprobe.exe',
    'scrb-capture.exe',
  ],
};

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function requiredFile(root, relativePath, label) {
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    normalized.split('/').some((part) => part === '..' || part === '.')
  ) {
    throw new Error(`${label} contains an unsafe path: ${relativePath}`);
  }
  const file = path.join(root, ...normalized.split('/'));
  if (!existsSync(file) || !statSync(file).isFile()) {
    throw new Error(`${label} is missing: ${normalized}`);
  }
  return file;
}

function directBinaries(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(exe|dll)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function licenseFiles(directory, prefix = '') {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`license tree contains a symbolic link: ${relative}`);
    if (entry.isDirectory()) return licenseFiles(file, relative);
    return entry.isFile() ? [relative] : [];
  });
}

function equalSet(actual, expected, label) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    throw new Error(
      `${label} mismatch: expected [${expectedSorted.join(', ')}], got [${actualSorted.join(', ')}]`,
    );
  }
}

export function verifyWindowsPackage({ stagingDir, packagedDir, slice }) {
  const requiredTools = TOOLS_BY_SLICE[slice];
  if (!requiredTools) throw new Error(`unsupported Windows package slice: ${slice}`);

  for (const [label, directory] of [
    ['staging', stagingDir],
    ['packaged resources/bin', packagedDir],
  ]) {
    if (!directory || !existsSync(directory) || !statSync(directory).isDirectory()) {
      throw new Error(`${label} directory is missing: ${directory ?? '(not provided)'}`);
    }
  }

  const provenance = JSON.parse(
    readFileSync(requiredFile(stagingDir, 'PROVENANCE.json', 'staging provenance'), 'utf8'),
  );
  if (slice === 3) {
    const capture = provenance.sources?.capture;
    if (
      !capture ||
      capture.architecture !== 'x64' ||
      !/^[a-f0-9]{40}$/i.test(capture.sourceCommit ?? '') ||
      !/^[a-f0-9]{40}$/i.test(capture.sourceFileCommit ?? '') ||
      !/^[a-f0-9]{64}$/i.test(capture.sourceTreeSha256 ?? '') ||
      !/^[a-f0-9]{40}$/i.test(capture.opusSourceCommit ?? '') ||
      !/^[a-f0-9]{64}$/i.test(capture.opusLibrarySha256 ?? '') ||
      !capture.runtimePolicy?.includes('/MD')
    ) {
      throw new Error('capture helper provenance is missing source, libopus, or runtime identity');
    }
  }
  const audit = JSON.parse(
    readFileSync(
      requiredFile(stagingDir, 'DEPENDENCY-AUDIT.json', 'staging dependency audit'),
      'utf8',
    ),
  );
  const stagedFiles = provenance.stagedFiles;
  if (!Array.isArray(stagedFiles) || !Array.isArray(audit.files)) {
    throw new Error('staging provenance or dependency audit has no staged file manifest');
  }

  const manifestByName = new Map();
  for (const entry of stagedFiles) {
    if (
      !entry ||
      typeof entry.name !== 'string' ||
      typeof entry.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/i.test(entry.sha256)
    ) {
      throw new Error('staging provenance contains an invalid executable/DLL entry');
    }
    const key = entry.name.toLowerCase();
    if (manifestByName.has(key)) throw new Error(`duplicate staged manifest entry: ${entry.name}`);
    manifestByName.set(key, entry);
  }

  for (const tool of requiredTools) {
    if (!manifestByName.has(tool.toLowerCase())) {
      throw new Error(`staging provenance is missing required tool: ${tool}`);
    }
  }

  const manifestEntries = [...manifestByName.values()].sort((a, b) => a.name.localeCompare(b.name));
  const manifestExecutables = manifestEntries
    .filter((entry) => /\.exe$/i.test(entry.name))
    .map((entry) => entry.name);
  equalSet(manifestExecutables, requiredTools, 'staging required executable set');
  const auditEntries = [...audit.files].sort((a, b) => a.name.localeCompare(b.name));
  if (JSON.stringify(auditEntries) !== JSON.stringify(manifestEntries)) {
    throw new Error('dependency audit file hashes do not match staging provenance');
  }

  for (const [label, directory] of [
    ['staging', stagingDir],
    ['packaged resources/bin', packagedDir],
  ]) {
    equalSet(
      directBinaries(directory),
      manifestEntries.map((entry) => entry.name),
      `${label} executable/DLL set`,
    );
    for (const entry of manifestEntries) {
      const actualHash = sha256(requiredFile(directory, entry.name, `${label} manifest file`));
      if (actualHash !== entry.sha256) {
        throw new Error(
          `${label} hash mismatch for ${entry.name}: expected ${entry.sha256}, got ${actualHash}`,
        );
      }
    }
  }

  const expectedLicenses = provenance.licenseFiles;
  if (!Array.isArray(expectedLicenses) || !expectedLicenses.includes('THIRD_PARTY_NOTICES.md')) {
    throw new Error('staging provenance is missing its third-party notice manifest');
  }
  for (const [label, directory] of [
    ['staging', stagingDir],
    ['packaged resources/bin', packagedDir],
  ]) {
    const actual = [
      ...(existsSync(path.join(directory, 'THIRD_PARTY_NOTICES.md'))
        ? ['THIRD_PARTY_NOTICES.md']
        : []),
      ...(existsSync(path.join(directory, 'licenses'))
        ? licenseFiles(path.join(directory, 'licenses'), 'licenses')
        : []),
    ];
    equalSet(actual, expectedLicenses, `${label} license/notice set`);
    for (const relative of expectedLicenses) {
      const file = requiredFile(directory, relative, `${label} license/notice`);
      if (sha256(file) !== sha256(requiredFile(stagingDir, relative, 'staging license/notice'))) {
        throw new Error(`${label} license/notice differs from staging: ${relative}`);
      }
    }
  }

  for (const metadata of ['PROVENANCE.json', 'DEPENDENCY-AUDIT.json']) {
    const staged = requiredFile(stagingDir, metadata, 'staging metadata');
    const packaged = requiredFile(packagedDir, metadata, 'packaged metadata');
    if (sha256(staged) !== sha256(packaged)) {
      throw new Error(`packaged metadata differs from staging: ${metadata}`);
    }
  }

  const executableCount = requiredTools.length;
  return {
    executableCount,
    dllCount: manifestEntries.length - executableCount,
    licenseFileCount: expectedLicenses.length,
  };
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--staging', '--packaged', '--slice'].includes(key) || !value || value.startsWith('--')) {
      throw new Error(`invalid argument: ${key}`);
    }
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.staging || !options.packaged || !options.slice) {
    throw new Error(
      'usage: verify-win-package.mjs --staging <bin> --packaged <resources/bin> --slice 2|3',
    );
  }
  const result = verifyWindowsPackage({
    stagingDir: path.resolve(options.staging),
    packagedDir: path.resolve(options.packaged),
    slice: Number(options.slice),
  });
  process.stdout.write(
    `Verified slice ${options.slice} package: ${result.executableCount} executables, ${result.dllCount} DLLs, ${result.licenseFileCount} license/notice files.\n`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
