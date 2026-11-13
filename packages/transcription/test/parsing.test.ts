import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseProbe, wavHeader } from '../src/audio.js';
import { oggCrc } from '../src/ogg.js';
import { assemble, buildTurns, decideSpeakers, dropRoomEcho } from '../src/finalPass.js';
import { checkProbe, decodeArgs, parseChunkList } from '../src/importFile.js';
import { HINTED_MAX_CONTEXT, parseVadSegments, parseWords, wholeFileArgs } from '../src/whisper.js';
import type { Word } from '../src/types.js';

describe('whisper settings', () => {
  it('uses the proven final-pass settings', () => {
    const args = wholeFileArgs('a.wav', 'out', { model: 'm', vadModel: 'v' });
    expect(args.join(' ')).toContain('--vad --vad-model v -mc 0');
    expect(args).toContain('-sow');
    expect(args).not.toContain('--carry-initial-prompt');
  });

  it('carries a vocabulary hint across segments with a bounded text context', () => {
    const args = wholeFileArgs('a.wav', 'out', { model: 'm', vadModel: 'v', prompt: 'Scrb' });
    expect(args).toEqual(expect.arrayContaining(['--prompt', 'Scrb', '--carry-initial-prompt']));
    expect(HINTED_MAX_CONTEXT).toBe(128);
    expect(args[args.indexOf('-mc') + 1]).toBe('128');
    expect(args.join(' ')).not.toContain('-mc 0');
    expect(args.filter((x) => x === '-mc')).toHaveLength(1);
  });

  it('parses words and drops sound tags and special tokens', () => {
    const json = JSON.stringify({
      transcription: [
        {
          offsets: { from: 100, to: 400 },
          text: ' Hello',
          tokens: [
            { text: ' Hello', p: 0.8 },
            { text: '[_TT_20]', p: 0 },
          ],
        },
        { offsets: { from: 500, to: 900 }, text: ' [BLANK_AUDIO]', tokens: [] },
        { offsets: { from: 900, to: 950 }, text: ' ', tokens: [] },
      ],
    });
    expect(parseWords(json)).toEqual([
      { text: 'Hello', startMs: 100, endMs: 400, confidence: 0.8 },
    ]);
  });

  it('reads VAD centiseconds as milliseconds', () => {
    expect(parseVadSegments('Speech segment 0: start = 29.00, end = 320.50\n')).toEqual([
      { startMs: 290, endMs: 3205 },
    ]);
  });
});

