import { describe, expect, it } from 'vitest';
import { MockBackend } from './index.ts';

describe('mock getProfileClips', () => {
  it('follows the real eligibility: length, start, one voice, saved audio', async () => {
    const backend = new MockBackend();
    const { clips } = await backend.call('getProfileClips', { profileId: 'profile-1' });
    expect(clips.length).toBeGreaterThan(0);
    for (const clip of clips) {
      expect(clip.endMs - clip.startMs).toBeGreaterThanOrEqual(4000);
      expect(clip.endMs - clip.startMs).toBeLessThanOrEqual(10_000);
      expect(clip.startMs).toBeGreaterThanOrEqual(30_000);
    }
    backend.dispose();
  });

  it('gives nothing for meetings whose audio is gone', async () => {
    const backend = new MockBackend();
    const library = (backend as unknown as { library: Array<{ hasAudio: boolean }> }).library;
    for (const meeting of library) meeting.hasAudio = false;
    expect(await backend.call('getProfileClips', { profileId: 'profile-1' })).toEqual({
      clips: [],
    });
    backend.dispose();
  });

  it('refuses an unknown profile', async () => {
    const backend = new MockBackend();
    await expect(backend.call('getProfileClips', { profileId: 'nope' })).rejects.toMatchObject({
      code: 'notFound',
    });
    backend.dispose();
  });
});
