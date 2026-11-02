#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  createReadStream, existsSync, mkdirSync, mkdtempSync, openSync, closeSync,
  readFileSync, readdirSync, statSync, writeFileSync, rmSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const base = resolve(process.env.SCRB_GATE_EVIDENCE_HOME || join(homedir(), 'scrb-gate-evidence'));
const repoName = 'raisinbran/scrb';
const STALL_LIMIT_SEC = 120;

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

function option(args, name, required = true) {
  const i = args.indexOf('--' + name);
  const value = i < 0 ? undefined : args[i + 1];
  if (required) ensure(value && !value.startsWith('--'), 'Missing --' + name);
  return value;
}

function identify(args) {
  const gate = Number(option(args, 'gate'));
  const platform = option(args, 'platform');
  const id = option(args, 'id');
  ensure(Number.isInteger(gate) && gate >= 1 && gate <= 8, 'Invalid gate');
  ensure(platform === 'windows' || platform === 'macos', 'Invalid platform');
  ensure(/^[a-z0-9][a-z0-9-]{3,45}$/.test(id), 'Invalid run ID');
  return { gate, platform, id };
}

function git(args, cwd = repo) {
  const result = spawnSync('git', args, {
    cwd, encoding: 'utf8', timeout: 60000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  });
  ensure(result.status === 0, 'git ' + args[0] + ' failed: ' + (result.stderr || result.error?.message || '').slice(0, 400));
  return result.stdout.trim();
}

function commandCwd(args) {
  const directory = option(args, 'cwd', false);
  if (!directory) return repo;
  const target = resolve(repo, directory);
  ensure(target === repo || target.startsWith(repo + sep), 'Command directory outside repository');
  ensure(existsSync(target) && statSync(target).isDirectory(), 'Missing command directory');
  return target;
}

function runDir(id) {
  const target = resolve(base, id);
  ensure(target.startsWith(base + sep), 'Evidence path outside root');
  ensure(!(target === repo || target.startsWith(repo + sep)), 'Evidence must be outside Git');
  return target;
}

function prepare(meta) {
  const dir = runDir(meta.id);
  ensure(!existsSync(dir), 'Evidence directory already exists: ' + dir);
  mkdirSync(base, { recursive: true, mode: 0o700 });
  mkdirSync(dir, { mode: 0o700 });
  const sourceCommit = git(['rev-parse', 'HEAD']);
  writeFileSync(join(dir, 'run.json'), JSON.stringify({
    ...meta, sourceCommit, startedAt: new Date().toISOString(),
  }, null, 2) + '\n', { mode: 0o600 });
  return dir;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function numeric(input, keys) {
  const safe = {};
  for (const key of keys) safe[key] = finiteNumber(input?.[key]);
  return safe;
}

// Presence of speech is determined by the test's known public source, not by model output.
export function checkLiveProgress(samples) {
  if (!Array.isArray(samples) || samples.length < 2) return { status: 'unverified', maxStallSec: null, samples: 0 };
  let previous = null;
  let noProgressSec = 0;
  let maxStallSec = 0;
  let largestSampleGapSec = 0;
  let audibleIntervals = 0;
  let progressedIntervals = 0;
  for (const sample of samples) {
    const elapsedSec = finiteNumber(sample?.elapsedSec);
    const meetingWords = finiteNumber(sample?.meetingWords);
    ensure(elapsedSec !== null && meetingWords !== null && typeof sample.speechPresent === 'boolean', 'Invalid live sample');
    if (previous) {
      ensure(elapsedSec > previous.elapsedSec && meetingWords >= previous.meetingWords, 'Nonmonotonic live samples');
      largestSampleGapSec = Math.max(largestSampleGapSec, elapsedSec - previous.elapsedSec);
      if (sample.speechPresent && previous.speechPresent) {
        audibleIntervals++;
        if (meetingWords > previous.meetingWords) progressedIntervals++;
      }
      noProgressSec = sample.speechPresent && previous.speechPresent && meetingWords === previous.meetingWords
        ? noProgressSec + elapsedSec - previous.elapsedSec
        : 0;
      maxStallSec = Math.max(maxStallSec, noProgressSec);
    }
    previous = { elapsedSec, meetingWords, speechPresent: sample.speechPresent };
  }
  return {
    status: maxStallSec >= STALL_LIMIT_SEC ? 'fail' : audibleIntervals && progressedIntervals && largestSampleGapSec <= STALL_LIMIT_SEC ? 'no-stall-detected' : 'unverified',
    maxStallSec, samples: samples.length,
  };
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function inventory(dir) {
  const files = [];
  async function visit(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in evidence: ' + entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name !== 'evidence-inventory.json') {
        const info = statSync(path);
        files.push({ path: relative(dir, path).split(sep).join('/'), size: info.size, sha256: await digest(path) });
      }
    }
  }
  await visit(dir);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const localInventory = join(dir, 'evidence-inventory.json');
  writeFileSync(localInventory, JSON.stringify({ files }, null, 2) + '\n', { mode: 0o600 });
  const names = files.map((file) => basename(file.path));
  return {
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.size, 0),
    inventorySha256: await digest(localInventory),
    audioManifestPresent: names.includes('chunks.json'),
    transcriptPresent: names.includes('transcript.json'),
  };
}

function safeTimeline(samples) {
  if (!Array.isArray(samples)) return [];
  ensure(samples.length <= 2000, 'Too many live samples');
  return samples.map((sample) => ({
    elapsedSec: finiteNumber(sample.elapsedSec),
    meetingWords: finiteNumber(sample.meetingWords),
    speechPresent: sample.speechPresent === true,
    ...numeric(sample, [
      'pcmAgeMs', 'ackAgeMs', 'segmentAgeMs', 'queueDepth', 'vadSpans', 'modelCalls', 'emptyResults',
    ]),
  }));
}

