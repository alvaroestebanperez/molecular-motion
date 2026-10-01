import { describe, expect, it, vi } from 'vitest';
import { renderCompartmentPrimitive, renderVocabularyGlyph, type CompartmentVisualKind } from '../src';

const CARD = [{ x: 20, y: 15 }, { width: 260, height: 150 }] as const;
const render = (kind: CompartmentVisualKind) => renderCompartmentPrimitive(kind, ...CARD);
const closedMembranes = (svg: string) => svg.match(/mm-membrane--closed/g)?.length ?? 0;
/** Midplane polylines of the closed bilayers wrapped by a group whose class starts with `className`. */
const cores = (svg: string, className: string) => [...svg.matchAll(new RegExp(`class="${className}[^"]*"><g [^>]*><path class="mm-membrane__core" d="M([^"Z]+)Z?"`, 'g'))]
  .map(match => match[1]!.split('L').map(pair => { const [x, y] = pair.split(' ').map(Number); return { x: x!, y: y! }; }));
const meanY = (line: readonly { y: number }[]) => line.reduce((sum, p) => sum + p.y, 0) / line.length;
const distance = (a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]) =>
  Math.min(...a.map(p => Math.min(...b.map(q => Math.hypot(p.x - q.x, p.y - q.y)))));
/** Membrane midplanes in these tests are in the bilayer's native units, where it is 2 × 15.5 thick. */
const BILAYER = 31;

describe('compartment identity', () => {
  it('nucleus: a double envelope of two closed bilayers, pores and a nucleolus', () => {
    const svg = render('nucleus');
    expect(closedMembranes(svg)).toBe(2);
    expect(svg).toContain('mm-compartment__envelope--outer');
    expect(svg).toContain('mm-compartment__envelope--inner');
    expect(svg.match(/mm-compartment__nucleolus/g)).toHaveLength(1);
    expect(svg.match(/class="mm-compartment__pore"/g)).toHaveLength(6);
  });

  it('mitochondrion: a closed outer bilayer around a closed inner bilayer folded into cristae', () => {
    const svg = render('mitochondrion');
    expect(closedMembranes(svg)).toBe(2);
    const [inner] = cores(svg, 'mm-compartment__inner-membrane');
    // A plain ellipse crosses its long axis twice; every crista folds across it twice more.
    const axis = 75 / .4; let crossings = 0;
    inner!.forEach((p, i) => { const q = inner![(i + 1) % inner!.length]!; if (Math.sign(p.y - axis) !== Math.sign(q.y - axis)) crossings++; });
    expect(svg).toContain('data-cristae="4"');
    expect(crossings).toBeGreaterThanOrEqual(2 + 4 * 2);
  });

  it('golgi: a stack of closed cisternae with vesicles only on the trans face', () => {
    const svg = render('golgi');
    const cisternae = cores(svg, 'mm-compartment__cisterna'); const vesicles = cores(svg, 'mm-compartment__vesicle');
    expect(cisternae).toHaveLength(4);
    expect(svg).toContain('data-cisternae="4"');
    expect(svg).toContain('mm-compartment__cisterna--cis');
    expect(svg).toContain('mm-compartment__cisterna--trans');
    expect(vesicles.length).toBeGreaterThan(0);
    // Ordered stack: cis on top, trans below, vesicles beyond the trans face.
    const order = cisternae.map(meanY);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    for (const vesicle of vesicles) expect(meanY(vesicle)).toBeGreaterThan(order[order.length - 1]!);
  });

  it('ER: one boundary pierced by separate fenestrae, so the lumen is a connected tubular network', () => {
    const svg = render('er');
    const [boundary] = cores(svg, 'mm-compartment__er-boundary'); const holes = cores(svg, 'mm-compartment__fenestra');
    expect(boundary).toBeDefined();
    expect(holes.length).toBeGreaterThanOrEqual(4);
    expect(closedMembranes(svg)).toBe(1 + holes.length);
    // Holes never touch each other or the boundary: there is lumen between every pair of membranes.
    for (const [i, hole] of holes.entries()) {
      expect(distance(hole, boundary!)).toBeGreaterThan(BILAYER);
      for (const other of holes.slice(i + 1)) expect(distance(hole, other)).toBeGreaterThan(BILAYER);
    }
  });

  it('lysosome: a single vesicle with lumen content; endosome: a budding vesicle with cargo instead', () => {
    const lysosome = render('lysosome'); const endosome = render('endosome');
    expect(closedMembranes(lysosome)).toBe(1);
    expect(Number(/mm-compartment__content" data-particles="(\d+)"/.exec(lysosome)?.[1])).toBeGreaterThanOrEqual(8);
    expect(lysosome).not.toContain('mm-compartment__cargo');
    expect(closedMembranes(endosome)).toBe(1);
    expect(endosome).toContain('mm-compartment__bud');
    expect(endosome.match(/class="mm-compartment__cargo"/g)!.length).toBeGreaterThan(0);
    expect(endosome).not.toContain('mm-compartment__content');
  });

  it('generic organelle: exactly one closed membrane and nothing else', () => {
    const svg = render('organelle');
    expect(closedMembranes(svg)).toBe(1);
    expect(svg).not.toMatch(/nucleolus|pore|content|cargo|cristae|cisterna|fenestra/);
  });

  it('extracellular and cytoplasm differ by environment and contain no membranes', () => {
    const extracellular = render('extracellular'); const cytoplasm = render('cytoplasm');
    for (const svg of [extracellular, cytoplasm]) expect(svg).not.toContain('mm-primitive--membrane');
    expect(extracellular).toContain('mm-compartment__fibres');
    expect(extracellular).not.toContain('mm-compartment__solutes');
    expect(cytoplasm).toContain('mm-compartment__solutes');
    expect(cytoplasm).not.toContain('mm-compartment__fibres');
    expect(Number(/data-filaments="(\d+)"/.exec(cytoplasm)?.[1])).toBeLessThanOrEqual(2);
  });

  it('reuses the membrane primitive bilayer for every membrane-bounded compartment', () => {
    for (const kind of ['nucleus', 'organelle', 'er', 'golgi', 'mitochondrion', 'lysosome', 'endosome'] as const) {
      const svg = render(kind);
      expect(svg).toContain('mm-membrane__leaflet--outer');
      expect(svg).toContain('mm-membrane__leaflet--inner');
    }
  });

  it('keeps the original call signature and renders deterministically', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    expect(renderCompartmentPrimitive('mitochondrion')).toContain('mm-compartment--mitochondrion');
    for (const kind of ['extracellular', 'cytoplasm', 'nucleus', 'organelle', 'er', 'golgi', 'mitochondrion', 'lysosome', 'endosome'] as const) {
      expect(render(kind)).toBe(render(kind));
    }
    expect(renderVocabularyGlyph('nucleus')).toBe(renderVocabularyGlyph('nucleus'));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
