import type { AgendaMeeting, RefFact } from './agenda.js';

/**
 * Invented long meetings with known reference facts, for the dev-only agenda comparison. Fully
 * deterministic from the seed. Nothing here comes from a real meeting, agenda or note.
 */

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ['Ana', 'Ben', 'Cy', 'Dee', 'Eli', 'Fay'];
const PROJECTS = ['Orchard', 'Lantern', 'Harbor', 'Meadow', 'Summit', 'Willow'];
const ITEMS = ['marketing', 'hosting', 'training', 'travel', 'support'];
const MONTHS = ['March', 'April', 'May', 'June', 'September', 'October'];
const DAYS = ['12th', '14th', '17th', '19th', '22nd', '26th', '28th'];
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const CONDS = ['the build is signed off', 'the audit finishes', 'legal approves the terms'];
const PARTS = ['signing certificate', 'test device batch', 'license key', 'review package'];
const ROLES = ['designer', 'analyst', 'recruiter', 'technician'];
const THINGS = ['contractor', 'intern', 'vendor', 'partner'];
const SERVICES = ['hosting', 'payroll', 'printing', 'cleaning'];
const VENDORS = ['Northwind', 'Brightpath', 'Kestrel', 'Overland', 'Tidewater'];
const DOCS = ['signed order form', 'revised statement of work', 'security questionnaire'];
const MOVES = ['office move', 'team offsite', 'warehouse inventory', 'parking change'];

const FILLER = [
  'Thanks for joining everyone, I can hear you fine on my side.',
  'Let me share my screen in a second, bear with me while it loads.',
  'That reminds me of the conversation we had last week about our tooling.',
  'Sorry, I was on mute for a moment there, could you repeat the last part?',
  'I think the team has been working really hard and it shows in the results.',
  'Can everyone see the document I just opened, or is it too small to read?',
  'Good point, I had not thought about it from that angle before today.',
  'We should keep these meetings short, so let me try to stay focused here.',
  'I will put the details in the shared folder after the call finishes today.',
  'Does anyone have any questions about what we just went through so far?',
  'The weather has been terrible this week, so most of us are working from home.',
  'I appreciate everyone taking the time out of their busy schedules for this.',
  'Let me just double check my notes on that, one second while I scroll back.',
  'It is worth mentioning that the last review went better than most of us expected.',
  'Right, that makes sense to me, and I think the others will agree as well.',
  'I will follow up with the wider group by email if there is anything left over.',
  'Just to be clear, this is only a rough view and we can adjust it afterwards.',
  'Yes, I noticed that too when I was reading through the earlier summary notes.',
  'We have covered quite a lot already, so let us keep the momentum going now.',
  'I am not sure I fully understand that, could you give us a little more background?',
  'That is a fair concern and it is something we should keep an eye on over time.',
  'Please feel free to interrupt me if anything I say is unclear to you.',
  'Okay, I think we are in good shape here, so let me move along to the next part.',
  'Honestly I could talk about this for hours, but we have limited time today.',
  'The recording is on, so please remember that everything we say is being captured.',
  'I will hand over to the next person once I have finished this short update.',
  'Great, thank you, that was really helpful and clears up a lot of my confusion.',
  'My connection is a bit unstable, so please let me know if I drop out again.',
  'I wanted to say how much I appreciate the effort that went into preparing this.',
  'Let us not go down that path right now, we can pick it up again later on.',
];

