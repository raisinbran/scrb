import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type { IParagraphOptions, IRunOptions, ISectionOptions } from 'docx';
import type { Block, ExportDocument, Line, ParagraphBlock, Span, TableBlock } from './layout.js';
import { FOOTER_OF, FOOTER_PAGE, MARGIN_TWIPS, PAGE_TWIPS } from './page.js';
import type { PageOptions } from './page.js';

const FONT = { ascii: 'Arial', hAnsi: 'Arial', cs: 'Arial' };
const MUTED = '555555';
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: '999999' };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
const CELL_MARGINS = { top: 40, bottom: 40, left: 80, right: 80 };

const HEADING_LEVELS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

const SPAN_RUNS: Record<Span['style'], IRunOptions> = {
  plain: {},
  strong: { bold: true },
  muted: { color: MUTED },
  corrected: { underline: {} },
  original: { strike: true, color: MUTED },
};

/** Renders the layout to a true Word file. CPU-bound on long meetings. */
export async function renderDocx(
  document: ExportDocument,
  options: PageOptions = {},
): Promise<Uint8Array> {
  const page = PAGE_TWIPS[options.pageSize ?? 'Letter'];
  const contentWidth = page.width - 2 * MARGIN_TWIPS;

  const section: ISectionOptions = {
    properties: {
      page: {
        size: page,
        margin: {
          top: MARGIN_TWIPS,
          bottom: MARGIN_TWIPS,
          left: MARGIN_TWIPS,
          right: MARGIN_TWIPS,
        },
      },
    },
    footers: { default: pageFooter() },
    children: document.blocks.map((block) => renderBlock(block, contentWidth)).flat(),
  };

  const file = new Document({
    // The library writes "Un-named" unless told otherwise.
    creator: 'Meeting Scribe',
    lastModifiedBy: 'Meeting Scribe',
    title: document.title ?? 'Meeting export',
    styles: {
      default: {
        document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { after: 120, line: 276 } } },
        title: { run: { font: FONT, size: 44, bold: true, color: '1A1A1A' }, paragraph: { spacing: { after: 160 } } },
        heading1: { run: { font: FONT, size: 32, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 360, after: 120 } } },
        heading2: { run: { font: FONT, size: 26, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 280, after: 80 } } },
        heading3: { run: { font: FONT, size: 22, bold: true, color: '1A1A1A' }, paragraph: { spacing: { before: 200, after: 60 } } },
      },
    },
    sections: [section],
  });

  return Packer.toBuffer(file);
}

function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            size: 16,
            color: MUTED,
            children: [FOOTER_PAGE, PageNumber.CURRENT, FOOTER_OF, PageNumber.TOTAL_PAGES],
          }),
        ],
      }),
    ],
  });
}

function renderBlock(block: Block, contentWidth: number): (Paragraph | Table)[] {
  switch (block.kind) {
    case 'title':
      return [paragraph(block.line, { heading: HeadingLevel.TITLE })];
    case 'heading':
      return [
        paragraph(block.line, {
          heading: HEADING_LEVELS[block.level],
          keepNext: true,
          ...(block.newPage ? { pageBreakBefore: true } : {}),
        }),
      ];
    case 'paragraph':
      return [renderParagraph(block)];
    case 'list':
      return block.items.map((item) => paragraph(item, { bullet: { level: 0 } }));
    case 'table':
      return [
        renderTable(block, contentWidth),
        // Word needs a paragraph after a table, and it spaces the next heading.
        new Paragraph({ spacing: { after: 0 } }),
      ];
  }
}

function renderParagraph(block: ParagraphBlock): Paragraph {
  const { line, role } = block;
  switch (role) {
    case 'meta':
      return paragraph(line, { spacing: { after: 40 } });
    case 'speaker':
      return paragraph(line, { keepNext: true, spacing: { before: 200, after: 40 } });
    case 'note':
    case 'marker':
      return paragraph(line, {}, { italics: true, color: MUTED });
    case 'body':
    case 'utterance':
      return paragraph(line);
  }
}

function paragraph(
  line: Line,
  options: IParagraphOptions = {},
  runDefaults: IRunOptions = {},
): Paragraph {
  return new Paragraph({
    ...options,
    ...(line.rtl ? { bidirectional: true } : {}),
    children: line.spans.map((span) => run(span, runDefaults)),
  });
}

function run(span: Span, defaults: IRunOptions): TextRun {
  return new TextRun({
    ...defaults,
    ...SPAN_RUNS[span.style],
    text: span.text,
    ...(span.rtl ? { rightToLeft: true } : {}),
  });
}

function renderTable(table: TableBlock, contentWidth: number): Table {
  const total = table.columns.reduce((sum, column) => sum + column.weight, 0);
  const widths = table.columns.map((column) =>
    Math.floor((column.weight / total) * contentWidth),
  );
  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: table.columns.map((column, index) =>
      cell(column.header, widths[index] ?? 0, true),
    ),
  });
  const rows = table.rows.map(
    (row) =>
      new TableRow({
        cantSplit: true,
        children: row.map((line, index) => cell(line, widths[index] ?? 0, false)),
      }),
  );
  return new Table({
    width: { size: contentWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [header, ...rows],
  });
}

function cell(line: Line, width: number, header: boolean): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    borders: CELL_BORDERS,
    margins: CELL_MARGINS,
    ...(header ? { shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' } } : {}),
    children: [paragraph(line, { spacing: { after: 0 } }, header ? { bold: true } : {})],
  });
}
