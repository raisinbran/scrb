export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplayInfo {
  id: number;
  workArea: Rect;
}

export interface SavedPlacement {
  x: number;
  y: number;
  displayId: number;
}

/** Gap kept between the default position and the work area's bottom-right corner. */
export const DEFAULT_MARGIN = 16;

/** Bottom-right of the primary display's work area, so it sits clear of the dock or taskbar. */
export function defaultPosition(
  primary: DisplayInfo,
  size: { width: number; height: number },
): { x: number; y: number } {
  const area = primary.workArea;
  return {
    x: area.x + Math.max(0, area.width - size.width - DEFAULT_MARGIN),
    y: area.y + Math.max(0, area.height - size.height - DEFAULT_MARGIN),
  };
}

function contains(area: Rect, x: number, y: number, size: { width: number; height: number }) {
  return (
    x >= area.x &&
    y >= area.y &&
    x + size.width <= area.x + area.width &&
    y + size.height <= area.y + area.height
  );
}

/** The saved spot if the whole window still fits inside the work area of the display it was on. */
export function validPlacement(
  saved: SavedPlacement | null,
  displays: DisplayInfo[],
  size: { width: number; height: number },
): { x: number; y: number } | null {
  if (saved === null) return null;
  const display = displays.find((candidate) => candidate.id === saved.displayId);
  if (display === undefined || !contains(display.workArea, saved.x, saved.y, size)) return null;
  return { x: saved.x, y: saved.y };
}

/** Where to open: the remembered spot when still valid, else the default corner. */
export function choosePosition(
  saved: SavedPlacement | null,
  displays: DisplayInfo[],
  primary: DisplayInfo,
  size: { width: number; height: number },
): { x: number; y: number } {
  return validPlacement(saved, displays, size) ?? defaultPosition(primary, size);
}

export function parsePlacement(text: string): SavedPlacement | null {
  try {
    const value: unknown = JSON.parse(text);
    if (typeof value !== 'object' || value === null) return null;
    const { x, y, displayId } = value as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      typeof displayId !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y)
    ) {
      return null;
    }
    return { x, y, displayId };
  } catch {
    return null;
  }
}

export function serializePlacement(placement: SavedPlacement): string {
  return JSON.stringify(placement);
}
