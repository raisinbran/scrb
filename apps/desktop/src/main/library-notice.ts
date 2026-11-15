const SHARED_NOTICE_KEY = 'privacy.sharedFolderNoticeShown';

const SHARED_NOTICE =
  'The library folder may be accessible to other people who use this device. Review its folder permissions if it contains sensitive recordings.';

/** The slice of the library's settings store this needs. */
interface NoticeStore {
  get(key: string, fallback: boolean): boolean;
  set(key: string, value: boolean): void;
  delete(key: string): void;
}

/**
 * The shared-folder notice is shown once per library folder (the flag lives in the folder's own
 * settings, so a new folder asks again). It is shown again if the folder stops looking shared and
 * later looks shared once more. Checking does not record anything: call `markSharedNoticeShown`
 * once the person has actually seen it, so a launch that stops early does not lose the notice.
 */
export function sharedFolderNotice(store: NoticeStore, mayBeShared: boolean): string | null {
  if (!mayBeShared) {
    store.delete(SHARED_NOTICE_KEY);
    return null;
  }
  return store.get(SHARED_NOTICE_KEY, false) ? null : SHARED_NOTICE;
}

export function markSharedNoticeShown(store: NoticeStore): void {
  store.set(SHARED_NOTICE_KEY, true);
}
