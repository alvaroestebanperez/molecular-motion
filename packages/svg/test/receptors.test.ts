import { describe, expect, it } from 'vitest';
import {
  membraneGeometry, primitiveCss, proteinAnchors, proteinGeometry, renderTransmembranePrimitive, renderVocabularyGlyph,
  transmembraneGeometry, type MembraneOptions,
} from '../src';
import { transmembraneCss } from '../src/primitives';

/** Contact threshold in px, as in the binding tests. */
const TOUCH = 3;
type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const numbers = (value: string) => value.trim().split(/[\s;]+/).map(Number);

/** Head extents of each leaflet, read back from the rendered bilayer (`M{x-r} {y}a…` per head). */
function leaflets(svg: string) {
  const extent = (name: string) => {
    const path = new RegExp(`mm-membrane__leaflet--${name}"[^>]*><path[^>]*/><path class="mm-membrane__heads" d="([^"]+)"`).exec(svg)![1]!;
    const ys = [...path.matchAll(/M[-\d.]+ ([-\d.]+)a/g)].map(match => Number(match[1]));
    return { min: Math.min(...ys) - 4, max: Math.max(...ys) + 4 };
  };
  return { outer: extent('outer'), inner: extent('inner') };
}
/** Every membrane-spanning unit of a card: its seed, spans (outer → inner end), pore and domain anchors. */
function units(svg: string) {
  return [...svg.matchAll(/<g class="mm-primitive mm-primitive--transmembrane[^"]*"([^>]*)>/g)].map(([, attributes]) => {
    const attribute = (name: string) => new RegExp(` data-${name}="([^"]*)"`).exec(attributes!)?.[1];
    const spans = attribute('spans')!.split(';').map(numbers).map(([x0, y0, x1, y1]) => ({ outside: { x: x0!, y: y0! }, inside: { x: x1!, y: y1! } }));
    const anchors = (name: string) => { const v = attribute(name); if (!v) return undefined; const n = numbers(v); return { left: { x: n[0]!, y: n[1]! }, right: { x: n[2]!, y: n[3]! }, top: { x: n[4]!, y: n[5]! }, bottom: { x: n[6]!, y: n[7]! } }; };
    const pore = attribute('pore') && numbers(attribute('pore')!);
    return {
      seed: attribute('visual-seed')!, spans, outside: anchors('outside'), inside: anchors('inside'),
      pore: pore ? { outside: { x: pore[0]!, y: pore[1]! }, inside: { x: pore[2]!, y: pore[3]! }, width: pore[4]! } : undefined,
    };
  });
}
/** A span crosses the bilayer when it starts above the outer heads and ends below the inner heads. */
const crosses = (span: { outside: Point; inside: Point }, bilayer: ReturnType<typeof leaflets>) =>
  span.outside.y < bilayer.outer.min && span.inside.y > bilayer.inner.max;
