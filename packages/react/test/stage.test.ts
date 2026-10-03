import { describe, expect, it } from 'vitest';
import { canvasFor, textScaleFor } from '../src/MechanismStage';

describe('canvas and text size for the room the stage has', () => {
  it('uses the wide canvas with room, a squarer one in a narrow container and a smaller one on a phone', () => {
    expect(canvasFor(Infinity)).toEqual({ width: 960, height: 540 });
    expect(canvasFor(730)).toEqual({ width: 960, height: 540 });
    expect(canvasFor(619)).toMatchObject({ width: 640, height: 620 });
    expect(canvasFor(420)).toMatchObject({ width: 640, height: 620 });
    expect(canvasFor(364)).toMatchObject({ width: 520, height: 600 });
  });

  it('enlarges unboxed text only as much as needed to stay legible, within bounds', () => {
    // 960 units drawn at 960 px or more: nothing to do.
    expect(textScaleFor(1200)).toBe(1);
    expect(textScaleFor(960)).toBe(1);
    // A 730 px stage draws 11-unit text at 8.4 px: brought back to about 10 px.
    expect(textScaleFor(730) * 11 * 730 / 960).toBeCloseTo(10, 0);
    expect(textScaleFor(364) * 11 * 364 / 520).toBeCloseTo(10, 0);
    // Never more than half as large again, however small the stage.
    expect(textScaleFor(200)).toBe(1.5);
  });
});