describe('import checks', () => {
  const base = { durationMs: 1000, channels: 1, sampleRate: 44100, hasVideo: false };
  const check = (formatName: string, audioCodec: string | null, hasVideo = false): string | null =>
    checkProbe({ ...base, formatName, audioCodec, hasVideo });

  it('accepts each required format', () => {
    expect(check('wav', 'pcm_s16le')).toBeNull();
    expect(check('mp3', 'mp3')).toBeNull();
    expect(check('mov,mp4,m4a,3gp,3g2,mj2', 'aac')).toBeNull();
    expect(check('mov,mp4,m4a,3gp,3g2,mj2', 'alac')).toBeNull();
    expect(check('flac', 'flac')).toBeNull();
    expect(check('ogg', 'opus')).toBeNull();
  });

  it('rejects video, silence of streams and other codecs', () => {
    expect(check('mov,mp4,m4a,3gp,3g2,mj2', 'aac', true)).toBe('video_not_accepted');
    expect(check('mov,mp4,m4a,3gp,3g2,mj2', null)).toBe('no_audio');
    expect(check('ogg', 'vorbis')).toBe('unsupported_format');
    expect(check('matroska,webm', 'opus')).toBe('unsupported_format');
  });

  it('treats cover art as audio-only', () => {
    const info = parseProbe(
      JSON.stringify({
        format: { format_name: 'mp3', duration: '1.5' },
        streams: [
          { codec_type: 'audio', codec_name: 'mp3', channels: 2, sample_rate: '44100' },
          { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
        ],
      }),
    );
    expect(info.hasVideo).toBe(false);
    expect(info.durationMs).toBe(1500);
    expect(info.channels).toBe(2);
  });

  it('downmixes to mono and writes 5 s Opus chunks', () => {
    const args = decodeArgs('in.mp3', 'dir', 'l.csv', 'm.wav').join(' ');
    expect(args).toContain('-ac 1 -ar 48000 -c:a libopus -b:a 32k');
    expect(args).toContain('-segment_time 5');
    expect(args).toContain('-ac 1 -ar 16000 -c:a pcm_s16le m.wav');
  });

  it('reads the chunk list', () => {
    expect(
      parseChunkList('000000.opus,0.000000,5.000000\n000001.opus,5.000000,7.5\n', '/d'),
    ).toEqual([
      { path: join('/d', '000000.opus'), startMs: 0, durationMs: 5000 },
      { path: join('/d', '000001.opus'), startMs: 5000, durationMs: 2500 },
    ]);
  });
});

describe('audio helpers', () => {
  it('writes a 16 kHz mono PCM header', () => {
    const h = wavHeader(32000);
    expect(h.length).toBe(44);
    expect(h.readUInt32LE(24)).toBe(16000);
    expect(h.readUInt16LE(22)).toBe(1);
    expect(h.readUInt32LE(40)).toBe(32000);
  });
});

describe('final-pass assembly', () => {
  const w = (text: string, startMs: number, speakerId: string): Word => ({
    text,
    startMs,
    endMs: startMs + 300,
    confidence: 1,
    track: 'meeting',
    speakerId,
  });

  it('builds turns on speaker change and long gaps', () => {
    const words = [w('a', 0, 's1'), w('b', 400, 's1'), w('c', 800, 's2'), w('d', 5000, 's2')];
    expect(buildTurns(words).map((t) => [t.speakerId, t.text, t.firstWord, t.wordCount])).toEqual([
      ['s1', 'a b', 0, 2],
      ['s2', 'c', 2, 1],
      ['s2', 'd', 3, 1],
    ]);
  });

  it('keeps a mic that hears the room from splitting the meeting into one-word turns', () => {
    const say = (text: string, startMs: number) => ({
      text,
      startMs,
      endMs: startMs + 300,
      confidence: 1,
    });
    const meeting = ['hello', 'everybody', 'this', 'is', 'the', 'plan'].map((t, i) =>
      say(t, i * 400),
    );
    const mic = ['Right,', 'so', 'I', 'think', 'we', 'agree'].map((t, i) => say(t, i * 400 + 150));
    const out = assemble(
      [
        { kind: 'meeting', wavPath: 'm.wav', words: meeting },
        { kind: 'mic', wavPath: 'y.wav', words: mic },
      ],
      [{ startMs: 0, endMs: 3000, speakerId: 'speaker-1' }],
      [{ id: 'speaker-1', label: 'Speaker 1', speechMs: 3000, embeddingSegments: 0 }],
    );
    expect(out.turns.map((t) => [t.speakerId, t.wordCount])).toEqual([
      ['speaker-1', 6],
      ['you', 6],
    ]);
    for (const t of out.turns) {
      const slice = out.words.slice(t.firstWord, t.firstWord + t.wordCount);
      expect(slice.every((x) => x.speakerId === t.speakerId)).toBe(true);
    }
    expect(out.durationMs).toBe(3000);
  });

  it("drops mic words that echo the meeting but keeps the user's own speech", () => {
    const at = (text: string, startMs: number) => ({ text, startMs });
    const meeting = [at('Now,', 0), at("they're", 400), at('just', 800), at('yeah', 5000)];
    const mic = [
      at('now', 300),
      at("they're", 700),
      at('just', 1100),
      at('um', 3000),
      at('yeah', 5200),
      at('my', 9000),
      at('turn', 9400),
    ];
    expect(dropRoomEcho(mic, meeting).map((w) => w.text)).toEqual(['um', 'yeah', 'my', 'turn']);
  });

  it('removes the echoed mic words from the assembled transcript', () => {
    const say = (text: string, startMs: number) => ({
      text,
      startMs,
      endMs: startMs + 300,
      confidence: 1,
    });
    const out = assemble(
      [
        { kind: 'meeting', wavPath: 'm.wav', words: [say('hello', 0), say('everybody', 400)] },
        { kind: 'mic', wavPath: 'y.wav', words: [say('Hello', 200), say('everybody', 600)] },
      ],
      [{ startMs: 0, endMs: 1000, speakerId: 'speaker-1' }],
      [{ id: 'speaker-1', label: 'Speaker 1', speechMs: 1000, embeddingSegments: 0 }],
    );
    expect(out.words.map((w) => w.track)).toEqual(['meeting', 'meeting']);
    expect(out.speakers.map((x) => x.id)).toEqual(['speaker-1']);
  });

  it('relabels raw clusters and gives each final speaker a voice', () => {
    const raw = [
      { start: 0, end: 100, speaker: 0 },
      { start: 100, end: 300, speaker: 1 },
      { start: 300, end: 400, speaker: 2 },
    ];
    const embedded = [
      { segment: raw[0]!, vector: [1, 0] },
      { segment: raw[1]!, vector: [0, 1] },
      { segment: raw[2]!, vector: [1, 0.05] },
    ];
    const { spans, speakers } = decideSpeakers(raw, embedded);
    expect(speakers.map((s) => s.label)).toEqual(['Speaker 1', 'Speaker 2']);
    expect(spans.map((s) => s.speakerId)).toEqual(['speaker-1', 'speaker-2', 'speaker-1']);
    expect(speakers[0]?.embeddingSegments).toBe(2);
  });
});

describe('oggCrc', () => {
  it('matches the known Ogg checksum', () => {
    expect(oggCrc(new TextEncoder().encode('123456789'))).toBe(0x89a1897f);
  });
});
