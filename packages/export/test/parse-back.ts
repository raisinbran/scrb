import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes } from 'parse5';

/**
 * Both outputs are read back into this one shape with real parsers, so the
 * comparison sees what a reader sees and not what the renderers meant to write.
 */
export type ParsedBlock = ParsedText | { type: 'table'; rows: string[][]; headerRows: number };

export interface ParsedText {
  type: 'title' | 'h1' | 'h2' | 'h3' | 'p' | 'li';
  spans: ParsedSpan[];
  rtl: boolean;
}

export interface ParsedSpan {
  text: string;
  mark: 'none' | 'strong' | 'ins' | 'del';
}

// ---- DOCX ----

type XmlNode = Record<string, unknown>;

const xml = new XMLParser({
  ignoreAttributes: false,
  preserveOrder: true,
  trimValues: false,
  processEntities: { enabled: true, maxTotalExpansions: Number.MAX_SAFE_INTEGER, maxExpandedLength: Number.MAX_SAFE_INTEGER },
  htmlEntities: false,
  parseTagValue: false,
});

export function docxParts(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  return Object.fromEntries(
    Object.entries(files).map(([name, data]) => [name, strFromU8(data)]),
  );
}

export function parseDocx(bytes: Uint8Array): ParsedBlock[] {
  const source = docxParts(bytes)['word/document.xml'];
  if (source === undefined) throw new Error('No word/document.xml in the file');
  const valid = XMLValidator.validate(source);
  if (valid !== true) throw new Error(`Malformed document.xml: ${valid.err.msg}`);

  const document = child(xml.parse(source) as XmlNode[], 'w:document');
  const body = child(document, 'w:body');
  const blocks: ParsedBlock[] = [];
  for (const node of body) {
    if ('w:tbl' in node) blocks.push(docxTable(kids(node, 'w:tbl')));
    else if ('w:p' in node) {
      const block = docxParagraph(kids(node, 'w:p'));
      // The empty spacer the renderer leaves after each table is not content.
      if (block.spans.length > 0) blocks.push(block);
    }
  }
  return blocks;
}

function docxParagraph(nodes: XmlNode[]): ParsedText {
  const props = optionalChild(nodes, 'w:pPr') ?? [];
  const style = attr(props.find((node) => 'w:pStyle' in node), 'w:val');
  const type: ParsedText['type'] =
    style === 'Title'
      ? 'title'
      : style === 'Heading1'
        ? 'h1'
        : style === 'Heading2'
          ? 'h2'
          : style === 'Heading3'
            ? 'h3'
            : props.some((node) => 'w:numPr' in node)
              ? 'li'
              : 'p';
  const spans: ParsedSpan[] = [];
  for (const node of nodes) {
    if (!('w:r' in node)) continue;
    const run = kids(node, 'w:r');
    const runProps = optionalChild(run, 'w:rPr') ?? [];
    const text = run
      .filter((item) => 'w:t' in item)
      .map((item) => kids(item, 'w:t').map(textOf).join(''))
      .join('');
    pushParsed(spans, text, docxMark(runProps));
  }
  return { type, spans, rtl: props.some((node) => 'w:bidi' in node) };
}

function docxMark(props: XmlNode[]): ParsedSpan['mark'] {
  if (props.some((node) => 'w:strike' in node)) return 'del';
  if (props.some((node) => 'w:u' in node)) return 'ins';
  if (props.some((node) => 'w:b' in node)) return 'strong';
  return 'none';
}

function docxTable(nodes: XmlNode[]): ParsedBlock {
  const rows = nodes.filter((node) => 'w:tr' in node).map((node) => kids(node, 'w:tr'));
  return {
    type: 'table',
    headerRows: rows.filter((row) =>
      (optionalChild(row, 'w:trPr') ?? []).some((node) => 'w:tblHeader' in node),
    ).length,
    rows: rows.map((row) =>
      row
        .filter((node) => 'w:tc' in node)
        .map((node) =>
          kids(node, 'w:tc')
            .filter((item) => 'w:p' in item)
            .map((item) => plain(docxParagraph(kids(item, 'w:p')).spans))
            .join(' '),
        ),
    ),
  };
}

