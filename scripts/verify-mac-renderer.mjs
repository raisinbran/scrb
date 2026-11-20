import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function filesUnder(root) {
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(path.join(root, prefix), { withFileTypes: true })) {
      const relative = path.posix.join(prefix, entry.name);
      if (entry.isDirectory()) visit(root, relative);
      else if (entry.isFile()) files.push(relative);
    }
  }
  visit(root);
  return files.sort();
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

export function verifyMacRenderer(sourceDir, packagedDir) {
  const sourceFiles = filesUnder(sourceDir);
  const packagedFiles = filesUnder(packagedDir);
  if (sourceFiles.join('\n') !== packagedFiles.join('\n')) {
    throw new Error('packaged renderer file list differs from freshly built dist');
  }
  for (const relative of sourceFiles) {
    if (sha256(path.join(sourceDir, relative)) !== sha256(path.join(packagedDir, relative))) {
      throw new Error(`packaged renderer differs from freshly built dist: ${relative}`);
    }
  }
  const jsFiles = sourceFiles.filter((file) => file.endsWith('.js'));
  if (
    !jsFiles.some((file) =>
      readFileSync(path.join(packagedDir, file), 'utf8').includes('Copy transcript'),
    )
  ) {
    throw new Error('packaged renderer is missing the Copy transcript action');
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const [, , sourceDir, packagedDir] = process.argv;
  if (
    !sourceDir ||
    !packagedDir ||
    !statSync(sourceDir).isDirectory() ||
    !statSync(packagedDir).isDirectory()
  ) {
    throw new Error('usage: node verify-mac-renderer.mjs <built-dist> <packaged-dist>');
  }
  verifyMacRenderer(sourceDir, packagedDir);
  console.log(
    'Verified packaged renderer matches freshly built dist and includes Copy transcript.',
  );
}
