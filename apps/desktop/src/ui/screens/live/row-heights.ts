const UNLOADED_WORDS = 22;
const AVERAGE_WORD_CHARS = 5;
const CHAR_WIDTH_EM = 0.5;
const LINE_HEIGHT_EM = 1.55;
/** Speaker line plus row padding. Measured height replaces this estimate once a row renders. */
const ROW_CHROME_PX = 34;

export interface RowLayout {
  widthPx: number;
  fontPx: number;
}

/**
 * Row tops for a list whose heights are only known after rendering. Tops are rebuilt lazily from the
 * first changed row, so a change at the tail of a long transcript stays cheap.
 */
export class RowHeights {
  private readonly measured = new Map<string, number>();
  private readonly tops: number[] = [0];
  private validRows = 0;
  private layout: RowLayout = { widthPx: 700, fontPx: 15 };

  constructor(
    private readonly rowAt: (index: number) => { id: string; wordCount: number } | null,
  ) {}

  setLayout(layout: RowLayout): void {
    if (layout.widthPx === this.layout.widthPx && layout.fontPx === this.layout.fontPx) return;
    this.layout = layout;
    this.measured.clear();
    this.invalidateFrom(0);
  }

  invalidateFrom(index: number): void {
    this.validRows = Math.min(this.validRows, index);
  }

  /** Records a rendered height and returns how much it moved the rows below it. */
  measure(index: number, id: string, heightPx: number): number {
    const previous = this.heightOf(index);
    if (Math.abs(previous - heightPx) < 0.5) return 0;
    this.measured.set(id, heightPx);
    this.invalidateFrom(index);
    return heightPx - previous;
  }

  topOf(index: number, rowCount: number): number {
    this.extendTo(Math.min(index, rowCount));
    return this.tops[Math.min(index, rowCount)] as number;
  }

  totalHeight(rowCount: number): number {
    return this.topOf(rowCount, rowCount);
  }

  /** The row containing `y`, clamped to the last row. Returns 0 for an empty list. */
  indexAt(y: number, rowCount: number): number {
    this.extendTo(rowCount);
    let low = 0;
    let high = Math.max(rowCount - 1, 0);
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if ((this.tops[middle] as number) <= y) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  private extendTo(index: number): void {
    while (this.validRows < index) {
      const top = this.tops[this.validRows] as number;
      this.tops[this.validRows + 1] = top + this.heightOf(this.validRows);
      this.validRows += 1;
    }
  }

  private heightOf(index: number): number {
    const row = this.rowAt(index);
    const measured = row && this.measured.get(row.id);
    return measured ?? this.estimateHeight(row?.wordCount ?? UNLOADED_WORDS);
  }

  private estimateHeight(wordCount: number): number {
    const { widthPx, fontPx } = this.layout;
    const charsPerLine = Math.max(widthPx / (fontPx * CHAR_WIDTH_EM), 10);
    const lines = Math.ceil((wordCount * AVERAGE_WORD_CHARS) / charsPerLine);
    return lines * fontPx * LINE_HEIGHT_EM + ROW_CHROME_PX;
  }
}
