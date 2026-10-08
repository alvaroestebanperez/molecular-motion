import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, geometryFrame, interpolateGeometry, nucleicLayerMarkup, pairingGeometry, type GeometryFrame } from '../src';

/**
 * An end of a strand drawn beside its partner that goes on along its own row in one step and ends beside
 * the partner in the other moves between those two places (ADR 0001 §4.3). The case here is the double
 * Holliday junction between `second-synthesis` and `ligation`, but nothing below asks what happened: the
 * frames are read from two resolved states.
 */
const mechanism = compileMechanism(parseMechanism(readFileSync(new URL('../../core/test/fixtures/v7/double-holliday-junction.yaml', import.meta.url), 'utf8')));
const frame = (step: string) => geometryFrame(buildSvgScene(mechanism.at(step)));
const [open, sealed] = [frame('second-synthesis'), frame('ligation')];
const markup = (item: GeometryFrame) => JSON.stringify(nucleicLayerMarkup(item, 'p'));
/** The 3′ end of each strand of `dna` drawn beside the sister: where it is drawn. */
const tips = (item: GeometryFrame) => Object.fromEntries(item.pairings.flatMap(pairing => pairing.segments).filter(segment => segment.traveller.acid === 'dna').map(segment => {
  const { points } = pairingGeometry(item, segment, segment.travel)!;
  return [segment.traveller.strand, segment.traveller.strand === 'top' ? points.at(-1)! : points[0]!];
}));
const away = (item: GeometryFrame) => item.nucleicAcids.find(acid => acid.id === 'dna')!.away!;

describe('a strand end between its place beside the partner and its own row', () => {
  it('the two settled steps are what they were: an end beside the sister, and an end back on its row', () => {
    expect(away(open).map(range => range.continues)).toEqual([[true, false], [false, true]]);
    expect(away(sealed).map(range => range.continues)).toEqual([[true, true], [true, true]]);
    // The share of a ramp is a matter of frames only: a settled step never carries one.
    for (const item of [open, sealed]) expect(away(item).every(range => !('returns' in range))).toBe(true);
    for (const strand of ['top', 'bottom']) expect(Math.abs(tips(open)[strand]!.y - tips(sealed)[strand]!.y)).toBeGreaterThan(80);
    expect(interpolateGeometry(open, sealed, 0)).toBe(open);
    expect(interpolateGeometry(open, sealed, 1)).toBe(sealed);
  });

  it.each([['sealing', open, sealed], ['opening', sealed, open]] as const)('%s: moves in a straight line from one to the other', (_name, from, to) => {
    const [start, end] = [tips(from), tips(to)];
    let previous = start;
    for (const t of [.1, .25, .5, .75, .9]) {
      const now = tips(interpolateGeometry(from, to, t));
      for (const strand of ['top', 'bottom']) {
        expect(now[strand]!.x).toBeCloseTo(start[strand]!.x + (end[strand]!.x - start[strand]!.x) * t, 6);
        expect(now[strand]!.y).toBeCloseTo(start[strand]!.y + (end[strand]!.y - start[strand]!.y) * t, 6);
        // Always on its way: never back, never there at once.
        expect(Math.abs(now[strand]!.y - end[strand]!.y)).toBeLessThan(Math.abs(previous[strand]!.y - end[strand]!.y));
      }
      previous = now;
    }
  });

  it('does not jump at either end of the transition', () => {
    const [first, last] = [interpolateGeometry(open, sealed, 1e-6), interpolateGeometry(open, sealed, 1 - 1e-6)];
    for (const strand of ['top', 'bottom']) {
      expect(Math.abs(tips(first)[strand]!.y - tips(open)[strand]!.y)).toBeLessThan(.01);
      expect(Math.abs(tips(last)[strand]!.y - tips(sealed)[strand]!.y)).toBeLessThan(.01);
    }
    // What is drawn just before the end is what a clean render of the step draws.
    expect(markup(last)).toBe(markup(sealed));
    expect(markup(interpolateGeometry(open, sealed, .5))).not.toBe(markup(sealed));
    expect(markup(interpolateGeometry(open, sealed, .5))).not.toBe(markup(open));
  });

  it('interrupted, the next transition starts from the frame that was drawn, in either direction', () => {
    const shown = interpolateGeometry(open, sealed, .4);
    for (const destination of [open, sealed]) {
      expect(interpolateGeometry(shown, destination, 0)).toBe(shown);
      const next = tips(interpolateGeometry(shown, destination, 1e-6));
      const half = tips(interpolateGeometry(shown, destination, .5));
      for (const strand of ['top', 'bottom']) {
        expect(Math.abs(next[strand]!.y - tips(shown)[strand]!.y)).toBeLessThan(.01);
        expect(half[strand]!.y).toBeCloseTo((tips(shown)[strand]!.y + tips(destination)[strand]!.y) / 2, 6);
      }
      expect(interpolateGeometry(shown, destination, 1)).toBe(destination);
    }
  });

  it('only the end that changes moves: the other end of each stretch, and the sister, stay as they are', () => {
    const midway = interpolateGeometry(open, sealed, .5);
    expect(away(midway).map(range => range.returns)).toEqual([[undefined, .5], [.5, undefined]]);
    const other = (item: GeometryFrame) => item.pairings.flatMap(pairing => pairing.segments).map(segment => { const { points } = pairingGeometry(item, segment, segment.travel)!; return segment.traveller.strand === 'top' ? points[0]! : points.at(-1)!; });
    expect(other(midway)).toEqual(other(open));
    expect(other(midway)).toEqual(other(sealed));
    const sister = (item: GeometryFrame) => JSON.stringify(item.nucleicAcids.find(acid => acid.id === 'sister'));
    expect(sister(midway)).toBe(sister(sealed));
  });

  it('leaves an end that a join claims to the cross-fade (ADR 0004 §6)', () => {
    const [nicked, resolved] = [frame('nicking'), frame('resolution')];
    for (const [from, to] of [[nicked, resolved], [resolved, nicked]]) for (const t of [.25, .5, .75]) {
      const item = interpolateGeometry(from!, to!, t);
      for (const range of item.nucleicAcids.flatMap(acid => acid.away ?? [])) {
        for (const end of [0, 1] as const) if (range.joined?.[end]) expect(range.returns?.[end]).toBeUndefined();
      }
      expect(item.joins!.every(join => join.share === (to === resolved ? t : 1 - t))).toBe(true);
    }
  });

  it('takes part in no other transition between neighbouring steps of the fixture', () => {
    const moving: string[] = [];
    for (let index = 1; index < mechanism.length; index += 1) {
      const [before, after] = [index - 1, index].map(step => geometryFrame(buildSvgScene(mechanism.at(step))));
      if (interpolateGeometry(before!, after!, .5).nucleicAcids.some(acid => (acid.away ?? []).some(range => range.returns))) moving.push(mechanism.at(index).step.id);
    }
    expect(moving).toEqual(['ligation']);
  });
});
