import { describe, expect, it } from 'vitest';
import {
  cleanTitle,
  excerptOf,
  generateTitle,
  type LlmClient,
  type LlmRequest,
} from '../src/index.js';

// Invented meeting.
const transcript = {
  lines: [
    { startSec: 0, speaker: 'Sam', text: 'Let us review the quarterly budget numbers.' },
    { startSec: 12, speaker: 'Ana', text: 'Travel spending is over budget this quarter.' },
  ],
};

const fake = (replies: string[]): LlmClient & { requests: LlmRequest[] } => {
  const requests: LlmRequest[] = [];
  return {
    modelName: 'fake',
    requests,
    complete: async (request) => {
      requests.push(request);
      return {
        content: replies[Math.min(requests.length - 1, replies.length - 1)]!,
        finishReason: 'stop',
        promptTokens: 1,
        completionTokens: 1,
      };
    },
  };
};
const reply = (title: string) => JSON.stringify({ title });

describe('cleanTitle', () => {
  it.each([
    ['"Quarterly Budget Review."', 'Quarterly Budget Review'],
    ['Title: **Budget Review**!', 'Budget Review'],
    ['20261113 Budget Review', 'Budget Review'],
    ['  Budget\n  Review —', 'Budget Review'],
    [
      'one two three four five six seven eight nine ten eleven twelve',
      'one two three four five six seven eight nine ten',
    ],
  ])('%j -> %j', (raw, expected) => {
    expect(cleanTitle(raw)).toBe(expected);
  });

  it('caps the length at a word boundary', () => {
    const title = cleanTitle('Extraordinarily '.repeat(8))!;
    expect(title.length).toBeLessThanOrEqual(60);
    expect(title.endsWith(' ')).toBe(false);
  });

  it.each(['', '   ', '...', 'Meeting', 'untitled', '"Meeting Summary"'])('rejects %j', (raw) => {
    expect(cleanTitle(raw)).toBeNull();
  });
});

describe('generateTitle', () => {
  it('returns a clean title grounded in the transcript', async () => {
    const llm = fake([reply('"Quarterly Budget Review."')]);
    expect(await generateTitle(transcript, llm)).toBe('Quarterly Budget Review');
    expect(llm.requests[0]?.messages[1]?.content).toContain('quarterly budget numbers');
  });

  it('drops a title that shares nothing with the transcript', async () => {
    expect(await generateTitle(transcript, fake([reply('Zeppelin Launch Strategy')]))).toBeNull();
  });

  it('returns null for an empty transcript without calling the model', async () => {
    const llm = fake([reply('Anything')]);
    expect(await generateTitle({ lines: [] }, llm)).toBeNull();
    expect(llm.requests).toHaveLength(0);
  });

  it('returns null when the model output is unusable twice', async () => {
    expect(await generateTitle(transcript, fake(['not json']))).toBeNull();
  });

  it('returns null for a generic answer', async () => {
    expect(await generateTitle(transcript, fake([reply('Meeting')]))).toBeNull();
  });
});

describe('excerptOf', () => {
  it('keeps a short transcript whole and samples a long one end to end', () => {
    expect(excerptOf(transcript).split('\n')).toHaveLength(2);
    const long = {
      lines: Array.from({ length: 2000 }, (_, i) => ({
        startSec: i,
        speaker: 'Sam',
        text: `line number ${i} about the budget`,
      })),
    };
    const out = excerptOf(long);
    expect(out.length).toBeLessThanOrEqual(8000);
    expect(out).toContain('line number 0 ');
    expect(out.split('\n').length).toBeGreaterThan(20);
  });
});
