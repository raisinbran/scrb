import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

// macOS-only: these drive bash, ditto, shasum -a 256 and stat -f. Fake directories only; never /Applications.
const macDescribe = process.platform === 'darwin' ? describe : describe.skip;
const swap = join(import.meta.dirname, 'b0-mac-swap.sh');
const launch = join(import.meta.dirname, 'b0-mac-isolated-launch.sh');
const fresh = join(import.meta.dirname, 'b0-fresh-b0.sh');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'b0swap-test-')));

function fakeApp(dir, text) {
  const app = join(dir, 'Scribe.app/Contents');
  mkdirSync(join(app, 'odd dir'), { recursive: true });
  writeFileSync(join(app, 'a file.txt'), text);
  writeFileSync(join(app, "odd dir/it's"), 'x');
  symlinkSync('a file.txt', join(app, 'link'));
  return join(dir, 'Scribe.app');
}
function runScript(script, args, env) {
  return spawnSync('bash', [script, ...args], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), ...env },
    encoding: 'utf8',
  });
}
const run = (args, env) => runScript(swap, args, env);
/** A marked rehearsal root holding apps/ and b0/. */
function rehearsal(name) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'apps'), { recursive: true });
  mkdirSync(join(dir, 'b0'), { recursive: true });
  writeFileSync(join(dir, '.b0-rehearsal-root'), '');
  writeFileSync(join(dir, 'b0', '.b0-run'), '');
  return dir;
}
const testEnv = (dir, over = {}) => ({
  B0_TEST_MODE: '1',
  B0_REHEARSAL_ROOT: dir,
  APPS: join(dir, 'apps'),
  B0: join(dir, 'b0'),
  ...over,
});

macDescribe('swap test-mode guard (fake directories only)', () => {
  it('refuses the real /Applications, with a trailing slash and through a symlink, before acting', () => {
    const dir = rehearsal('prodguard');
    const alias = join(root, 'alias-to-applications');
    symlinkSync('/Applications', alias);
    for (const apps of ['/Applications', '/Applications/', alias]) {
      const r = run(['fingerprint', root], testEnv(dir, { APPS: apps }));
      expect(r.status, apps).toBe(64);
    }
  });
  it('refuses a missing root, an unmarked root, and a marked root outside the temp root', () => {
    const unmarked = join(root, 'unmarked');
    mkdirSync(join(unmarked, 'apps'), { recursive: true });
    mkdirSync(join(unmarked, 'b0'));
    expect(run(['fingerprint', root], testEnv(unmarked)).status).toBe(64);
    const noRoot = rehearsal('noroot');
    expect(run(['fingerprint', root], testEnv(noRoot, { B0_REHEARSAL_ROOT: '' })).status).toBe(64);
    const outside = mkdtempSync(join(process.cwd(), '.b0-fake-root-'));
    try {
      mkdirSync(join(outside, 'apps'));
      mkdirSync(join(outside, 'b0'));
      writeFileSync(join(outside, '.b0-rehearsal-root'), '');
      const r = run(['fingerprint', root], testEnv(outside));
      expect(r.status).toBe(64);
      expect(r.stderr).toMatch(/inside/);
    } finally {
      execFileSync('rm', ['-r', outside]);
    }
  });
  it('refuses APPS or B0 in an unrelated temp tree, even through a symlink alias', () => {
    const dir = rehearsal('bind');
    const other = rehearsal('bind-other');
    for (const over of [
      { B0: join(other, 'b0') },
      { APPS: join(other, 'apps') },
      { B0: dir }, // the root itself, not inside it
      { B0: join(root, 'does-not-exist') },
    ]) {
      const r = run(['fingerprint', root], testEnv(dir, over));
      expect(r.status, JSON.stringify(over)).toBe(64);
    }
    const alias = join(dir, 'b0-alias');
    symlinkSync(join(other, 'b0'), alias);
    const r = run(['fingerprint', root], testEnv(dir, { B0: alias }));
    expect(r.status).toBe(64);
    expect(r.stderr).toMatch(/B0 must be inside/);
    expect(existsSync(join(other, 'b0', 'backup.sha'))).toBe(false);
  });
  it('accepts a marked rehearsal root, also through a trailing slash or a symlink inside it', () => {
    const dir = rehearsal('ok');
    const sample = fakeApp(join(root, 'fp'), 'v');
    const alias = join(dir, 'apps-alias');
    symlinkSync(join(dir, 'apps'), alias);
    for (const apps of [join(dir, 'apps'), `${join(dir, 'apps')}/`, alias]) {
      const r = run(['fingerprint', sample], testEnv(dir, { APPS: apps }));
      expect(r.status, r.stderr).toBe(0);
    }
  });
});