export function summarize(meta, metrics, items, exitCode) {
  const recording = numeric(metrics?.recording, [
    'durationSec', 'decodedChunks', 'decodeFailures', 'microphoneGapMs', 'meetingGapMs',
  ]);
  const performance = numeric(metrics?.performance, ['peakMemoryMiB', 'stopAcknowledgmentMs']);
  const live = checkLiveProgress(metrics?.live?.samples);
  const hasRecording = items.audioManifestPresent && recording.decodedChunks !== null && recording.decodedChunks > 0;
  const hasDecodeCheck = recording.decodeFailures === 0;
  const timeline = safeTimeline(metrics?.live?.samples);
  const covered = recording.durationSec !== null && recording.durationSec > 0 && timeline.length > 1 &&
    timeline[0].elapsedSec <= 60 &&
    timeline[timeline.length - 1].elapsedSec >= recording.durationSec - 120;
  const hasLiveProof = meta.gate !== 3 || (live.status === 'no-stall-detected' && items.transcriptPresent && covered);
  const failure = exitCode !== 0 || recording.decodeFailures > 0 || live.status === 'fail';
  const status = failure ? 'FAIL' : hasRecording && hasDecodeCheck && hasLiveProof ? 'CHECKS_PASSED' : 'INCOMPLETE';
  return {
    schemaVersion: 1,
    gate: meta.gate,
    platform: meta.platform,
    runId: meta.id,
    sourceCommit: meta.sourceCommit,
    completedAt: new Date().toISOString(),
    testExitCode: exitCode,
    status,
    gateApproved: false,
    recording, performance,
    live: {
      status: live.status, sampleCount: live.samples, maxStallSec: live.maxStallSec,
      wordCount: finiteNumber(metrics?.live?.wordCount),
      timeline,
    },
    evidence: items,
  };
}

function publish(report) {
  const remote = git(['remote', 'get-url', 'origin']);
  ensure(/github\.com[:/]raisinbran\/scrb(?:\.git)?$/i.test(remote), 'Origin must be raisinbran/scrb');
  const id = report.runId;
  const branch = 'rosmont/gate-evidence-' + report.platform + '-' + id;
  const output = mkdtempSync(join(tmpdir(), 'scrb-gate-publish-'));
  const path = join('docs', 'gates', 'evidence', report.platform, id + '.json');
  let registered = false;
  try {
    git(['worktree', 'add', '--detach', output, 'HEAD']);
    registered = true;
    git(['switch', '-c', branch], output);
    const destination = join(output, path);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, JSON.stringify(report, null, 2) + '\n');
    git(['add', '--', path], output);
    git(['-c', 'user.name=SRCB Gate Evidence', '-c', 'user.email=gate-evidence@users.noreply.github.com',
      'commit', '-m', 'test: retain safe gate evidence summary'], output);
    git(['push', 'origin', 'HEAD:refs/heads/' + branch], output);
    return 'https://github.com/' + repoName + '/blob/' + branch + '/' + path.replaceAll(sep, '/');
  } finally {
    if (registered) {
      try { git(['worktree', 'remove', '--force', output]); } catch { /* Keep the original error. */ }
      try { git(['branch', '-D', branch]); } catch { /* No local branch to remove. */ }
    }
    if (existsSync(output)) rmSync(output, { recursive: true, force: true });
  }
}

async function finish(meta, exitCode, doPublish) {
  const dir = runDir(meta.id);
  const run = readJson(join(dir, 'run.json'));
  ensure(run.gate === meta.gate && run.platform === meta.platform, 'Run metadata mismatch');
  const metricsPath = join(dir, 'metrics.json');
  const metrics = existsSync(metricsPath) ? readJson(metricsPath) : null;
  const items = await inventory(dir);
  const report = summarize(run, metrics, items, exitCode);
  writeFileSync(join(dir, 'safe-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const url = doPublish ? publish(report) : null;
  console.log(JSON.stringify({ status: report.status, localEvidence: dir, githubReport: url }));
  return report.status === 'CHECKS_PASSED' ? 0 : 1;
}

async function main() {
  const [action, ...args] = process.argv.slice(2);
  if (action === 'run') {
    const divider = args.indexOf('--');
    ensure(divider >= 0 && args.length > divider + 1, 'Usage: run --gate N --platform macos|windows --id ID -- COMMAND [ARGS]');
    const flags = args.slice(0, divider);
    const meta = identify(flags);
    const cwd = commandCwd(flags);
    const dir = prepare(meta);
    const command = args.slice(divider + 1);
    const log = openSync(join(dir, 'test-console.log'), 'wx', 0o600);
    let exitCode;
    try {
      const child = spawnSync(command[0], command.slice(1), {
        cwd, env: { ...process.env, SCRB_GATE_EVIDENCE_ROOT: dir, SCRB_GATE_EVIDENCE_DIR: dir },
        stdio: ['inherit', log, log], timeout: 8 * 60 * 60 * 1000,
      });
      exitCode = child.status ?? 1;
      if (child.error) writeFileSync(join(dir, 'runner-error.txt'), child.error.message);
    } finally {
      closeSync(log);
    }
    process.exitCode = await finish(meta, exitCode, true);
  } else if (action === 'publish') {
    const meta = identify(args);
    const exitCode = Number(option(args, 'exit-code'));
    ensure(Number.isInteger(exitCode) && exitCode >= 0 && exitCode <= 255, 'Invalid exit code');
    process.exitCode = await finish(meta, exitCode, !args.includes('--local-only'));
  } else {
    throw new Error('Use run or publish; see docs/gates/evidence-retention-policy.md');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error('Evidence publication failed: ' + error.message); process.exitCode = 1; });
}
