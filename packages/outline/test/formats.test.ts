import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { trimAgenda } from '../eval/private/agenda.js';
import { docxLines, emlText, pdfText } from '../eval/private/formats.js';
import { discoverFiles, loadPrivateMeeting } from '../eval/private/load.js';

// Invented data only.
const dir = mkdtempSync(join(tmpdir(), 'outline-formats-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function crc32(b: Buffer): number {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** A tiny ZIP writer (deflate) for building a .docx fixture. */
function zip(entries: Record<string, string>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text);
    const packed = deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc32(data), 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, packed);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(packed.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nameBuf.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nameBuf);
    offset += 30 + nameBuf.length + packed.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const para = (t: string, extra = ''): string =>
  `<w:p><w:pPr>${extra}</w:pPr><w:r><w:t xml:space="preserve">${t}</w:t></w:r></w:p>`;
const list = '<w:numPr><w:ilvl w:val="1"/><w:numId w:val="3"/></w:numPr>';
const DOC =
  '<w:document><w:body>' +
  para('Meeting notes', '<w:pStyle w:val="Heading1"/>') +
  para('Budget review', list) +
  para('Spend is up &amp; storage grew', list) +
  '<w:tbl><w:tr><w:tc>' +
  para('Hiring plan') +
  '</w:tc><w:tc>' +
  para('Two engineers needed') +
  para('Start in March') +
  '</w:tc></w:tr></w:tbl>' +
  '</w:body></w:document>';

describe('docxLines', () => {
  it('keeps headings, list items and table cells as separate lines', () => {
    const f = join(dir, 'n.docx');
    writeFileSync(f, zip({ 'word/document.xml': DOC }));
    expect(docxLines(f)).toEqual([
      '# Meeting notes',
      'Budget review',
      'Spend is up & storage grew',
      'Hiring plan',
      'Two engineers needed',
      'Start in March',
    ]);
  });
});

const EML_PLAIN =
  'From: Alex Example <alex@example.test>\r\nTo: team@example.test\r\nSubject: Agenda for Monday\r\n' +
  'MIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n--b1\r\n' +
  'Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n' +
  'Budget review =E2=80=93 spend\r\nHiring plan\r\n\r\n--b1\r\nContent-Type: text/html\r\n\r\n<p>ignored html</p>\r\n--b1--\r\n';

describe('emlText', () => {
  it('returns the plain part, decoded, with no headers or addresses', () => {
    const f = join(dir, 'a.eml');
    writeFileSync(f, EML_PLAIN);
    const t = emlText(f);
    expect(t).toContain('Budget review – spend');
    expect(t).toContain('Hiring plan');
    expect(t).not.toMatch(/example\.test|Subject|From:|ignored/);
  });
  it('falls back to stripped HTML', () => {
    const f = join(dir, 'h.eml');
    writeFileSync(
      f,
      'Subject: x\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<style>p{}</style><div>One &amp; two</div><ul><li>Item a</li><li>Item b</li></ul>',
    );
    expect(emlText(f).split('\n').filter(Boolean)).toEqual(['One & two', 'Item a', 'Item b']);
  });
});

describe('pdfText', () => {
  it('reads the text of a small PDF', async () => {
    const stream = 'BT /F1 12 Tf 50 700 Td (Budget review) Tj 0 -20 Td (Hiring plan) Tj ET';
    const objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ];
    let pdf = '%PDF-1.4\n';
    const offs: number[] = [];
    objs.forEach((o, i) => {
      offs.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const f = join(dir, 'a.pdf');
    writeFileSync(f, pdf);
    const t = await pdfText(f);
    expect(t).toContain('Budget review');
    expect(t).toContain('Hiring plan');
  });
});

describe('trimAgenda', () => {
  const text = [
    'Hi team,',
    'Agenda:',
    '1. Budget review',
    '   a. Cloud spend',
    '2. Hiring plan',
    'Join Zoom Meeting',
    'https://example.test/j/123',
    'When: Monday',
    'Monday March 4 at 10:30 am',
    'Please bring your laptops and any numbers you want to share because we will need them during the review of the budget this week.',
    'Looking forward to a productive session.',
    'Thanks,',
    'Alex Example',
    '4. Never reached item',
  ].join('\n');
  it('keeps the agenda items and drops greeting, links, logistics, dates, prose and everything after the sign-off', () => {
    const r = trimAgenda(text);
    expect(r.text.split('\n')).toEqual(['1. Budget review', '   a. Cloud spend', '2. Hiring plan']);
    expect(r.seen).toBe(12);
    expect(r.kept).toBe(3);
  });
  it('drops one-word lines and an unmarked intro line in a flat agenda too', () => {
    expect(trimAgenda('Agenda\nBudget review\nHiring plan\nSent from my phone').text).toBe(
      'Budget review\nHiring plan',
    );
  });
});

describe('discoverFiles and loading originals', () => {
  const meeting = join(dir, 'm1');
  mkdirSync(meeting);
  writeFileSync(
    join(meeting, 'agenda.eml'),
    EML_PLAIN.replace('Budget review =E2=80=93 spend', '1. Budget review'),
  );
  writeFileSync(join(meeting, 'old.eml'), EML_PLAIN);
  writeFileSync(join(meeting, 'agenda.pdf'), 'x');
  writeFileSync(join(meeting, 'notes.docx'), zip({ 'word/document.xml': DOC }));
  writeFileSync(
    join(meeting, 'talk.md'),
    'Pat: the budget spend and storage grew a lot this quarter and we need to cut costs\nSam: now hiring two engineers starting in march and recruiting begins soon',
  );
  writeFileSync(join(meeting, 'recording.m4a'), 'never read');
  it('picks by fixed priority and counts the other candidates', () => {
    const f = discoverFiles(meeting);
    expect(f.outline?.ext).toBe('.eml');
    expect(f.outline?.file.endsWith('agenda.eml')).toBe(true);
    expect(f.notes?.ext).toBe('.docx');
    expect(f.transcript?.ext).toBe('.md');
    expect(f.ignored).toBe(2);
  });
  it('named files win over originals', () => {
    const m = join(dir, 'm2');
    mkdirSync(m);
    for (const n of [
      'outline.md',
      'final-notes.md',
      'transcript.txt',
      'agenda.eml',
      'x.docx',
      'y.txt',
    ])
      writeFileSync(join(m, n), 'x');
    const f = discoverFiles(m);
    expect([f.outline?.ext, f.notes?.ext, f.transcript?.ext]).toEqual(['.md', '.md', '.txt']);
    expect(f.ignored).toBe(3);
  });
  it('loads an agenda email, a docx and a markdown transcript', async () => {
    const r = await loadPrivateMeeting(meeting);
    if (!r.ok) throw new Error('load');
    expect(r.meeting.items.map((i) => i.text)).toEqual(['Budget review', 'Hiring plan']);
    expect(r.meeting.agenda).toEqual({ seen: 2, kept: 2 });
    expect(r.meeting.bodies[0]).toContain('Spend is up');
  });
});
