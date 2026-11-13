import { describe, expect, it } from 'vitest';
import { ContractError, type Backend } from '@scrb/contracts';
import { detectMockRecording } from './mock-mode.tsx';

const failing = (error: unknown) =>
  ({
    call: () => Promise.reject(error),
  }) as unknown as Backend;

describe('detectMockRecording', () => {
  it('is mock when the real side has no recording', async () => {
    const notImplemented = new ContractError({ code: 'notImplemented', message: 'no' });
    expect(await detectMockRecording(failing(notImplemented))).toBe(true);
  });
  it('is real when the snapshot answers', async () => {
    const real = { call: () => Promise.resolve({}) } as unknown as Backend;
    expect(await detectMockRecording(real)).toBe(false);
  });
  it('does not claim mock for other errors', async () => {
    expect(
      await detectMockRecording(failing(new ContractError({ code: 'internal', message: 'x' }))),
    ).toBe(false);
  });
});
