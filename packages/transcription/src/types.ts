// Narrow types for this package.  They are mapped to the shared contract later.

export type TrackKind = 'mic' | 'meeting';

/** One saved audio chunk, placed on the meeting timeline. */
export interface AudioChunk {
  path: string;
  startMs: number;
  durationMs: number;
}

export interface TrackInput {
  kind: TrackKind;
  /** A 16 kHz mono WAV ready for the models, or chunks to assemble into one. */
  source: { wavPath: string } | { chunks: AudioChunk[] };
}

export interface Word {
  text: string;
  startMs: number;
  endMs: number;
  /** Mean token probability, 0 to 1. */
  confidence: number;
  track: TrackKind;
  speakerId: string;
}

export interface Turn {
  speakerId: string;
  startMs: number;
  endMs: number;
  text: string;
  /** Index of the first word in `words` and how many follow. */
  firstWord: number;
  wordCount: number;
}

export interface SpeakerSpan {
  startMs: number;
  endMs: number;
  speakerId: string;
}

export interface FinalSpeaker {
  id: string;
  /** "You" for the mic track, otherwise "Speaker N" until a profile names it. */
  label: string;
  speechMs: number;
  /** Unit-length voice embedding; absent when too little clean speech exists. */
  embedding?: number[];
  embeddingSegments: number;
}

export interface FinalTranscript {
  version: 1;
  durationMs: number;
  words: Word[];
  turns: Turn[];
  speakers: FinalSpeaker[];
  /** Offline diarization spans for the meeting track. */
  spans: SpeakerSpan[];
  models: { speech: string; segmentation: string; embedding: string };
  timing: { transcribeMs: number; diarizeMs: number };
}

export type FinalPhase = 'assembling' | 'transcribing' | 'diarizing' | 'done';

export interface Progress<P extends string> {
  phase: P;
  /** 0 to 1 within the phase. */
  fraction: number;
}

/** What the recording side exposes; recording always outranks import work. */
export interface RecordingGuard {
  isRecording(): boolean;
}
