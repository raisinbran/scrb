import { describe, expect, it } from 'vitest';
import { ContractError, type Backend, type CallName } from '@scrb/contracts';
import { detectMockMode } from './mock-mode.tsx';

/** A real side that answers each listed call with the given error code, and everything else normally. */
const real = (failing: Partial<Record<CallName, 'notImplemented' | 'internal' | 'notFound'>>) =>
  ({
    call: (name: CallName) => {
      const code = failing[name];
      return code ? Promise.reject(new ContractError({ code, message: 'x' })) : Promise.resolve({});
    },
  }) as unknown as Backend;

describe('detectMockMode', () => {
  it('is mock when recording is not set up', async () => {
    expect(await detectMockMode(real({ getRecordingSnapshot: 'notImplemented' }))).toBe(true);
  });
  it('is mock when the final pass is not set up', async () => {
    expect(await detectMockMode(real({ cancelImport: 'notImplemented' }))).toBe(true);
  });
  it('is real when both answer, even with notFound for the unknown import', async () => {
    expect(await detectMockMode(real({ cancelImport: 'notFound' }))).toBe(false);
  });
  it('does not claim mock for other errors', async () => {
    expect(await detectMockMode(real({ getRecordingSnapshot: 'internal' }))).toBe(false);
  });
});