/** Card actors drawn with renderProteinPrimitive (ligands): id, centre and their anchors in card coordinates. */
function proteins(svg: string) {
  return [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\)" data-actor="([^"]+)" data-radius="([\d.]+)"><g class="mm-primitive mm-primitive--protein[^"]*" data-visual-seed="([^"]+)"/g)]
    .map(([, x, y, id, radius, seed]) => {
      const local = proteinAnchors(proteinGeometry(seed!, Number(radius)), Number(radius));
      const shift = (p: Point) => ({ x: p.x + Number(x), y: p.y + Number(y) });
      return { id: id!, center: shift(local.center), bottom: shift(local.bottom) };
    });
}
/** Ions drawn as single-atom small molecules. */
const ions = (svg: string) => [...svg.matchAll(/data-visual-seed="ion"><g class="mm-molecule__bonds"><\/g><circle[^>]* cx="([-\d.]+)" cy="([-\d.]+)"/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));

describe('transmembrane primitive', () => {
  const membrane: MembraneOptions = { x: 0, y: 100, length: 240 };

  it('reaches past the polar heads of both leaflets, for every pass', () => {
    const geometry = transmembraneGeometry({ visualSeed: 'tm', membrane, passes: 5 });
    const bilayer = membraneGeometry(membrane);
    const top = Math.min(...bilayer.leaflets[0].lipids.map(lipid => lipid.head.y)) - bilayer.headRadius;
    const bottom = Math.max(...bilayer.leaflets[1].lipids.map(lipid => lipid.head.y)) + bilayer.headRadius;
    expect(geometry.spans).toHaveLength(5);
    for (const span of geometry.spans) {
      expect(span.outside.y).toBeLessThan(top);
      expect(span.inside.y).toBeGreaterThan(bottom);
    }
  });

  it('follows the membrane frame on a vertical bilayer', () => {
    const geometry = transmembraneGeometry({ visualSeed: 'tm', membrane: { x: 50, y: 0, length: 200, orientation: 'vertical' } });
    const [span] = geometry.spans;
    expect(span!.outside.y).toBeCloseTo(span!.inside.y, 0);
    expect(Math.abs(span!.outside.x - span!.inside.x)).toBeGreaterThan(30);
  });

  it('keeps an open pore between two walls, and only when asked', () => {
    const channel = transmembraneGeometry({ visualSeed: 'tm', membrane, passes: 6, pore: true, poreWidth: 14 });
    expect(channel.pore).toBeDefined();
    const left = channel.spans.filter(span => span.outside.x < channel.pore!.outside.x);
    const right = channel.spans.filter(span => span.outside.x > channel.pore!.outside.x);
    expect(left).toHaveLength(3); expect(right).toHaveLength(3);
    expect(Math.min(...right.map(span => span.outside.x)) - Math.max(...left.map(span => span.outside.x))).toBeGreaterThanOrEqual(14);
    expect(transmembraneGeometry({ visualSeed: 'tm', membrane, passes: 6 }).pore).toBeUndefined();
  });

  it('mirrors a unit without changing its silhouette', () => {
    const options = { visualSeed: 'tm', membrane, outside: { radius: 20 }, inside: { radius: 18 } };
    const plain = transmembraneGeometry(options); const mirrored = transmembraneGeometry({ ...options, mirror: true });
    expect(mirrored.particles.map(p => [-p.x, p.y, p.rx])).toEqual(plain.particles.map(p => [p.x, p.y, p.rx]));
    expect(mirrored.outsideAnchors!.left.x - plain.origin.x).toBeCloseTo(plain.origin.x - plain.outsideAnchors!.right.x, 0);
  });

  it('is deterministic and carries its own CSS constant', () => {
    const options = { visualSeed: 'tm', membrane, passes: 3, outside: { radius: 20 }, modifications: [{ kind: 'phosphorylation' as const, side: 'inside' as const }] };
    expect(renderTransmembranePrimitive(options)).toBe(renderTransmembranePrimitive(options));
    expect(primitiveCss).toContain(transmembraneCss);
  });
});

describe('receptor cards', () => {
  it('generic receptor: one segment crosses both leaflets, with a ligand touching its outer domain', () => {
    const svg = renderVocabularyGlyph('generic-receptor');
    const bilayer = leaflets(svg); const [receptor, ...others] = units(svg);
    expect(others).toHaveLength(0);
    expect(receptor!.spans).toHaveLength(1);
    expect(crosses(receptor!.spans[0]!, bilayer)).toBe(true);
    const [ligand] = proteins(svg);
    expect(ligand!.center.y).toBeLessThan(bilayer.outer.min);
    expect(distance(ligand!.bottom, receptor!.outside!.top)).toBeLessThanOrEqual(TOUCH);
    expect(svg).not.toContain('<path data-interaction=');
  });

  it('rtk: two spanning copies in contact, phosphorylated on the cytosolic side', () => {
    const svg = renderVocabularyGlyph('rtk');
    const bilayer = leaflets(svg); const [a, b] = units(svg);
    expect(units(svg)).toHaveLength(2);
    expect(a!.seed).toBe(b!.seed);
    for (const unit of [a!, b!]) expect(unit.spans.every(span => crosses(span, bilayer))).toBe(true);
    const gaps = [distance(a!.outside!.right, b!.outside!.left), distance(a!.inside!.right, b!.inside!.left)];
    expect(Math.min(...gaps)).toBeLessThanOrEqual(TOUCH);
    expect(svg).toContain('mm-interaction--contact');
    expect(svg).not.toContain('<path data-interaction=');
    const markers = [...svg.matchAll(/mm-modification--phosphorylation" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)];
    expect(markers).toHaveLength(4);
    // Markers are drawn in each unit's frame (translate(origin)), so local y > reach means the cytosolic side.
    for (const [, , y] of markers) expect(Number(y)).toBeGreaterThan(19.5);
    expect(proteins(svg).filter(p => p.id.startsWith('ligand')).every(p => p.center.y < bilayer.outer.min)).toBe(true);
  });

  it('gpcr: one chain crosses the membrane at least five times', () => {
    const svg = renderVocabularyGlyph('gpcr');
    const bilayer = leaflets(svg); const [receptor] = units(svg);
    expect(receptor!.spans.length).toBeGreaterThanOrEqual(5);
    expect(receptor!.spans.every(span => crosses(span, bilayer))).toBe(true);
    expect(receptor!.pore).toBeUndefined();
  });

  it('ion channel: a pore spans the bilayer and ions are placed along it', () => {
    const svg = renderVocabularyGlyph('ion-channel');
    const bilayer = leaflets(svg); const [channel] = units(svg);
    const pore = channel!.pore!;
    expect(crosses(pore, bilayer)).toBe(true);
    const placed = ions(svg);
    const onAxis = placed.filter(ion => Math.abs(ion.x - pore.outside.x) <= pore.width / 2);
    expect(onAxis.some(ion => ion.y < pore.outside.y)).toBe(true);
    expect(onAxis.some(ion => ion.y > pore.outside.y && ion.y < pore.inside.y)).toBe(true);
    expect(onAxis.some(ion => ion.y > pore.inside.y)).toBe(true);
  });

  it.each(['generic-receptor', 'rtk', 'gpcr', 'ion-channel'])('%s is deterministic', id => {
    expect(renderVocabularyGlyph(id)).toBe(renderVocabularyGlyph(id));
  });
});
