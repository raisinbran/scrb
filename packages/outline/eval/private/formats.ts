import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Readers for the owner's real formats. Dev-only, local; they return text and never keep headers or addresses. */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};
function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1]!.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Minimal ZIP reader: one entry by name (stored or deflated). */
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65_557); i -= 1)
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return null;
  let p = zip.readUInt32LE(eocd + 16);
  const count = zip.readUInt16LE(eocd + 10);
  for (let n = 0; n < count && zip.readUInt32LE(p) === 0x02014b50; n += 1) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extra = zip.readUInt16LE(p + 30);
    const comment = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const entry = zip.toString('utf8', p + 46, p + 46 + nameLen);
    if (entry === name) {
      const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
      const data = zip.subarray(start, start + size);
      if (method === 0) return Buffer.from(data);
      if (method === 8) return inflateRawSync(data);
      return null;
    }
    p += 46 + nameLen + extra + comment;
  }
  return null;
}

/**
 * Lines of a .docx: one line per paragraph, in document order. Table cells are walked in order, so a
 * row's topic cell and notes cell give separate lines. Heading styles get a "# " prefix. List items
 * (bulleted or numbered) stay plain lines on purpose: in Word, agenda topics are list paragraphs at any
 * level, and a "- " prefix would hide them from the heading match. The matcher still needs all of an
 * item's content words in a short line, so body points rarely match.
 */
export function docxLines(file: string): string[] {
  const zip = readFileSync(file);
  const xml = readZipEntry(zip, 'word/document.xml')?.toString('utf8');
  if (!xml) return [];
  const lines: string[] = [];
  for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const p = m[0];
    const text = decodeEntities(
      [...p.matchAll(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g)]
        .map((t) => (t[0].startsWith('<w:t') ? t[1]! : ' '))
        .join(''),
    )
      .replace(/\s+/g, ' ')
      .trim();
    if (!text) continue;
    const style = /<w:pStyle w:val="([^"]*)"/.exec(p)?.[1] ?? '';
    const heading = /^(?:Heading|Title)/i.test(style);
    lines.push(heading ? `# ${text}` : text);
  }
  return lines;
}

function decodeBody(body: string, encoding: string, charset: string): string {
  let bytes: Buffer;
  const enc = encoding.trim().toLowerCase();
  if (enc === 'base64') bytes = Buffer.from(body.replace(/\s+/g, ''), 'base64');
  else if (enc === 'quoted-printable') {
    const raw = body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    bytes = Buffer.from(raw, 'latin1');
  } else bytes = Buffer.from(body, 'utf8');
  try {
    return new TextDecoder(charset || 'utf-8').decode(bytes);
  } catch {
    return bytes.toString('utf8');
  }
}

function splitHeaders(part: string): { headers: Map<string, string>; body: string } {
  const m = /\r?\n\r?\n/.exec(part);
  const head = m ? part.slice(0, m.index) : part;
  const body = m ? part.slice(m.index + m[0].length) : '';
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) headers.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
  }
  return { headers, body };
}

export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, '')
      .replace(/<\s*br\s*\/?>|<\/(p|div|li|tr|h[1-6]|table|ul|ol)>/gi, '\n')
      .replace(/<li[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .join('\n');
}

function bestText(part: string): { plain: string | null; html: string | null } {
  const { headers, body } = splitHeaders(part);
  const type = (headers.get('content-type') ?? 'text/plain').toLowerCase();
  const boundary = /boundary="?([^";]+)"?/i.exec(headers.get('content-type') ?? '')?.[1];
  if (type.startsWith('multipart/') && boundary) {
    let plain: string | null = null;
    let html: string | null = null;
    for (const sub of body.split(`--${boundary}`).slice(1)) {
      if (sub.startsWith('--')) break;
      const r = bestText(sub.replace(/^\r?\n/, ''));
      plain ??= r.plain;
      html ??= r.html;
    }
    return { plain, html };
  }
  if ((headers.get('content-disposition') ?? '').toLowerCase().startsWith('attachment'))
    return { plain: null, html: null };
  const charset = /charset="?([^";\s]+)"?/i.exec(headers.get('content-type') ?? '')?.[1] ?? 'utf-8';
  const text = decodeBody(body, headers.get('content-transfer-encoding') ?? '7bit', charset);
  if (type.startsWith('text/html')) return { plain: null, html: text };
  if (type.startsWith('text/plain')) return { plain: text, html: null };
  return { plain: null, html: null };
}

/** Body text of an .eml: the plain part, else the HTML part stripped. Headers are never returned. */
export function emlText(file: string): string {
  const r = bestText(readFileSync(file, 'utf8'));
  if (r.plain && r.plain.trim()) return r.plain;
  return r.html ? htmlToText(r.html) : '';
}

export async function pdfText(file: string): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(readFileSync(file)));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
