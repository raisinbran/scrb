import type { ExportMeeting, ExportSegment, ExportSummary } from '../src/index.js';

// All meetings, people and companies here are invented.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const fullSummary: ExportSummary = {
  brief: [
    'The team agreed to move the Harbor launch by one week so the billing fixes can ship first.',
    'Marisol will confirm the new date with the vendor. Risk & cost stay within the <approved> budget.',
  ],
  full: {
    overview: ['A planning call on the Harbor launch, the billing fixes and vendor timing.'],
    mainTopics: [
      { title: 'Billing fixes', paragraphs: ['Two defects remain open.', 'Both have owners.'] },
      { title: 'Vendor timing', paragraphs: ['The vendor needs ten working days of notice.'] },
    ],
    criticalDecisions: [{ text: 'Launch moves to the week of 14 December.', sourceMs: 12 * MINUTE }],
    projectDevelopments: [{ text: 'The vendor raised its minimum order.', sourceMs: null }],
  },
  openQuestions: [
    { text: 'Who signs the revised vendor order?', sourceMs: 31 * MINUTE + 5000 },
    { text: 'Does the launch need a second review?', sourceMs: null },
  ],
  actionItems: [
    {
      action: 'Confirm the new date with the vendor',
      owner: 'Marisol Quint',
      deadline: 'Friday',
      status: 'Open',
      sourceMs: 14 * MINUTE,
    },
    {
      action: 'Close the rounding defect',
      owner: 'Tomasz',
      ownerUnconfirmed: true,
      deadline: 'End of month',
      deadlineUnconfirmed: true,
      status: null,
      sourceMs: 22 * MINUTE,
    },
    { action: 'Book the review', owner: null, deadline: null, status: null, sourceMs: null },
  ],
  decisions: [
    {
      decision: 'Move the launch one week',
      status: 'decided',
      impactArea: 'schedule',
      sourceMs: 12 * MINUTE,
    },
    {
      decision: 'Use the larger vendor order',
      status: 'tentatively-agreed',
      impactArea: 'cost',
      impactInferred: true,
      sourceMs: 18 * MINUTE,
    },
    { decision: 'Add a second review', status: 'unresolved', impactArea: null, sourceMs: null },
    {
      decision: 'Rebuild the importer',
      status: 'proposed',
      impactArea: 'technical-approach',
      sourceMs: 40 * MINUTE,
    },
  ],
};

export const standardMeeting: ExportMeeting = {
  title: 'Harbor launch planning',
  startedAt: '2026-10-28T17:00:00Z',
  timeZone: 'America/Los_Angeles',
  durationMs: 47 * MINUTE,
  speakers: [
    { id: 's1', name: 'You' },
    { id: 's2', name: 'Marisol Quint' },
    { id: 's3', name: 'Speaker 3' },
  ],
  segments: [
    { speakerId: 's1', startMs: 4000, parts: [{ text: 'Thanks for joining, everyone.' }] },
    {
      speakerId: 's1',
      startMs: 9000,
      parts: [
        { text: 'The ' },
        { text: 'Harbor', original: 'harbour' },
        { text: ' launch is first on the list.' },
      ],
    },
    {
      speakerId: 's2',
      startMs: 15_000,
      parts: [{ text: 'Billing < vendor & "timing" is my worry.' }],
    },
    { speakerId: null, startMs: 21 * MINUTE, parts: [{ text: 'Can you hear me now?' }] },
    { speakerId: 'gone', startMs: 22 * MINUTE, parts: [{ text: 'Yes, go ahead.' }] },
    { speakerId: 's3', startMs: 30 * MINUTE, parts: [{ text: 'Then we are agreed.' }] },
  ],
  markers: [
    { kind: 'pause', startMs: 5 * MINUTE, endMs: 7 * MINUTE },
    { kind: 'gap', startMs: 25 * MINUTE, endMs: 25 * MINUTE + 12_000 },
    { kind: 'recording-ended', startMs: 47 * MINUTE },
  ],
  summary: fullSummary,
};

export const emptyMeeting: ExportMeeting = {
  title: 'Untitled meeting',
  startedAt: '2026-10-29T09:30:00Z',
  timeZone: 'UTC',
  durationMs: 40_000,
  speakers: [],
  segments: [{ speakerId: null, startMs: 0, parts: [{ text: '   ' }] }],
  summary: {
    brief: [],
    full: {
      overview: [],
      mainTopics: [],
      criticalDecisions: [],
      projectDevelopments: [],
    },
    openQuestions: [],
    actionItems: [],
    decisions: [],
  },
};

const longName =
  'Wolfeschlegelsteinhausenbergerdorff-Featherstonehaugh-Cholmondeley-Marjoribanks-Abernathy III';
const unbrokenToken = 'x'.repeat(400);

