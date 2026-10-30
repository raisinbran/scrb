import type { ExportDocument } from './layout.js';
import { FOOTER_OF, FOOTER_PAGE, MARGIN_INCHES } from './page.js';
import type { PageOptions } from './page.js';
import { renderHtml } from './render-html.js';

/** The subset of Electron's `webContents.printToPDF` options this package sets. */
export interface PdfPrintOptions {
  pageSize: 'Letter' | 'A4';
  printBackground: true;
  displayHeaderFooter: true;
  headerTemplate: string;
  footerTemplate: string;
  margins: { top: number; bottom: number; left: number; right: number };
  generateTaggedPDF: true;
  generateDocumentOutline: true;
}

/**
 * Loads the HTML in a hidden page and prints it. Injected so this package
 * never imports Electron.
 */
export type PrintHtmlToPdf = (html: string, options: PdfPrintOptions) => Promise<Uint8Array>;

const FOOTER_TEMPLATE =
  '<div style="width:100%;text-align:center;font-size:8pt;color:#555;font-family:Arial,sans-serif;">' +
  `${FOOTER_PAGE}<span class="pageNumber"></span>${FOOTER_OF}<span class="totalPages"></span></div>`;

export function pdfPrintOptions(options: PageOptions = {}): PdfPrintOptions {
  return {
    pageSize: options.pageSize ?? 'Letter',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: FOOTER_TEMPLATE,
    margins: {
      top: MARGIN_INCHES,
      bottom: MARGIN_INCHES,
      left: MARGIN_INCHES,
      right: MARGIN_INCHES,
    },
    generateTaggedPDF: true,
    generateDocumentOutline: true,
  };
}

export function renderPdf(
  document: ExportDocument,
  print: PrintHtmlToPdf,
  options: PageOptions = {},
): Promise<Uint8Array> {
  return print(renderHtml(document), pdfPrintOptions(options));
}
