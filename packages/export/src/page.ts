export type PageSize = 'Letter' | 'A4';

export interface PageOptions {
  /** Defaults to Letter. */
  pageSize?: PageSize;
}

/** Twentieths of a point. One inch is 1440. */
export const PAGE_TWIPS: Record<PageSize, { width: number; height: number }> = {
  Letter: { width: 12240, height: 15840 },
  A4: { width: 11906, height: 16838 },
};

export const MARGIN_INCHES = 1;
export const MARGIN_TWIPS = MARGIN_INCHES * 1440;

export const FOOTER_PAGE = 'Page ';
export const FOOTER_OF = ' of ';