interface Block {
  /** Agenda title, or null for an off-agenda block. */
  title: string | null;
  lines: [string, string][];
  facts: Omit<RefFact, 'topic'>[];
  /** For an off-agenda block, the new-topic title. */
  newTitle?: string;
  /** Core line offset (within the block) of each fact's evidence. */
  at: number[];
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const money = (n: number): string => `$${n.toLocaleString('en-US')}`;

export function synthMeeting(seed: number, targetLines = 215): AgendaMeeting {
  const r = rng(seed);
  const pick = <T>(xs: readonly T[], used: Set<T> = new Set()): T => {
    const free = xs.filter((x) => !used.has(x));
    const v = free[Math.floor(r() * free.length)]!;
    used.add(v);
    return v;
  };
  const who = () => pick(NAMES, new Set());
  const used = new Set<string>();
  const proj = pick(PROJECTS, used);

  const budget = (): Block => {
    const total = (6 + Math.floor(r() * 8)) * 1000;
    const item = pick(ITEMS, used);
    const a = (3 + Math.floor(r() * 3)) * 1000;
    const b = a - 1000;
    return {
      title: `${proj} budget`,
      at: [0, 2],
      lines: [
        [who(), `Next up is the ${proj} budget. The total for the launch is ${money(total)}.`],
        [who(), `${cap(item)} gets ${money(a)} of that.`],
        [who(), `Actually we agreed to cut ${item} to ${money(b)}.`],
      ],
      facts: [
        { kind: 'info', text: `Launch budget is ${money(total)}`, value: money(total) },
        { kind: 'decision', text: `${cap(item)} budget cut to ${money(b)}`, value: money(b) },
      ],
    };
  };
  const schedule = (): Block => {
    const month = pick(MONTHS, used);
    const day = pick(DAYS, used);
    const cond = pick(CONDS, used);
    const part = pick(PARTS, used);
    const day2 = pick(WEEKDAYS, used);
    const owner = who();
    return {
      title: 'Beta schedule',
      at: [0, 1, 2],
      lines: [
        [who(), `Now the beta schedule. The beta goes live on ${month} ${day} if ${cond}.`],
        [who(), `The ${part} might not arrive in time, which is a risk.`],
        [who(), `${owner} will confirm the ${part} status by ${day2}.`],
      ],
      facts: [
        {
          kind: 'date',
          text: `Beta goes live ${month} ${day} if ${cond}`,
          value: `${month} ${day}`,
        },
        { kind: 'caveat', text: `The ${part} might not arrive in time` },
        {
          kind: 'action',
          text: `Confirm ${part} status by ${day2}`,
          owner,
          value: day2,
        },
      ],
    };
  };
  const hiring = (): Block => {
    const role = pick(ROLES, used);
    const thing = pick(THINGS, used);
    const n = 2 + Math.floor(r() * 5);
    return {
      title: 'Hiring',
      at: [0, 1, 2],
      lines: [
        [who(), `On hiring, we have ${n} open roles right now.`],
        [who(), `We decided not to hire a ${role} this quarter.`],
        [who(), `Who will review the ${thing} proposals?`],
      ],
      facts: [
        { kind: 'info', text: `${n} open roles`, value: `${n}` },
        { kind: 'decision', text: `No ${role} will be hired this quarter` },
        { kind: 'question', text: `Who reviews the ${thing} proposals` },
      ],
    };
  };
  const vendor = (): Block => {
    const service = pick(SERVICES, used);
    const v = pick(VENDORS, used);
    const doc = pick(DOCS, used);
    const day = pick(WEEKDAYS, used);
    const owner = who();
    return {
      title: 'Vendors',
      at: [0, 1, 2],
      lines: [
        [who(), `For vendors, we selected ${v} as the ${service} provider.`],
        [who(), `${owner} will send the ${doc} to them by ${day}.`],
        [who(), `${v} might be slow on support, so we should watch that.`],
      ],
      facts: [
        { kind: 'decision', text: `${v} selected as ${service} provider` },
        { kind: 'action', text: `Send the ${doc} by ${day}`, owner, value: day },
        { kind: 'caveat', text: `${v} might be slow on support` },
      ],
    };
  };
  const offAgenda = (): Block => {
    const move = pick(MOVES, used);
    const month = pick(MONTHS, used);
    return {
      title: null,
      at: [1],
      newTitle: cap(move),
      lines: [
        [who(), `We should also discuss the ${move}, which is not on the agenda.`],
        [who(), `The ${move} is planned for ${month}.`],
      ],
      facts: [{ kind: 'date', text: `The ${move} is planned for ${month}`, value: month }],
    };
  };

  const blocks = [budget(), schedule(), hiring(), vendor()];
  for (let i = blocks.length - 1; i > 0; i -= 1) {
    const j = Math.floor(r() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j]!, blocks[i]!];
  }
  const off = offAgenda();
  blocks.splice(1 + Math.floor(r() * 3), 0, off);

  const agendaTitles = blocks.filter((b) => b.title).map((b) => b.title!);
  const idOf = (b: Block): string => (b.title ? `o${agendaTitles.indexOf(b.title) + 1}` : '');

  const core = blocks.flatMap((b) => b.lines);
  const gaps = core.length - 1;
  const per = Math.max(1, Math.ceil((targetLines - core.length) / gaps));
  const lines: { speaker: string; text: string }[] = [];
  const pos: number[] = [];
  core.forEach(([speaker, text], i) => {
    lines.push({ speaker, text });
    pos.push(lines.length);
    if (i === gaps) return;
    const n = Math.max(0, per + Math.floor(r() * 5) - 2);
    for (let k = 0; k < n; k += 1) lines.push({ speaker: who(), text: pick(FILLER) });
  });

  let start = 0;
  const facts: RefFact[] = blocks.flatMap((b) => {
    const s0 = start;
    start += b.lines.length;
    return b.facts.map((f, k) => ({
      ...f,
      topic: b.title ? idOf(b) : b.newTitle!,
      line: pos[s0 + b.at[k]!]!,
    }));
  });
  return {
    agenda: agendaTitles.map((t, i) => `${i + 1}. ${t}`).join('\n'),
    outline: agendaTitles,
    reference: [],
    lines,
    facts,
  };
}