macDescribe('swap, rollback and fingerprint regression (fake apps)', () => {
  let dir, env, swapEnv, fp, old;
  const live = () => run(['fingerprint', join(dir, 'apps/Scribe.app')], env).stdout;
  beforeAll(() => {
    dir = rehearsal('flow');
    env = testEnv(dir);
    const cand = fakeApp(join(dir, 'cand'), 'new');
    fakeApp(join(dir, 'apps'), 'old');
    const out = run(['fingerprint', cand], env);
    expect(out.status, out.stderr).toBe(0);
    fp = out.stdout;
    swapEnv = {
      ...env,
      CAND: cand,
      EXPECT_FILES: /files=([0-9a-f]{64})/.exec(fp)[1],
      EXPECT_LINKS: /links=([0-9a-f]{64})/.exec(fp)[1],
    };
  });

  it('backs up, rejects a wrong digest without touching the live app, rolls back after an injected failure', () => {
    const backup = run(['backup'], env);
    expect(backup.status, backup.stderr).toBe(0);
    old = live();
    expect(run(['swap'], { ...swapEnv, EXPECT_FILES: 'a'.repeat(64) }).status).toBe(1);
    expect(live()).toBe(old);
    const failed = run(['swap'], { ...swapEnv, B0_TEST_FAIL_AFTER_MOVE: '1' });
    expect(failed.status).toBe(1);
    expect(failed.stdout).toMatch(/ROLLED BACK/);
    expect(live()).toBe(old);
  });
  it('swaps, then rolls back to the backup fingerprint', () => {
    expect(run(['swap'], swapEnv).status).toBe(0);
    expect(live()).toBe(fp);
    const r = run(['rollback'], env);
    expect(r.status).toBe(0);
    expect(live()).not.toBe(fp);
  });
});

