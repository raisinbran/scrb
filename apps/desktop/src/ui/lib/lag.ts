/**
 * Transcription that is this far behind live is worth mentioning. Shorter delays are normal
 * while the engine batches audio, so showing them only makes the app look like it is in trouble.
 */
export const LAG_NOTICE_MS = 10_000;
