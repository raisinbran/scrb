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

const script = join(import.meta.dirname, 'b0-mac-swap.sh');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'b0swap-test-')));

function fakeApp(dir, text) {
  const app = join(dir, 'Scribe.app/Contents');
  mkdirSync(join(app, 'odd dir'), { recursive: true });
  writeFileSync(join(app, 'a file.txt'), text);
  writeFileSync(join(app, "odd dir/it's"), 'x');
  symlinkSync('a file.txt', join(app, 'link'));
  return join(dir, 'Scribe.app');
}
function run(args, env) {
  return spawnSync('bash', [script, ...args], {
    env: { PATH: process.env.PATH, TMPDIR: tmpdir(), ...env },
    encoding: 'utf8',
  });
}
function rehearsal(name) {
  const dir = join(root, name);
  mkdirSync(join(dir, 'apps'), { recursive: true });
  mkdirSync(join(dir, 'b0'), { recursive: true });
  writeFileSync(join(dir, 'apps/.b0-rehearsal-tree'), '');
  return dir;
}

const mac = process.platform === 'darwin';
const macDescribe = mac ? describe : describe.skip; // macOS-only: bash, ditto, shasum -a 256, stat -f

macDescribe('test-mode guard (fake directories only)', () => {
  it('refuses the real /Applications, with and without a trailing slash and through a symlink, before acting', () => {
    for (const apps of ['/Applications', '/Applications/', join(root, 'alias-to-applications')]) {
      if (apps.endsWith('alias-to-applications')) symlinkSync('/Applications', apps);
      const r = run(['fingerprint', root], {
        B0_TEST_MODE: '1',
        APPS: apps,
        B0: join(root, 'b0x'),
      });
      expect(r.status, apps).toBe(64);
      expect(existsSync(join(root, 'b0x'))).toBe(false);
    }
  });
  it('refuses an unmarked directory, a marked directory outside the temp root, and a symlink to one', () => {
    const unmarked = join(root, 'unmarked');
    mkdirSync(unmarked);
    expect(run(['fingerprint', root], { B0_TEST_MODE: '1', APPS: unmarked, B0: root }).status).toBe(
      64,
    );
    const outside = mkdtempSync(join(process.cwd(), '.b0-fake-prod-'));
    writeFileSync(join(outside, '.b0-rehearsal-tree'), '');
    const alias = join(root, 'alias-to-fake-prod');
    symlinkSync(outside, alias);
    try {
      for (const apps of [outside, `${outside}/`, alias, `${alias}/`]) {
        const r = run(['fingerprint', root], { B0_TEST_MODE: '1', APPS: apps, B0: root });
        expect(r.status, apps).toBe(64);
        expect(r.stderr).toMatch(/inside/);
      }
    } finally {
      execFileSync('rm', ['-r', outside]);
    }
  });
  it('refuses a backup dir outside the temp root, or one that is missing', () => {
    const dir = rehearsal('b0guard');
    const outside = mkdtempSync(join(process.cwd(), '.b0-fake-b0-'));
    try {
      for (const b0 of [outside, join(root, 'does-not-exist')]) {
        const r = run(['fingerprint', root], {
          B0_TEST_MODE: '1',
          APPS: join(dir, 'apps'),
          B0: b0,
        });
        expect(r.status, b0).toBe(64);
        expect(r.stderr).toMatch(/B0/);
      }
    } finally {
      execFileSync('rm', ['-r', outside]);
    }
  });
  it('accepts a marked rehearsal tree, also through a trailing slash or a symlink inside the temp root', () => {
    const dir = rehearsal('ok');
    const apps = join(dir, 'apps');
    const alias = join(root, 'ok-alias');
    symlinkSync(apps, alias);
    const sample = fakeApp(join(root, 'fp'), 'v');
    for (const a of [apps, `${apps}/`, alias]) {
      expect(
        run(['fingerprint', sample], {
          B0_TEST_MODE: '1',
          APPS: a,
          B0: join(dir, 'b0'),
        }).status,
      ).toBe(0);
    }
  });
});

macDescribe('swap, rollback and fingerprint regression (fake apps)', () => {
  let dir, env, swapEnv, fp, old;
  const live = () => run(['fingerprint', join(dir, 'apps/Scribe.app')], env).stdout;
  beforeAll(() => {
    dir = rehearsal('flow');
    env = { B0_TEST_MODE: '1', APPS: join(dir, 'apps'), B0: join(dir, 'b0') };
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
