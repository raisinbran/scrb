import type { Block, ExportDocument, Line, Span, SpanStyle, TableBlock } from './layout.js';

const SPAN_TAG: Record<Exclude<SpanStyle, 'plain'>, string> = {
  strong: 'strong',
  muted: 'small',
  corrected: 'ins',
  original: 'del',
};

// Nothing external and no scripts: the page is printed offline, and the CSP
// keeps a stray tag in a transcript from doing anything even if escaping failed.
const HEAD = `<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<style>
body { margin: 0; color: #1a1a1a; background: #fff; font: 10.5pt/1.4 "Segoe UI", -apple-system, "Helvetica Neue", Arial, "Noto Sans", sans-serif; overflow-wrap: anywhere; }
h1, h2, h3, h4 { line-height: 1.2; break-after: avoid; }
h1 { font-size: 22pt; margin: 0 0 8pt; }
h2 { font-size: 16pt; margin: 18pt 0 6pt; }
h3 { font-size: 13pt; margin: 14pt 0 4pt; }
h4 { font-size: 11pt; margin: 10pt 0 3pt; }
h2.new-page { break-before: page; margin-top: 0; }
p { margin: 0 0 6pt; }
p.meta { margin-bottom: 2pt; }
p.note, p.marker { color: #555; font-style: italic; }
p.speaker { margin: 10pt 0 2pt; break-after: avoid; }
ul { margin: 0 0 6pt; padding-inline: 18pt; }
li { margin-bottom: 3pt; }
small { color: #555; font-size: inherit; }
ins { text-decoration: underline; }
del { color: #555; text-decoration: line-through; }
table { width: calc(100% - 1pt); table-layout: fixed; border-collapse: collapse; margin: 0 0 10pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th, td { border: 0.5pt solid #999; padding: 3pt 5pt; text-align: start; vertical-align: top; }
th { background: #eee; }
</style>`;

/** Renders the layout as one self-contained page for Electron's printToPDF. */
export function renderHtml(document: ExportDocument): string {
  const parts = ['<!doctype html>\n<html lang="', escapeHtml(document.locale), '">\n<head>\n', HEAD];
  parts.push('\n<title>', escapeHtml(document.title ?? 'Meeting export'), '</title>\n</head>\n<body>\n');
  for (const block of document.blocks) parts.push(renderBlock(block), '\n');
  parts.push('</body>\n</html>\n');
  return parts.join('');
}

function renderBlock(block: Block): string {
  switch (block.kind) {
    case 'title':
      return element('h1', block.line);
    case 'heading':
      // The document title is the page's h1, so section levels sit one below it.
      return element(`h${block.level + 1}`, block.line, block.newPage ? 'new-page' : undefined);
    case 'paragraph':
      return element('p', block.line, block.role);
    case 'list':
      return `<ul>${block.items.map((item) => element('li', item)).join('')}</ul>`;
    case 'table':
      return renderTable(block);
  }
}

function renderTable(table: TableBlock): string {
  const total = table.columns.reduce((sum, column) => sum + column.weight, 0);
  const cols = table.columns
    .map((column) => `<col style="width:${((column.weight / total) * 100).toFixed(2)}%">`)
    .join('');
  const header = table.columns.map((column) => element('th', column.header)).join('');
  const rows = table.rows.map(
    (row) => `<tr>${row.map((cell) => element('td', cell)).join('')}</tr>`,
  );
  return `<table><colgroup>${cols}</colgroup><thead><tr>${header}</tr></thead><tbody>${rows.join('')}</tbody></table>`;
}

function element(tag: string, line: Line, className?: string): string {
  const cls = className === undefined ? '' : ` class="${className}"`;
  const dir = line.rtl ? ' dir="rtl"' : '';
  return `<${tag}${cls}${dir}>${line.spans.map(renderSpan).join('')}</${tag}>`;
}

function renderSpan(span: Span): string {
  const text = escapeHtml(span.text);
  if (span.style === 'plain') return text;
  const tag = SPAN_TAG[span.style];
  return `<${tag}>${text}</${tag}>`;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
