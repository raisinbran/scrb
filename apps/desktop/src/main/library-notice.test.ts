import { describe, expect, it } from 'vitest';
import { markSharedNoticeShown, sharedFolderNotice } from './library-notice.ts';

function fakeStore() {
  const values = new Map<string, boolean>();
  return {
    get: (key: string, fallback: boolean) => values.get(key) ?? fallback,
    set: (key: string, value: boolean) => void values.set(key, value),
    delete: (key: string) => void values.delete(key),
  };
}

describe('sharedFolderNotice', () => {
  it('shows until it has been marked seen, then not on later launches', () => {
    const store = fakeStore();
    expect(sharedFolderNotice(store, true)).toMatch(/accessible to other people/);
    expect(sharedFolderNotice(store, true)).not.toBeNull();
    markSharedNoticeShown(store);
    expect(sharedFolderNotice(store, true)).toBeNull();
  });

  it('never shows for a private folder', () => {
    expect(sharedFolderNotice(fakeStore(), false)).toBeNull();
  });

  it('shows again when a private folder later looks shared', () => {
    const store = fakeStore();
    markSharedNoticeShown(store);
    sharedFolderNotice(store, false);
    expect(sharedFolderNotice(store, true)).not.toBeNull();
  });
});