export const internationalMeeting: ExportMeeting = {
  title: '東京オフィス移転の打ち合わせ / Обсуждение переезда',
  startedAt: '2026-03-02T01:00:00Z',
  timeZone: 'Asia/Tokyo',
  durationMs: 2 * HOUR + 3 * MINUTE,
  speakers: [
    { id: 'a', name: '佐藤 美咲' },
    { id: 'b', name: 'سارة الحربي' },
    { id: 'c', name: longName },
    { id: 'd', name: 'Анна Ковалёва' },
    { id: 'e', name: 'नेहा शर्मा' },
  ],
  segments: [
    { speakerId: 'a', startMs: 1000, parts: [{ text: '来月の移転計画を確認しましょう。' }] },
    {
      speakerId: 'b',
      startMs: 8000,
      parts: [{ text: 'نحتاج إلى تأكيد موعد الانتقال قبل يوم الجمعة 12.' }],
    },
    { speakerId: 'c', startMs: 15_000, parts: [{ text: `Reference ${unbrokenToken} noted.` }] },
    { speakerId: 'd', startMs: 22_000, parts: [{ text: 'Смета готова, бюджет в норме 👍🏽.' }] },
    { speakerId: 'e', startMs: 30_000, parts: [{ text: 'मैं कार्यालय का दौरा करूँगी।' }] },
    {
      speakerId: 'b',
      startMs: 36_000,
      parts: [{ text: 'شالوم', original: 'שלום' }, { text: ' — mixed English and עברית text.' }],
    },
    // Edit-box debris: control characters, a lone surrogate, line breaks, double spaces.
    {
      speakerId: 'a',
      startMs: 44_000,
      parts: [{ text: 'bad\u0000 \u000Bchars\uD83D here\r\nnext  line' }],
    },
  ],
  summary: {
    brief: ['新しいオフィスへの移転は四月に決定しました。', 'تم الاتفاق على موعد الانتقال.'],
    full: {
      overview: ['移転の日程と予算を確認した。'],
      mainTopics: [{ title: 'Бюджет', paragraphs: ['Смета утверждена.'] }],
      criticalDecisions: [{ text: '四月に移転する', sourceMs: 1000 }],
      projectDevelopments: [{ text: 'تأخر المورد أسبوعا', sourceMs: 8000 }],
    },
    openQuestions: [{ text: 'कौन पुष्टि करेगा?', sourceMs: 30_000 }],
    actionItems: [
      {
        action: `Review ${unbrokenToken}`,
        owner: longName,
        deadline: '金曜日',
        status: 'قيد التنفيذ',
        sourceMs: 15_000,
      },
    ],
    decisions: [
      {
        decision: 'الانتقال في أبريل',
        status: 'decided',
        impactArea: 'schedule',
        sourceMs: 8000,
      },
    ],
  },
};

const SENTENCES = [
  'Let me pull up the numbers from last quarter before we go on.',
  'I think the second option is cheaper, but it takes another two weeks.',
  'Could someone share the latest draft with the whole group afterwards?',
  'That matches what the supplier told us on Tuesday.',
  'We should write that down, because it will come up in the review.',
];

/**
 * A meeting of the given hours at the given speaking rate. The defaults, 180
 * words a minute with no silence in 3-second segments, are well above a real
 * 8-hour recording.
 */
export function longMeeting(hours: number, wordsPerMinute = 180, segmentMs = 3000): ExportMeeting {
  const wordsPerSegment = Math.round((wordsPerMinute * segmentMs) / MINUTE);
  const durationMs = hours * HOUR;
  const speakers = Array.from({ length: 8 }, (_, index) => ({
    id: `s${index}`,
    name: `Speaker ${index + 1}`,
  }));

  const segments: ExportSegment[] = [];
  for (let index = 0; index * segmentMs < durationMs; index += 1) {
    const words: string[] = [];
    let sentence = index;
    while (words.length < wordsPerSegment) {
      words.push(...(SENTENCES[sentence % SENTENCES.length] ?? '').split(' '));
      sentence += 1;
    }
    const text = `${index} ${words.slice(0, wordsPerSegment).join(' ')}.`;
    const corrected = index % 50 === 0;
    segments.push({
      speakerId: `s${Math.floor(index / 4) % speakers.length}`,
      startMs: index * segmentMs,
      parts: corrected ? [{ text: 'Harbor', original: 'harbour' }, { text: ` ${text}` }] : [{ text }],
    });
  }

  const summary: ExportSummary = {
    ...fullSummary,
    actionItems: Array.from({ length: 200 }, (_, index) => ({
      action: `Follow up on item ${index}`,
      owner: `Speaker ${(index % 8) + 1}`,
      deadline: null,
      status: 'Open',
      sourceMs: index * MINUTE,
    })),
  };

  return {
    title: `All-day review (${hours} hours)`,
    startedAt: '2026-06-01T15:00:00Z',
    timeZone: 'UTC',
    durationMs,
    speakers,
    segments,
    summary,
  };
}
