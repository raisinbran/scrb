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
    env: { PATH: process.env.PATH, TMPDIR: tmpdir(), ...env },
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

macDescribe('isolated launch evidence destination (fake HOME and directories only)', () => {
  const home = join(root, 'home');
  const apps = join(root, 'fake-applications');
  mkdirSync(join(home, 'Documents/Meeting Scribe'), { recursive: true });
  mkdirSync(join(home, 'Library/Application Support/Scribe'), { recursive: true });
  mkdirSync(join(apps, 'Scribe.app'), { recursive: true });
  const base = { HOME: home, APP: join(apps, 'Scribe.app') };
  const prepare = (b0) => runScript(launch, ['prepare'], { ...base, B0: b0 });

  it('refuses B0 inside or equal to the owner library, models, app folder, or home', () => {
    const alias = join(root, 'alias-to-library');
    symlinkSync(join(home, 'Documents/Meeting Scribe'), alias);
    mkdirSync(join(home, 'Documents/Meeting Scribe/sub'));
    for (const b0 of [
      join(home, 'Documents/Meeting Scribe'),
      join(home, 'Documents/Meeting Scribe/sub'),
      alias,
      join(home, 'Library/Application Support/Scribe'),
      apps,
      join(apps, 'Scribe.app'),
      home,
    ]) {
      const r = prepare(b0);
      expect(r.status, b0).toBe(1);
      expect(r.stderr, b0).toMatch(/overlaps a protected location/);
    }
    expect(existsSync(join(home, 'Documents/Meeting Scribe/run.env'))).toBe(false);
    expect(existsSync(join(home, 'Documents/Meeting Scribe/sub/run.env'))).toBe(false);
  });
  it('refuses a missing B0, and accepts a disjoint existing one (profile and library under temp)', () => {
    expect(prepare(join(root, 'nope')).status).toBe(1);
    const evidence = mkdtempSync(join(process.cwd(), '.b0-fake-evidence-'));
    try {
      const r = prepare(evidence);
      expect(r.status, r.stderr).toBe(0);
      const env = readEnvFile(join(evidence, 'run.env'));
      expect(env.LIB.startsWith(realpathSync(tmpdir()))).toBe(true);
      execFileSync('rm', ['-r', env.RUN]);
    } finally {
      execFileSync('rm', ['-r', evidence]);
    }
  });
});

function readEnvFile(path) {
  const out = {};
  for (const line of execFileSync('cat', [path], { encoding: 'utf8' }).split('\n')) {
    const m = /^(\w+)=(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/\\(.)/g, '$1');
  }
  return out;
}
