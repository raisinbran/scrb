// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { LiveProgressWatch, requirePhysicalInputs } from '../../scripts/real-live-checks.ts';

describe('physical live evidence checks', () => {
  it.each(['QA_EVIDENCE', 'SCRB_CAPTURE_HELPER', 'SCRB_LIVE_CONFIG'])(
    'rejects missing %s',
    (key) => {
      const env: Record<string, string> = {
        QA_EVIDENCE: 'evidence',
        SCRB_CAPTURE_HELPER: 'helper',
        SCRB_LIVE_CONFIG: 'config',
      };
      delete env[key];
      expect(() => requirePhysicalInputs(env)).toThrow(key);
    },
  );

  it('fails without any live words', () => {
    const watch = new LiveProgressWatch(0, 120_000);
    expect(watch.observe(60_000, []).stalled).toBe(false);
    expect(watch.observe(120_000, []).stalled).toBe(true);
  });

  it('microphone progress cannot hide meeting stalls', () => {
    const watch = new LiveProgressWatch(0, 120_000);
    const meeting = { pass: 'live', track: 'meeting', words: [{ endMs: 1000 }] };
    watch.observe(1000, [meeting]);
    const snapshot = watch.observe(121_000, [
      meeting,
      { pass: 'live', track: 'microphone', words: [{ endMs: 120_000 }] },
    ]);
    expect(snapshot).toMatchObject({
      stalled: true,
      meetingWords: 1,
      micWords: 1,
      lastMeetingMs: 1000,
    });
  });
});