macDescribe(
  'fresh B0 guard, production style (fake HOME, fake app root, fake directories only)',
  () => {
    const home = join(root, 'home');
    const apps = join(root, 'fake-applications');
    const lib = join(home, 'Documents/Meeting Scribe');
    const support = join(home, 'Library/Application Support/Scribe');
    mkdirSync(lib, { recursive: true });
    mkdirSync(support, { recursive: true });
    mkdirSync(join(apps, 'Scribe.app'), { recursive: true });
    const base = { HOME: home, APP: join(apps, 'Scribe.app'), B0_APP: join(apps, 'Scribe.app') };
    const snapshot = () => execFileSync('find', [lib, support, apps], { encoding: 'utf8' });
    const marked = (dir) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, '.b0-run'), '');
      return dir;
    };

    it('create refuses an existing path, a dangling symlink, and overlap with owner roots, writing nothing', () => {
      const dangling = join(root, 'dangling-b0');
      symlinkSync(join(root, 'nowhere'), dangling);
      const existing = join(root, 'existing-b0');
      mkdirSync(existing);
      for (const b0 of [
        dangling,
        existing,
        join(lib, 'b0'),
        join(support, 'b0'),
        join(apps, 'b0'),
        join(home, 'Documents'),
      ]) {
        const r = runScript(fresh, ['create'], { ...base, B0: b0 });
        expect(r.status, b0).toBe(1);
      }
      expect(existsSync(join(lib, 'b0'))).toBe(false);
      expect(existsSync(join(apps, 'b0'))).toBe(false);
    });
    it('create makes a dedicated marked directory outside the owner roots; check then accepts it', () => {
      const b0 = join(root, 'fresh-b0');
      expect(runScript(fresh, ['create'], { ...base, B0: b0 }).status).toBe(0);
      expect(existsSync(join(b0, '.b0-run'))).toBe(true);
      expect(runScript(fresh, ['check'], { ...base, B0: b0 }).status).toBe(0);
      expect(runScript(fresh, ['create'], { ...base, B0: b0 }).status).toBe(1); // not reusable
    });
    it('production-mode swap backup/swap/rollback and launch prepare refuse an overlapping or unmarked B0 before any write', () => {
      const inLib = marked(join(lib, 'b0'));
      const alias = join(root, 'alias-into-support');
      symlinkSync(support, alias);
      const unmarked = join(root, 'unmarked-b0');
      mkdirSync(unmarked);
      const before = snapshot();
      const env = {
        ...base,
        APPS: apps,
        CAND: join(root, 'cand'),
        EXPECT_FILES: 'a'.repeat(64),
        EXPECT_LINKS: 'b'.repeat(64),
      };
      for (const b0 of [inLib, alias, unmarked, join(apps, 'Scribe.app')]) {
        for (const [script, args] of [
          [swap, ['backup']],
          [swap, ['swap']],
          [swap, ['rollback']],
          [launch, ['prepare']],
        ]) {
          const r = runScript(script, args, { ...env, B0: b0 });
          expect(r.status, `${b0} ${args}`).toBe(1);
        }
      }
      expect(existsSync(join(inLib, 'backup.sha'))).toBe(false);
      expect(existsSync(join(inLib, 'run.env'))).toBe(false);
      expect(existsSync(join(support, 'run.env'))).toBe(false);
      expect(existsSync(join(unmarked, 'backup.sha.tmp'))).toBe(false);
      expect(snapshot()).toBe(before);
    });
    it('evidence refuses a bad label and a symlinked evidence directory, writing nothing outside B0', () => {
      const b0 = join(root, 'ev-b0');
      expect(runScript(fresh, ['create'], { ...base, B0: b0 }).status).toBe(0);
      const library = join(root, 'ev-library');
      mkdirSync(library);
      writeFileSync(join(library, 'x.txt'), 'x');
      writeFileSync(join(b0, 'run.env'), `RUN=${root}\nPROFILE=${root}\nLIB=${library}\n`);
      for (const label of ['', '.', '..', '../up', 'a/b', '.hidden', 'a b']) {
        const r = runScript(launch, ['evidence', label], { ...base, B0: b0 });
        expect(r.status, label).toBe(1);
      }
      const target = join(root, 'ev-escape');
      mkdirSync(target);
      symlinkSync(target, join(b0, 'evidence'));
      const r = runScript(launch, ['evidence', 'good'], { ...base, B0: b0 });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/symlink/);
      expect(execFileSync('ls', [target], { encoding: 'utf8' })).toBe('');
    });
    it('evidence accepts a simple label and refuses a dangling symlink destination', () => {
      const b0 = join(root, 'ev2-b0');
      expect(runScript(fresh, ['create'], { ...base, B0: b0 }).status).toBe(0);
      const library = join(root, 'ev2-library');
      mkdirSync(library);
      writeFileSync(join(library, 'x.txt'), 'x');
      writeFileSync(join(b0, 'run.env'), `RUN=${root}\nPROFILE=${root}\nLIB=${library}\n`);
      expect(runScript(launch, ['evidence', 'after-stop'], { ...base, B0: b0 }).status).toBe(0);
      expect(existsSync(join(b0, 'evidence/after-stop/x.txt'))).toBe(true);
      symlinkSync(join(root, 'nowhere2'), join(b0, 'evidence/dangling'));
      expect(runScript(launch, ['evidence', 'dangling'], { ...base, B0: b0 }).status).toBe(1);
    });
    it('prepare works in a fresh B0 and puts profile and library under the temp root', () => {
      const b0 = join(root, 'prep-b0');
      expect(runScript(fresh, ['create'], { ...base, B0: b0 }).status).toBe(0);
      const r = runScript(launch, ['prepare'], { ...base, B0: b0 });
      expect(r.status, r.stderr).toBe(0);
      const env = readEnvFile(join(b0, 'run.env'));
      expect(env.LIB.startsWith(realpathSync(tmpdir()))).toBe(true);
      execFileSync('rm', ['-r', env.RUN]);
    });
  },
);

function readEnvFile(path) {
  const out = {};
  for (const line of execFileSync('cat', [path], { encoding: 'utf8' }).split('\n')) {
    const m = /^(\w+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/\\(.)/g, '$1');
  }
  return out;
}
