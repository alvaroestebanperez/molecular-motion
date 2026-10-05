import { describe, expect, it } from 'vitest';
import { coordinateMap } from '../src/coordinate-map';

/** A 36-nt molecule on a 720-px canvas: 20 px per nucleotide. The intron of the RFC 0007 examples is 12–24. */
const WIDTH = 720;
const LENGTH = 36;
const INTRON = [{ from: 12, to: 24 }];

describe('coordinate-to-render map (ADR 0002 §4)', () => {
  it('without excised intervals is exactly the linear rule the renderer used', () => {
    for (const [width, length] of [[960, 100], [960, 36], [520, 60], [960, 7], [1000, 3]] as const) {
      const map = coordinateMap(width, length);
      for (let coordinate = 0; coordinate <= length; coordinate += 1) {
        expect(map.x(coordinate)).toBe(width * coordinate / length);
        expect(map.place(coordinate)).toBe(width * coordinate / length);
      }
      expect(map.range({ from: 1, to: length - 1 })).toEqual({ x0: width * 1 / length, x1: width * (length - 1) / length });
      expect(map.centre({ from: 1, to: 4 })).toBe(width * ((1 + 4) / 2) / length);
      expect(map.extent).toEqual({ x0: 0, x1: width });
      expect(map.junctions).toEqual([]);
    }
    expect(coordinateMap(960, 100, [])).toMatchObject({ extent: { x0: 0, x1: 960 } });
  });

  it('one excised interval takes no width: its two ends are one point, the junction', () => {
    const map = coordinateMap(WIDTH, LENGTH, INTRON);
    expect(map.x(12)).toBe(map.x(24));
    expect(map.junctions).toEqual([map.x(12)]);
    expect(map.range({ from: 12, to: 24 })).toBeUndefined();
    expect(map.extent.x1 - map.extent.x0).toBe(24 * 20);
  });

  it('keeps a constant width per extant nucleotide, before, after and between junctions', () => {
    const map = coordinateMap(WIDTH, LENGTH, [{ from: 4, to: 8 }, { from: 12, to: 24 }, { from: 30, to: 33 }]);
    const extant = [0, 1, 2, 3, 8, 9, 10, 11, 24, 25, 26, 27, 28, 29, 33, 34, 35];
    for (const nucleotide of extant) expect(map.x(nucleotide + 1)! - map.x(nucleotide)!).toBeCloseTo(WIDTH / LENGTH, 9);
    expect(map.extent.x1 - map.extent.x0).toBeCloseTo(extant.length * WIDTH / LENGTH, 9);
  });

  it('takes any number of normalised intervals, each collapsing to its own junction', () => {
    const map = coordinateMap(WIDTH, LENGTH, [{ from: 4, to: 8 }, { from: 12, to: 24 }, { from: 30, to: 33 }]);
    expect(map.junctions).toHaveLength(3);
    expect(map.junctions).toEqual([map.x(4), map.x(12), map.x(30)]);
    expect(map.x(8)).toBe(map.x(4));
    expect(map.x(33)).toBe(map.x(30));
    expect(map.junctions[0]!).toBeLessThan(map.junctions[1]!);
    expect(map.junctions[1]!).toBeLessThan(map.junctions[2]!);
  });

  it('draws the nucleotides either side of a junction as adjacent as any two neighbours: no visual gap', () => {
    const map = coordinateMap(WIDTH, LENGTH, INTRON);
    // Nucleotide 11 is [11, 12) and nucleotide 24 is [24, 25): the first ends where the second begins.
    expect(map.range({ from: 11, to: 12 })!.x1).toBe(map.range({ from: 24, to: 25 })!.x0);
    expect(map.x(25)! - map.x(11)!).toBeCloseTo(2 * WIDTH / LENGTH, 9);
  });

  it('keeps the centre of the molecule by default: both flanks move inwards by half of what was removed', () => {
    const map = coordinateMap(WIDTH, LENGTH, INTRON);
    expect((map.extent.x0 + map.extent.x1) / 2).toBeCloseTo(WIDTH / 2, 9);
    expect(map.extent).toEqual({ x0: 120, x1: 600 });
    const several = coordinateMap(WIDTH, LENGTH, [{ from: 2, to: 5 }, { from: 20, to: 30 }]);
    expect((several.extent.x0 + several.extent.x1) / 2).toBeCloseTo(WIDTH / 2, 9);
  });

  it('is monotonic over extant material in covalent order, and never reverses it', () => {
    for (const excised of [INTRON, [{ from: 1, to: 2 }], [{ from: 4, to: 8 }, { from: 12, to: 24 }, { from: 30, to: 35 }]]) {
      const map = coordinateMap(WIDTH, LENGTH, excised);
      const inside = (coordinate: number) => excised.some(item => item.from < coordinate && coordinate < item.to);
      const positions = Array.from({ length: LENGTH + 1 }, (_, coordinate) => coordinate).filter(coordinate => !inside(coordinate)).map(coordinate => map.x(coordinate)!);
      for (let index = 1; index < positions.length; index += 1) expect(positions[index]!).toBeGreaterThanOrEqual(positions[index - 1]!);
      // Strictly increasing wherever a nucleotide lies between two boundaries.
      const starts = Array.from({ length: LENGTH }, (_, nucleotide) => nucleotide).filter(nucleotide => !excised.some(item => item.from <= nucleotide && nucleotide < item.to));
      for (const nucleotide of starts) expect(map.x(nucleotide + 1)!).toBeGreaterThan(map.x(nucleotide)!);
    }
  });

  it('gives no drawable position to an authored coordinate inside excised material', () => {
    const map = coordinateMap(WIDTH, LENGTH, INTRON);
    for (let coordinate = 13; coordinate < 24; coordinate += 1) expect(map.x(coordinate)).toBeUndefined();
    expect(map.range({ from: 14, to: 20 })).toBeUndefined();
    expect(map.centre({ from: 14, to: 20 })).toBeUndefined();
    // The boundaries are the junction, and are drawable.
    expect(map.x(12)).toBeDefined();
    expect(map.x(24)).toBeDefined();
  });

  it('projects a span that crosses a junction from its extant portions', () => {
    const map = coordinateMap(WIDTH, LENGTH, INTRON);
    // [8, 28) is nucleotides 8–11 and 24–27: eight nucleotides, drawn as one stretch centred on the junction.
    const drawn = map.range({ from: 8, to: 28 })!;
    expect(drawn.x1 - drawn.x0).toBe(8 * 20);
    expect(map.centre({ from: 8, to: 28 })).toBe(map.junctions[0]);
    expect(drawn).toEqual({ x0: map.x(8), x1: map.x(28) });
    // A span that only reaches into the interval is drawn up to the junction.
    expect(map.range({ from: 10, to: 20 })).toEqual({ x0: map.x(10), x1: map.junctions[0] });
    expect(map.range({ from: 20, to: 26 })).toEqual({ x0: map.junctions[0], x1: map.x(26) });
  });

  it('in a frame of a transition an interval keeps a share of its width, and the map stays continuous', () => {
    const open = coordinateMap(WIDTH, LENGTH, [{ from: 12, to: 24, share: 1 }]);
    for (let coordinate = 0; coordinate <= LENGTH; coordinate += 1) expect(open.x(coordinate)).toBeCloseTo(WIDTH * coordinate / LENGTH, 9);
    const half = coordinateMap(WIDTH, LENGTH, [{ from: 12, to: 24, share: .5 }]);
    expect(half.x(24)! - half.x(12)!).toBeCloseTo(6 * 20, 9);
    expect(half.x(18)).toBeCloseTo(WIDTH / 2, 9);
    expect(half.junctions).toEqual([]);
    expect((half.extent.x0 + half.extent.x1) / 2).toBeCloseTo(WIDTH / 2, 9);
    // Closing is continuous: every position moves in proportion to the share.
    const closed = coordinateMap(WIDTH, LENGTH, INTRON);
    for (const coordinate of [0, 8, 12, 24, 30, 36]) expect(half.place(coordinate)).toBeCloseTo((open.place(coordinate) + closed.place(coordinate)) / 2, 9);
  });
});
