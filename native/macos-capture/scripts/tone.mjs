// Shared by the macOS capture tests: how to start afplay for the test tone.
// SCRB_TEST_TONE_FILE replaces the tone file (for tests that only need some sound on the meeting track).
// SCRB_TEST_TONE_VOLUME sets afplay -v (0 to 1). With a replacement file and no volume, -v 0.3 is used.
// With neither variable set the command is exactly `afplay <file>`.
import { spawn } from 'node:child_process';

export function toneCommand(file, env = process.env) {
  const override = env.SCRB_TEST_TONE_FILE;
  const volume = env.SCRB_TEST_TONE_VOLUME || (override ? '0.3' : '');
  return ['afplay', ...(volume ? ['-v', volume] : []), override || file];
}

export function playTone(file) {
  const [cmd, ...args] = toneCommand(file);
  return spawn(cmd, args, { stdio: 'ignore' });
}

// For tests that assert a frequency: only the volume may change, never the file.
export function playGeneratedTone(file) {
  const volume = process.env.SCRB_TEST_TONE_VOLUME;
  return spawn('afplay', [...(volume ? ['-v', volume] : []), file], { stdio: 'ignore' });
}
