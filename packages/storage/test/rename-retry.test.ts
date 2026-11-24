import { describe, expect, it, vi } from 'vitest';
import { renameWithRetry } from '../src/rename-retry.ts';

const failure = (code: string): Error => Object.assign(new Error('x'), { code });

describe('renameWithRetry', () => {
  it('retries a transient Windows lock and then succeeds', async () => {
    const rename = vi
      .fn<(a: string, b: string) => Promise<void>>()
      .mockRejectedValueOnce(failure('EPERM'))
      .mockRejectedValueOnce(failure('EBUSY'))
      .mockResolvedValue(undefined);
    const sleep = vi.fn(() => Promise.resolve());
    await renameWithRetry('a', 'b', rename, sleep);
    expect(rename).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up after a bounded number of attempts', async () => {
    const rename = vi
      .fn<(a: string, b: string) => Promise<void>>()
      .mockRejectedValue(failure('EPERM'));
    await expect(renameWithRetry('a', 'b', rename, () => Promise.resolve())).rejects.toMatchObject({
      code: 'EPERM',
    });
    expect(rename).toHaveBeenCalledTimes(6);
  });

  it('does not retry other errors', async () => {
    const rename = vi
      .fn<(a: string, b: string) => Promise<void>>()
      .mockRejectedValue(failure('ENOENT'));
    await expect(renameWithRetry('a', 'b', rename, () => Promise.resolve())).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(rename).toHaveBeenCalledTimes(1);
  });
});
