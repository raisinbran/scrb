import { describe, expect, it } from 'vitest';
import {
  choosePosition,
  defaultPosition,
  parsePlacement,
  serializePlacement,
  validPlacement,
  type DisplayInfo,
} from './mini-placement.ts';

const size = { width: 264, height: 100 };
const primary: DisplayInfo = { id: 1, workArea: { x: 0, y: 25, width: 1440, height: 850 } };
const second: DisplayInfo = { id: 2, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } };

describe('mini window placement', () => {
  it('defaults to the primary work area bottom-right with a margin', () => {
    expect(defaultPosition(primary, size)).toEqual({ x: 1440 - 264 - 16, y: 25 + 850 - 100 - 16 });
  });

  it('keeps a saved position that is fully on its display', () => {
    const saved = { x: 1500, y: 100, displayId: 2 };
    expect(validPlacement(saved, [primary, second], size)).toEqual({ x: 1500, y: 100 });
  });

  it('rejects a position whose display is gone', () => {
    expect(validPlacement({ x: 1500, y: 100, displayId: 2 }, [primary], size)).toBeNull();
  });

  it('rejects a position that is off the display or partly outside it', () => {
    expect(validPlacement({ x: 5000, y: 100, displayId: 1 }, [primary], size)).toBeNull();
    expect(validPlacement({ x: 1300, y: 100, displayId: 1 }, [primary], size)).toBeNull();
  });

  it('falls back to the default when nothing valid is saved', () => {
    expect(choosePosition(null, [primary], primary, size)).toEqual(defaultPosition(primary, size));
    expect(choosePosition({ x: -9999, y: 0, displayId: 1 }, [primary], primary, size)).toEqual(
      defaultPosition(primary, size),
    );
  });

  it('round-trips and rejects bad files', () => {
    const saved = { x: 10, y: 40, displayId: 1 };
    expect(parsePlacement(serializePlacement(saved))).toEqual(saved);
    expect(parsePlacement('not json')).toBeNull();
    expect(parsePlacement('{"x":1,"y":"2","displayId":1}')).toBeNull();
    expect(parsePlacement('null')).toBeNull();
  });
});
