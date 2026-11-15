import { afterEach, describe, expect, it } from 'vitest';
import type { Backend } from '@scrb/contracts';
import { cachedSources, fetchSources, forgetSources } from './sources-cache.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

function backendWith(devices: Promise<unknown>[]): Backend {
  let call = 0;
  return {
    call: (name: string) =>
      name === 'listInputDevices' ? (devices[call++] as Promise<unknown>) : Promise.resolve([]),
  } as unknown as Backend;
}

afterEach(forgetSources);

describe('sources cache', () => {
  it('keeps the newer list when an older request finishes last', async () => {
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    const backend = backendWith([first.promise, second.promise]);
    const older = fetchSources(backend);
    const newer = fetchSources(backend);
    second.resolve([{ id: 'new' }]);
    await newer;
    first.resolve([{ id: 'old' }]);
    await older;
    expect(cachedSources()?.devices).toEqual([{ id: 'new' }]);
  });

  it('drops an answer that was requested before the lists were forgotten', async () => {
    const slow = deferred<unknown>();
    const pending = fetchSources(backendWith([slow.promise]));
    forgetSources();
    slow.resolve([{ id: 'stale' }]);
    await pending;
    expect(cachedSources()).toBeNull();
  });
});