function kids(node: XmlNode, name: string): XmlNode[] {
  return (node[name] ?? []) as XmlNode[];
}

function child(nodes: XmlNode[], name: string): XmlNode[] {
  const found = optionalChild(nodes, name);
  if (found === undefined) throw new Error(`Missing <${name}>`);
  return found;
}

function optionalChild(nodes: XmlNode[], name: string): XmlNode[] | undefined {
  const node = nodes.find((item) => name in item);
  return node === undefined ? undefined : kids(node, name);
}

function attr(node: XmlNode | undefined, name: string): string | undefined {
  const attrs = node?.[':@'] as Record<string, string> | undefined;
  return attrs?.[`@_${name}`];
}

function textOf(node: XmlNode): string {
  return typeof node['#text'] === 'string' ? node['#text'] : '';
}

// ---- HTML ----

type HtmlNode = DefaultTreeAdapterTypes.ChildNode;
type HtmlElement = DefaultTreeAdapterTypes.Element;

export function parseHtml(html: string): ParsedBlock[] {
  const root = parse(html);
  const page = root.childNodes.find((node) => node.nodeName === 'html') as HtmlElement;
  const body = page.childNodes.find((node) => node.nodeName === 'body') as HtmlElement;

  const blocks: ParsedBlock[] = [];
  for (const node of body.childNodes) {
    if (!isElement(node)) continue;
    switch (node.tagName) {
      case 'h1':
        blocks.push(htmlParagraph('title', node));
        break;
      case 'h2':
      case 'h3':
      case 'h4':
        blocks.push(htmlParagraph(`h${Number(node.tagName[1]) - 1}` as ParsedText['type'], node));
        break;
      case 'p':
        blocks.push(htmlParagraph('p', node));
        break;
      case 'ul':
        for (const item of elements(node)) blocks.push(htmlParagraph('li', item));
        break;
      case 'table':
        blocks.push(htmlTable(node));
        break;
      default:
        throw new Error(`Unexpected <${node.tagName}> in export body`);
    }
  }
  return blocks;
}

function htmlParagraph(type: ParsedText['type'], node: HtmlElement): ParsedBlock {
  const spans: ParsedSpan[] = [];
  for (const item of node.childNodes) {
    if (isElement(item)) pushParsed(spans, textContent(item), htmlMark(item.tagName));
    else pushParsed(spans, textContent(item), 'none');
  }
  const rtl = node.attrs.some((attribute) => attribute.name === 'dir' && attribute.value === 'rtl');
  return { type, spans, rtl };
}

function htmlMark(tag: string): ParsedSpan['mark'] {
  if (tag === 'strong') return 'strong';
  if (tag === 'ins') return 'ins';
  if (tag === 'del') return 'del';
  return 'none';
}

function htmlTable(node: HtmlElement): ParsedBlock {
  const sections = elements(node);
  const head = sections.find((item) => item.tagName === 'thead');
  const body = sections.find((item) => item.tagName === 'tbody');
  const rows = [...elements(head), ...elements(body)];
  return {
    type: 'table',
    headerRows: elements(head).length,
    rows: rows.map((row) => elements(row).map(textContent)),
  };
}

function elements(node: HtmlElement | undefined): HtmlElement[] {
  return node === undefined ? [] : node.childNodes.filter(isElement);
}

function isElement(node: HtmlNode): node is HtmlElement {
  return 'tagName' in node;
}

function textContent(node: HtmlNode): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterTypes.TextNode).value;
  return isElement(node) ? node.childNodes.map(textContent).join('') : '';
}

// ---- Shared ----

function pushParsed(spans: ParsedSpan[], text: string, mark: ParsedSpan['mark']): void {
  if (text === '') return;
  const last = spans.at(-1);
  if (last?.mark === mark) last.text += text;
  else spans.push({ text, mark });
}

export function plain(spans: ParsedSpan[]): string {
  return spans.map((span) => span.text).join('');
}

/** Every piece of text in reading order, for coverage checks. */
export function allText(blocks: ParsedBlock[]): string {
  return blocks
    .map((block) =>
      block.type === 'table' ? block.rows.flat().join('\n') : plain(block.spans),
    )
    .join('\n');
}
