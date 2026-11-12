import { existsSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { toolsIn } from '../src/config.js';

export const bin = join(import.meta.dirname, '../.bin');
export const tools = toolsIn(bin);
export const haveFfmpeg = existsSync(tools.ffmpeg);

/**
 * Call once at the top of a test file that needs the real decoder.  A missing
 * decoder fails the run when SCRB_REQUIRE_DECODER=1 (set in CI); otherwise the
 * tests skip and one warning line says so.
 */
export function decoderGuard(file: string): void {
  if (haveFfmpeg) return;
  if (process.env['SCRB_REQUIRE_DECODER'] === '1') {
    it(`${file}: decoder is installed`, () => {
      expect.fail(
        `SCRB_REQUIRE_DECODER=1 but ${tools.ffmpeg} is missing; run npm run build:ffmpeg`,
      );
    });
  } else {
    // Written straight to stderr: Vitest drops console output from a file whose tests all skip.
    writeSync(
      2,
      `\nSKIPPED real-decoder tests in ${file}: no ffmpeg in packages/transcription/.bin (npm run build:ffmpeg)\n`,
    );
  }
}
