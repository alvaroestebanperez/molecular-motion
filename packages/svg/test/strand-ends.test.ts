import { describe, expect, it } from 'vitest';
import { compileMechanism } from '@molecular-motion/core';
import { buildSvgScene, geometryFrame, nucleicLayerMarkup } from '../src';

/**
 * The helix is traced a little past both ends of a molecule. A strand that is missing up to an end
 * must be missing past it too, or the rounded tip of that overshoot shows at the canvas edge.
 */
const WIDTH = 960;
const scene = (actor: Record<string, unknown>) => buildSvgScene(compileMechanism({
  schemaVersion: 6, mechanism: { id: 'x', name: 'X' },
  actors: [actor, { id: 'p', type: 'protein' }],
  steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'p' }] }],
}).at(0));
/** Every x the strands of the first molecule are drawn at, front and back. */
const strandXs = (built: ReturnType<typeof buildSvgScene>) => {
  const markup = nucleicLayerMarkup(geometryFrame(built)).acids;
  const paths = [...markup.matchAll(/<g class="mm-dna__(?:back|front)">(.*?)<\/g>/g)].map(match => match[1]!).join('');
  return [...paths.matchAll(/[ML](-?[\d.]+) -?[\d.]+/g)].map(match => Number(match[1]));
};
const missing = (ranges: Array<[string, number, number]>) => ({ nucleic: { missing: ranges.map(([strand, from, to]) => ({ strand, from, to })) } });

describe('a strand missing up to an end of its molecule', () => {
  it('is not drawn past the upper end: a transcript that begins as its first nucleotides', () => {
    const xs = strandXs(scene({ id: 'rna', type: 'rna', nucleic: { length: 36 }, initial: missing([['top', 4, 36]]) }));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIDTH * 4 / 36);
  });

  it('is not drawn past the lower end', () => {
    const xs = strandXs(scene({ id: 'rna', type: 'rna', nucleic: { length: 36 }, initial: missing([['top', 0, 30]]) }));
    expect(xs.length).toBeGreaterThan(0);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(WIDTH * 30 / 36);
  });

  it('is not drawn past either end when it is missing at both', () => {
    const xs = strandXs(scene({ id: 'rna', type: 'rna', nucleic: { length: 36 }, initial: missing([['top', 0, 6], ['top', 30, 36]]) }));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(WIDTH * 6 / 36);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIDTH * 30 / 36);
  });

  it('holds per strand on a duplex: the strand that is whole still runs past the ends, as before', () => {
    const built = scene({ id: 'dna', type: 'dna', nucleic: { length: 60 }, initial: missing([['top', 40, 60], ['bottom', 0, 15]]) });
    const xs = strandXs(built);
    // Bottom reaches the upper end and top the lower one, so the overshoot is still there on those.
    expect(Math.min(...xs)).toBeLessThan(0);
    expect(Math.max(...xs)).toBeGreaterThan(WIDTH);
    // Each strand alone stops at its own gap: nothing of top is drawn after 40, nothing of bottom before 15.
    const acid = built.nucleicAcids[0]!;
    expect(acid.missing).toEqual([{ strand: 'top', from: 40, to: 60, x0: 640, x1: 960 }, { strand: 'bottom', from: 0, to: 15, x0: 0, x1: 240 }]);
  });

  it('leaves a molecule with nothing missing at its ends exactly as it was: traced past both', () => {
    const xs = strandXs(scene({ id: 'dna', type: 'dna', nucleic: { length: 60 }, initial: missing([['top', 20, 30]]) }));
    expect(Math.min(...xs)).toBe(-20);
    expect(Math.max(...xs)).toBeGreaterThan(WIDTH);
  });
});
