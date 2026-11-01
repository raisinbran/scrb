import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

// Deliberately break one implementation at a time in CI, run its specific test, then restore it.
function replaceExactlyOnce(source, expected, replacement) {
  const at = source.indexOf(expected);
  if (at < 0 || source.indexOf(expected, at + expected.length) >= 0) {
    throw new Error('Regression mutation no longer matches exactly one source location');
  }
  return source.slice(0, at) + replacement + source.slice(at + expected.length);
}

const cases = [
  {
    id: 'C1',
    path: 'apps/desktop/src/main/exports.ts',
    test: 'apps/desktop/src/main/exports.test.ts',
    name: 'prints HTML over the data-URL limit',
    mutate: (src) =>
      replaceExactlyOnce(
        src,
        'await window.loadFile(file);',
        'await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);',
      ),
  },
  {
    id: 'C2 model gate',
    path: 'packages/app-core/src/large-model-gate.ts',
    test: 'packages/app-core/src/large-model-gate.test.ts',
    name: 'serializes',
    mutate: (src) => replaceExactlyOnce(src, 'if (this.busy) {', 'if (false) {'),
  },
  {
    id: 'C2 recording preemption',
    path: 'apps/desktop/src/main/summaries.ts',
    test: 'apps/desktop/src/main/summaries.test.ts',
    name: 'cancels active summary generation before recording begins',
    mutate: (src) =>
      replaceExactlyOnce(
        src,
        '  async stopForRecording(): Promise<void> {\n    this.startingAbort?.abort();\n    const active = this.active;\n    if (!active) return;\n    active.abort.abort();\n    await active.done;\n  }',
        '  async stopForRecording(): Promise<void> {\n    this.startingAbort?.abort();\n  }',
      ),
  },
  {
    id: 'C3',
    path: 'apps/desktop/src/main/imports.ts',
    test: 'apps/desktop/src/main/imports.test.ts',
    name: 'continues startup cleanup after a removal failure',
    mutate: (src) =>
      replaceExactlyOnce(
        src,
        "      } catch (error) {\n        this.deps.library.logger.log('warn', 'import-recovery-cleanup-failed', errorFields(error));\n      }",
        '      } catch (error) {\n        throw error;\n      }',
      ),
  },
  {
    id: 'C4',
    path: 'apps/desktop/src/main/imports.ts',
    test: 'apps/desktop/src/main/imports.test.ts',
    name: 'keeps chosen paths private',
    mutate: (src) =>
      replaceExactlyOnce(
        src,
        'vocabularyHint: vocabularyHint(library.vocabulary.enabledTerms()),',
        'vocabularyHint: undefined,',
      ),
  },
  {
    id: 'C5',
    path: 'apps/desktop/src/main/exports.ts',
    test: 'apps/desktop/src/main/exports.test.ts',
    name: 'prints HTML over the data-URL limit',
    mutate: (src) => replaceExactlyOnce(src, '        javascript: false,\n', ''),
  },
  {
    id: 'C6',
    path: 'apps/desktop/src/main/exports.ts',
    test: 'apps/desktop/src/main/exports.test.ts',
    name: 'maps busy and missing|sanitizes title-derived',
    mutate: () =>
      execFileSync('git', ['show', '097a897801^:apps/desktop/src/main/exports.ts'], {
        encoding: 'utf8',
      }),
  },
];

const failures = [];
for (const item of cases) {
  const file = resolve(item.path);
  const original = await readFile(file, 'utf8');
  try {
    const broken = item.mutate(original);
    if (broken === original) throw new Error('Mutation did not change the source');
    await writeFile(file, broken, 'utf8');
    const result = spawnSync(
      process.execPath,
      ['node_modules/vitest/vitest.mjs', 'run', item.test, '-t', item.name],
      { encoding: 'utf8', timeout: 60_000, env: { ...process.env, NO_COLOR: '1' } },
    );
    const output = (result.stdout ?? '') + (result.stderr ?? '');
    if (result.error || result.signal || result.status === 0 || !/FAIL\s/.test(output)) {
      throw new Error(
        'Expected a failing assertion, got status ' +
          result.status +
          ', signal ' +
          result.signal +
          ':\n' +
          output.slice(-3000),
      );
    }
    console.log(item.id + ': red proven (' + item.name + ')');
  } catch (error) {
    failures.push(item.id + ': ' + String(error));
  } finally {
    await writeFile(file, original, 'utf8');
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log('All C1–C6 broken-code variants failed their targeted tests; source restored.');
}
