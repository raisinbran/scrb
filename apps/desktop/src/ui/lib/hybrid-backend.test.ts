import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractError, type Backend } from '@scrb/contracts';
import { createHybridBackend } from './hybrid-backend.ts';
import { MockBackend } from '../mocks/index.ts';

describe('createHybridBackend', () => {
  let mock: MockBackend;

  beforeEach(() => {
    window.localStorage.clear();
    mock = new MockBackend();
  });

  const realReturning = async () => {
    const settings = {
      ...(await mock.call('getSettings')),
      theme: 'dark' as const,
      location: { country: 'US', usState: 'IL' },
    };
    return { call: vi.fn(async () => settings), on: vi.fn() } as unknown as Backend;
  };

  it('sends settings to the real backend and copies them to the mock', async () => {
    const real = await realReturning();
    const backend = createHybridBackend(real, mock);
    expect((await backend.call('getSettings')).theme).toBe('dark');
    expect((await mock.call('getSettings')).location.usState).toBe('IL');
  });

  it('leaves other calls on the mock', async () => {
    const real = await realReturning();
    await createHybridBackend(real, mock).call('listTerms');
    expect(real.call).not.toHaveBeenCalledWith('listTerms', undefined);
  });

  it('brings the mock up to date before any other call', async () => {
    const real = await realReturning();
    const status = await createHybridBackend(real, mock).call('getSetupStatus');
    expect(status.locationSet).toBe(true);
    expect((await mock.call('getSettings')).location.usState).toBe('IL');
  });

  it('falls back to the mock when the library did not open', async () => {
    const failure = new ContractError({ code: 'notImplemented', message: 'No.' });
    const real = {
      call: vi.fn(async () => {
        throw failure;
      }),
      on: vi.fn(),
    } as unknown as Backend;
    const settings = await createHybridBackend(real, mock).call('updateSettings', {
      theme: 'dark',
    });
    expect(settings.theme).toBe('dark');
  });

  it('passes a real failure on to the caller', async () => {
    const real = {
      call: vi.fn(async () => {
        throw new ContractError({ code: 'diskFull', message: 'Disk full.' });
      }),
      on: vi.fn(),
    } as unknown as Backend;
    await expect(createHybridBackend(real, mock).call('getSettings')).rejects.toThrow('Disk full.');
  });
});
