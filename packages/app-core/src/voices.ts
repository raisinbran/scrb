import { YOU_ID, type FinalTranscript } from '@scrb/transcription';
import { errorFields, type Library, type VoiceEntry } from '@scrb/storage';
import {
  APPROVED_EMBEDDING_SHA256,
  APPROVED_PROFILE_MODEL,
  hashModel,
} from './profile-matching.ts';

/**
 * Keeps every speaker's voice from a finished pass in the meeting folder (`voices.json`), but
 * only when the meeting opted in and the embedding model is the approved one. Optional: any
 * failure is logged and the pass carries on. Call before the transcript is applied, so the
 * speaker-contribution repair that follows sees the new file. A re-run replaces the file.
 */
export async function saveFinalVoices(
  library: Library,
  meetingId: string,
  transcript: FinalTranscript,
  modelPath: string | undefined,
  fingerprint: (path: string) => Promise<string> = hashModel,
): Promise<void> {
  try {
    const qualifies =
      (await library.getMeeting(meetingId)).buildVoiceProfiles &&
      modelPath !== undefined &&
      (await fingerprint(modelPath)) === APPROVED_EMBEDDING_SHA256;
    if (!qualifies) {
      // A re-run replaces the old file, so a pass that no longer qualifies must not leave it.
      await library.deleteVoices(meetingId);
      return;
    }
    const speakers: VoiceEntry[] = transcript.speakers.flatMap((voice) => {
      const vector = voice.embedding ?? [];
      const norm = Math.hypot(...vector);
      if (
        voice.id === YOU_ID ||
        vector.length === 0 ||
        !(norm > 0) ||
        !Number.isFinite(norm) ||
        !Number.isInteger(voice.embeddingSegments) ||
        voice.embeddingSegments < 1
      ) {
        return [];
      }
      return [
        {
          speakerId: voice.id,
          embedding: Float32Array.from(vector, (value) => value / norm),
          segments: voice.embeddingSegments,
        },
      ];
    });
    await library.saveVoices(meetingId, { modelId: APPROVED_PROFILE_MODEL, speakers });
  } catch (error) {
    library.logger.log('warn', 'voices-not-saved', errorFields(error));
  }
}
