import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, geometryFrame, interpolateGeometry, nucleicLayerMarkup, renderSvg } from '../src';
import { coordinateMapOf } from '../src/coordinate-map';

/**
 * Drawing an excised interval (ADR 0002), on the documents of RFC 0007: splicing, a V(D)J coding joint,
 * a molecule that begins spliced, and the gene-expression example. Nothing here is specific to any of
 * them: each is drawn from the same projected geometry.
 */
const WIDTH = 960;
const ACTORS = [
  {
    id: 'pre-mrna', type: 'rna', nucleic: { length: 36 },
    sites: [
      { id: 'cut', at: 8 }, { id: 'donor', at: 12 }, { id: 'branch', at: 18 }, { id: 'acceptor', at: 24 },
      { id: 'intron', span: [12, 24] }, { id: 'inside', span: [14, 20] }, { id: 'across', span: [8, 28] }, { id: 'exon2', span: [24, 36] },
    ],
  },
  {
    id: 'locus', type: 'dna', nucleic: { length: 120 },
    sites: [{ id: 'v', span: [10, 40] }, { id: 'intervening', span: [40, 80] }, { id: 'j', span: [80, 110] }, { id: 'heptamer', at: 40 }, { id: 'signal', at: 60 }],
  },
  { id: 'ribosome', type: 'protein', footprint: { length: 8, form: 'single' } },
  { id: 'rag', type: 'protein', footprint: { length: 10, form: 'duplex' } },
];
const mechanism = (steps: ActionNode[][], initial: Record<string, unknown> = {}) => compileMechanism({
  schemaVersion: 6, mechanism: { id: 'x', name: 'X' },
  actors: ACTORS.map(actor => initial[actor.id] ? { ...actor, initial: initial[actor.id] } : actor),
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const scenes = (steps: ActionNode[][], initial?: Record<string, unknown>) => {
  const compiled = mechanism(steps, initial);
  return Array.from({ length: compiled.length }, (_, index) => buildSvgScene(compiled.at(index)));
};
const acidOf = (scene: ReturnType<typeof buildSvgScene>, id: string) => scene.nucleicAcids.find(acid => acid.id === id)!;
const siteOf = (scene: ReturnType<typeof buildSvgScene>, reference: string) => scene.nucleicAcids.flatMap(acid => acid.sites).find(site => site.reference === reference);
const splice: ActionNode = { type: 'excise-interval', target: 'pre-mrna.intron' };
const joint: ActionNode = { type: 'excise-interval', target: 'locus.intervening' };
const show: ActionNode = { type: 'show', actor: 'ribosome' };
/** Every x a path of the molecule's layer is drawn at. */
const drawnXs = (markup: string) => [...markup.matchAll(/[ML](-?[\d.]+) -?[\d.]+/g)].map(match => Number(match[1]));
const PX = WIDTH / 36;

describe('a molecule without excised intervals (ADR 0002 §3.1)', () => {
  it('carries no excision geometry and no junction mark', () => {
    const [scene] = scenes([[{ type: 'cleave', target: 'pre-mrna.cut' }, { type: 'resect', target: 'pre-mrna.cut', length: 4 }]]);
    for (const acid of scene!.nucleicAcids) {
      expect(acid).not.toHaveProperty('excised');
      expect(acid).not.toHaveProperty('phaseX');
      expect(coordinateMapOf(acid, WIDTH).extent).toEqual({ x0: 0, x1: WIDTH });
    }
    const markup = renderSvg(scene!);
    expect(markup).not.toContain('mm-dna__junction');
    expect(markup).not.toContain('mm-dna__closing');
  });

  it('is placed by the linear rule, digit for digit', () => {
    const [scene] = scenes([[show]]);
    expect(siteOf(scene!, 'pre-mrna.across')!.x).toBe(WIDTH * ((8 + 28) / 2) / 36);
    expect(siteOf(scene!, 'locus.signal')!.x).toBe(WIDTH * 60 / 120);
    expect(siteOf(scene!, 'pre-mrna.cut')!.at).toEqual({ from: 8, to: 8 });
  });
});

describe('splicing (RFC 0007 §12.2)', () => {
  const [before, after] = scenes([[show], [splice]]) as [ReturnType<typeof buildSvgScene>, ReturnType<typeof buildSvgScene>];
  const acid = acidOf(after, 'pre-mrna');
  const junction = acid.excised![0]!.x0;

  it('the excised interval takes no width and the molecule is shorter, about its centre', () => {
    expect(acid.excised).toEqual([{ from: 12, to: 24, x0: junction, x1: junction }]);
    expect(junction).toBeCloseTo(WIDTH / 2, 9);
    expect(coordinateMapOf(acid, WIDTH).extent).toEqual({ x0: 6 * PX, x1: WIDTH - 6 * PX });
    expect(acid.length).toBe(36);
  });

  it('the strand is drawn only over extant material, without a gap at the junction', () => {
    const xs = drawnXs(nucleicLayerMarkup(geometryFrame({ ...after, nucleicAcids: [acid], pairings: [] })).acids);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(6 * PX);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIDTH - 6 * PX);
    // Sampled every 3 px: no two consecutive points of the strand are further apart across the junction.
    const sorted = [...new Set(xs)].sort((a, b) => a - b);
    for (let index = 1; index < sorted.length; index += 1) expect(sorted[index]! - sorted[index - 1]!).toBeLessThanOrEqual(3.1);
  });

  it('a site wholly excised is not in the scene; the rest are projected through the same map', () => {
    expect(siteOf(before, 'pre-mrna.branch')).toBeDefined();
    for (const gone of ['branch', 'intron', 'inside']) expect(siteOf(after, `pre-mrna.${gone}`), gone).toBeUndefined();
    // Both boundaries are the junction.
    expect(siteOf(after, 'pre-mrna.donor')!.x).toBe(junction);
    expect(siteOf(after, 'pre-mrna.acceptor')!.x).toBe(junction);
    // A span that straddles is drawn over its extant nucleotides, 8–11 and 24–27: centred on the junction.
    expect(siteOf(after, 'pre-mrna.across')!.x).toBeCloseTo(junction, 9);
    expect(siteOf(after, 'pre-mrna.cut')!.x).toBeCloseTo(junction - 4 * PX, 9);
    expect(siteOf(after, 'pre-mrna.exon2')!.x).toBeCloseTo(junction + 6 * PX, 9);
  });

  it('a lesion on the surviving nucleotide after the interval is drawn at its new place', () => {
    const [scene] = scenes([[{ type: 'damage', target: 'pre-mrna.acceptor' }, splice]]);
    expect(scene!.lesions).toEqual([expect.objectContaining({ target: 'pre-mrna.acceptor', x: junction })]);
  });

  it('an occupant sits on what it covers: a ribosome placed from coordinate 8 is centred on the junction', () => {
    const [scene] = scenes([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.cut' }]]);
    expect(scene!.actors.find(actor => actor.id === 'ribosome')!.x).toBeCloseTo(junction, 6);
    const [upstream] = scenes([[splice, { type: 'occupy', actor: 'ribosome', target: 'pre-mrna.cut', orientation: 'reverse' }]]);
    expect(upstream!.actors.find(actor => actor.id === 'ribosome')!.x).toBeCloseTo(junction - 8 * PX, 6);
  });

  it('describes the excision to assistive technology', () => {
    expect(renderSvg(after)).toContain('12–24 excised, its flanks joined');
  });
});

describe('the junction mark (ADR 0002 §4.3)', () => {
  const [, after] = scenes([[show], [splice]]);
  const mark = (markup: string) => markup.match(/<path class="mm-dna__junction"[^>]*>/g) ?? [];

  it('is one minimal tick per junction, derived from the excised list and styled like nothing else', () => {
    const marks = mark(renderSvg(after!));
    expect(marks).toHaveLength(1);
    expect(marks[0]).toContain('stroke="var(--mm-muted)"');
    expect(marks[0]).toContain('opacity="1"');
    expect(marks[0]).not.toMatch(/mm-lesion|mm-actor|mm-modification|--mm-alert/);
    expect(marks[0]).not.toContain('data-key');
    expect(after!.lesions).toEqual([]);
  });

  it('is absent in thumbnails', () => {
    expect(mark(renderSvg(after!, { compact: true }))).toEqual([]);
  });

  it('gives way to a break at the junction, which is drawn as any break', () => {
    const [scene] = scenes([[splice, { type: 'cleave', target: 'pre-mrna.donor' }]]);
    const markup = renderSvg(scene!);
    expect(mark(markup)).toEqual([]);
    expect(markup).toContain('data-lesion="single-strand-break"');
  });

  it('is drawn on both strands of a duplex', () => {
    const [scene] = scenes([[joint]]);
    expect(mark(renderSvg(scene!))[0]!.match(/M/g)).toHaveLength(2);
  });
});

describe('a V(D)J coding joint (RFC 0007 §12.3)', () => {
  const [, after] = scenes([[show], [joint]]);
  const acid = acidOf(after!, 'locus');
  const px = WIDTH / 120;

  it('closes both strands of the duplex and ends inside the canvas', () => {
    expect(acid.excised).toEqual([{ from: 40, to: 80, x0: WIDTH / 2, x1: WIDTH / 2 }]);
    const xs = drawnXs(nucleicLayerMarkup(geometryFrame({ ...after!, nucleicAcids: [acid], pairings: [] })).acids);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(20 * px);
    expect(Math.max(...xs)).toBeLessThanOrEqual(WIDTH - 20 * px);
  });

  it('keeps V and J at their coordinates and draws them either side of the joint', () => {
    expect(siteOf(after!, 'locus.v')!.x).toBeCloseTo(WIDTH / 2 - 15 * px, 9);
    expect(siteOf(after!, 'locus.j')!.x).toBeCloseTo(WIDTH / 2 + 15 * px, 9);
    expect(siteOf(after!, 'locus.v')!.at).toEqual({ from: 10, to: 40 });
    expect(siteOf(after!, 'locus.signal')).toBeUndefined();
  });

  it('a protein across the joint is centred on it', () => {
    const [scene] = scenes([[joint, { type: 'occupy', actor: 'rag', target: 'locus', span: [35, 85] }]]);
    expect(scene!.actors.find(actor => actor.id === 'rag')!.x).toBeCloseTo(WIDTH / 2, 6);
  });
});

describe('a molecule that begins spliced (RFC 0007 §12.4)', () => {
  const initial = { 'pre-mrna': { nucleic: { excised: [{ from: 4, to: 8 }, { from: 12, to: 24 }, { from: 30, to: 33 }] } } };

  it('is drawn closed from the first step, with one junction per normalised interval, in covalent order', () => {
    const [scene] = scenes([[show]], initial);
    const acid = acidOf(scene!, 'pre-mrna');
    const junctions = acid.excised!.map(stretch => stretch.x0);
    expect(acid.excised!.every(stretch => stretch.x0 === stretch.x1)).toBe(true);
    expect(junctions).toEqual([...junctions].sort((a, b) => a - b));
    expect(new Set(junctions).size).toBe(3);
    const extent = coordinateMapOf(acid, WIDTH).extent;
    expect(extent.x1 - extent.x0).toBeCloseTo((36 - 19) * PX, 9);
    expect((extent.x0 + extent.x1) / 2).toBeCloseTo(WIDTH / 2, 9);
    expect(renderSvg(scene!).match(/mm-dna__junction/g)).toHaveLength(3);
  });

  it('looks the same as a molecule spliced by an action: the scene has no memory of how the state arose', () => {
    const begins = acidOf(scenes([[show]], { 'pre-mrna': { nucleic: { excised: [{ from: 12, to: 24 }] } } })[0]!, 'pre-mrna');
    const spliced = acidOf(scenes([[splice]])[0]!, 'pre-mrna');
    expect(begins).toEqual(spliced);
  });
});

describe('transition geometry (ADR 0002 §5)', () => {
  const [before, after] = scenes([[show], [splice]]);
  const [A, B] = [geometryFrame(before!), geometryFrame(after!)];
  const rna = (frame: typeof A) => frame.nucleicAcids.find(acid => acid.id === 'pre-mrna')!;

  it('starts and ends on the settled steps, value for value', () => {
    expect(interpolateGeometry(A, B, 0)).toBe(A);
    expect(interpolateGeometry(A, B, 1)).toBe(B);
  });

  it('closes the interval continuously: it keeps a share of its width, and the flanks slide together', () => {
    const widths = [.01, .25, .5, .75, .99].map(t => {
      const stretch = rna(interpolateGeometry(A, B, t)).excised![0]!;
      expect(stretch.share).toBeCloseTo(1 - t, 9);
      expect((stretch.x0 + stretch.x1) / 2).toBeCloseTo(WIDTH / 2, 9);
      return stretch.x1 - stretch.x0;
    });
    expect(widths[2]).toBeCloseTo(6 * PX, 9);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    // No jump at either end.
    expect(widths[0]).toBeCloseTo(.99 * 12 * PX, 6);
    expect(widths[4]).toBeCloseTo(.01 * 12 * PX, 6);
  });

  it('keeps extant material in covalent order and draws the closing stretch between its flanks, fading', () => {
    const frame = interpolateGeometry(A, B, .5);
    const map = coordinateMapOf(rna(frame), WIDTH);
    const positions = Array.from({ length: 37 }, (_, coordinate) => map.place(coordinate));
    for (let index = 1; index < positions.length; index += 1) expect(positions[index]!).toBeGreaterThan(positions[index - 1]!);
    const markup = nucleicLayerMarkup(frame).acids;
    expect(markup).toContain('<g class="mm-dna__closing" opacity="0.5">');
    expect(markup).toMatch(/<path class="mm-dna__junction"[^>]*opacity="0.5"/);
  });

  it('moves the sites with the map of each instant', () => {
    const at = (t: number, reference: string) => rna(interpolateGeometry(A, B, t)).sites.find(site => site.reference === reference)!.x;
    expect(at(.5, 'pre-mrna.cut')).toBeCloseTo((siteOf(before!, 'pre-mrna.cut')!.x + siteOf(after!, 'pre-mrna.cut')!.x) / 2, 9);
    expect(at(.5, 'pre-mrna.exon2')).toBeCloseTo((siteOf(before!, 'pre-mrna.exon2')!.x + siteOf(after!, 'pre-mrna.exon2')!.x) / 2, 9);
  });

  it('runs backwards as the same geometry, and resumes from a frame caught in mid-transition', () => {
    const forward = rna(interpolateGeometry(A, B, .3)).excised![0]!;
    const backward = rna(interpolateGeometry(B, A, .7)).excised![0]!;
    expect(backward.share).toBeCloseTo(forward.share!, 9);
    expect(backward.x1 - backward.x0).toBeCloseTo(forward.x1 - forward.x0, 9);
    const caught = interpolateGeometry(A, B, .4);
    const resumed = rna(interpolateGeometry(caught, A, .001)).excised![0]!;
    expect(resumed.share).toBeCloseTo(.6, 2);
    expect(rna(interpolateGeometry(caught, B, .5)).excised![0]!.share).toBeCloseTo(.3, 9);
  });

  it('leaves a molecule with no excision in either frame exactly as it was interpolated before', () => {
    const [plain, resected] = scenes([[show], [{ type: 'cleave', target: 'locus.heptamer', lesion: 'double-strand-break' }, { type: 'resect', target: 'locus.heptamer', length: 20 }]]);
    const frame = interpolateGeometry(geometryFrame(plain!), geometryFrame(resected!), .5);
    for (const acid of frame.nucleicAcids) {
      expect(acid).not.toHaveProperty('excised');
      expect(acid).not.toHaveProperty('phaseX');
    }
    const missing = frame.nucleicAcids.find(acid => acid.id === 'locus')!.missing!;
    for (const range of missing) expect(range).toMatchObject({ x0: range.from * (WIDTH / 120), x1: range.to * (WIDTH / 120) });
  });
});

describe('the gene-expression example', () => {
  const compiled = compileMechanism(parseMechanism(readFileSync(new URL('../../../examples/gene-expression.yaml', import.meta.url), 'utf8')));
  const scene = (step: string) => buildSvgScene(compiled.at(step));

  it('draws the transcript closed after splicing, with the ribosome on the exon–exon junction', () => {
    const spliced = acidOf(scene('splicing'), 'pre-mrna');
    expect(spliced.excised).toHaveLength(1);
    const junction = spliced.excised![0]!.x0;
    expect(scene('ribosome').actors.find(actor => actor.id === 'ribosome')!.x).toBeCloseTo(junction, 6);
    expect(acidOf(scene('splice-sites'), 'pre-mrna')).not.toHaveProperty('excised');
    expect(acidOf(scene('splicing'), 'gene')).not.toHaveProperty('excised');
  });

  it('renders every step, full and compact', () => {
    for (let index = 0; index < compiled.length; index += 1) {
      const built = buildSvgScene(compiled.at(index));
      expect(renderSvg(built).length).toBeGreaterThan(1000);
      expect(renderSvg(built, { compact: true })).not.toContain('mm-dna__junction');
    }
  });
});
