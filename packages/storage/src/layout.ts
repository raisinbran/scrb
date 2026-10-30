import * as path from 'node:path';
import { UnsafePathError } from './errors.ts';

/** Folder prefix for a meeting being deleted. Finishing such a folder is safe after a crash. */
export const DELETING_PREFIX = '.deleting-';

const MAX_TITLE_CHARS = 80;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[<>:"/\\|?*\x00-\x1f]/g;

/** Every path in the library comes from here, so the layout lives in one place. */
export interface LibraryPaths {
  root: string;
  meetings: string;
  index: string;
  models: string;
  logs: string;
  cache: string;
}

export function libraryPaths(root: string): LibraryPaths {
  return {
    root,
    meetings: path.join(root, 'meetings'),
    index: path.join(root, 'index.sqlite'),
    models: path.join(root, 'models'),
    logs: path.join(root, 'logs'),
    cache: path.join(root, 'cache'),
  };
}

export interface MeetingPaths {
  folder: string;
  meta: string;
  transcript: string;
  summary: string;
  audio: string;
  audioMicrophone: string;
  audioMeeting: string;
  exports: string;
}

export function meetingPaths(folder: string): MeetingPaths {
  return {
    folder,
    meta: path.join(folder, 'meeting.json'),
    transcript: path.join(folder, 'transcript.json'),
    summary: path.join(folder, 'summary.json'),
    audio: path.join(folder, 'audio'),
    audioMicrophone: path.join(folder, 'audio', 'microphone'),
    audioMeeting: path.join(folder, 'audio', 'meeting'),
    exports: path.join(folder, 'exports'),
  };
}

/** Files that derive from a meeting but sit outside its folder, such as waveform peaks. */
export function meetingCachePath(paths: LibraryPaths, meetingId: string): string {
  return path.join(paths.cache, safeSegment(meetingId));
}

/** Rejects anything that could step outside the folder it is joined to. */
export function safeSegment(segment: string): string {
  if (segment === '' || segment === '.' || segment === '..' || /[/\\\0]/.test(segment)) {
    throw new UnsafePathError('Path segment is not a plain name');
  }
  return segment;
}

/** Resolves a folder name from the index, refusing any value that leaves `meetings/`. */
export function meetingFolderPath(paths: LibraryPaths, folderName: string): string {
  return path.join(paths.meetings, safeSegment(folderName));
}

/** `2026-10-28 Project sync`, safe on Windows and macOS. */
export function meetingFolderName(dateIso: string, title: string): string {
  const day = dateIso.slice(0, 10);
  const cleaned = title
    .normalize('NFC')
    .replace(FORBIDDEN_CHARS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const short = Array.from(cleaned).slice(0, MAX_TITLE_CHARS).join('');
  const trimmed = short.replace(/[. ]+$/, '').replace(/^\.+/, '');
  const safe = trimmed === '' || WINDOWS_RESERVED.test(trimmed) ? 'Meeting' : trimmed;
  return `${day} ${safe}`;
}
