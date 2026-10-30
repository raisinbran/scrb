/** Base class, so the app core can tell storage failures from programming errors. */
export class StorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** A file exists but cannot be parsed or fails validation. It is never overwritten. */
export class CorruptFileError extends StorageError {
  readonly filePath: string;

  constructor(filePath: string, reason: string) {
    super('CORRUPT_FILE', `Unreadable file: ${reason}`);
    this.filePath = filePath;
  }
}

/** A file or index was written by a newer build. It is never downgraded or overwritten. */
export class UnsupportedVersionError extends StorageError {
  readonly found: number;
  readonly supported: number;

  constructor(what: string, found: number, supported: number) {
    super('UNSUPPORTED_VERSION', `${what} is version ${found}; this build reads up to ${supported}`);
    this.found = found;
    this.supported = supported;
  }
}

export class MeetingNotFoundError extends StorageError {
  constructor(meetingId: string) {
    super('MEETING_NOT_FOUND', `No meeting ${meetingId}`);
  }
}

/** A correction selection the rules refuse; the transcript is left unchanged. */
export class CorrectionConflictError extends StorageError {
  readonly conflictingIds: string[];

  constructor(message: string, conflictingIds: string[] = []) {
    super('CORRECTION_CONFLICT', message);
    this.conflictingIds = conflictingIds;
  }
}

/** The caller's copy is older than the file on disk. */
export class StaleRevisionError extends StorageError {
  constructor(expected: number, actual: number) {
    super('STALE_REVISION', `Expected revision ${expected}, file is at ${actual}`);
  }
}

export class UnsafePathError extends StorageError {
  constructor(message: string) {
    super('UNSAFE_PATH', message);
  }
}
