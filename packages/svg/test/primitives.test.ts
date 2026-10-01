import { describe, expect, it, vi } from 'vitest';
import {
  primitiveCss, proteinGeometry, renderCompartmentPrimitive, renderInteractionPrimitive,
  nascentStrandGeometry, renderMembranePrimitive, renderModificationPrimitive, renderNucleicAcidPrimitive,
  renderProteinPrimitive, renderVocabularyGlyph, membraneGeometry, type MembraneGeometry, type MembranePoint,
} from '../src';
import {
  actionCss, compartmentCss, interactionCss, lesionCss, membraneCss, modificationCss, moleculeCss, motionCss, nucleicCss, proteinCss,
} from '../src/primitives';
import { membranes } from './path';

describe('visual primitives', () => {
  it('generates stable but distinct protein surfaces from visualSeed', () => {
    expect(proteinGeometry('PARP1')).toEqual(proteinGeometry('PARP1'));
    expect(proteinGeometry('PARP1')).not.toEqual(proteinGeometry('XRCC1'));
  });

  it('renders deterministic SVG without consulting Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    expect(() => renderVocabularyGlyph('kinase')).not.toThrow();
    for (const id of ['elongating-dna', 'polymerase', 'event-elongate']) expect(renderVocabularyGlyph(id)).toBe(renderVocabularyGlyph(id));
    expect(renderVocabularyGlyph('kinase')).toBe(renderVocabularyGlyph('kinase'));
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it.each([
    ['phosphorylation', 'P'], ['acetylation', 'Ac'], ['methylation', 'Me'],
    ['sumoylation', 'SUMO'], ['glycosylation', 'sugar'],
  ] as const)('renders the %s marker', (kind, label) => {
    expect(renderModificationPrimitive({ kind })).toContain(`>${label}</text>`);
  });

  it('renders connected ubiquitin and branched PAR chains', () => {
    expect(renderModificationPrimitive({ kind: 'ubiquitination', length: 4 })).toContain('mm-modification--chain');
    const par = renderModificationPrimitive({ kind: 'parylation', length: 8, branched: true });
    expect(par.match(/<circle/g)?.length).toBeGreaterThan(8);
    expect(par).toMatch(/M[^<]+l-3 -15/);
  });

  it('communicates DNA lesions with distinct geometry', () => {
    const nick = renderNucleicAcidPrimitive({ lesion: 'nick' });
    const ssb = renderNucleicAcidPrimitive({ lesion: 'ssb' });
    const dsb = renderNucleicAcidPrimitive({ lesion: 'dsb' });
    expect(nick).not.toBe(ssb); expect(ssb).not.toBe(dsb);
    expect(renderNucleicAcidPrimitive({ lesion: 'ap-site' })).toContain('mm-lesion--ap-site');
    expect(renderNucleicAcidPrimitive({ lesion: 'mismatch' })).toContain('mm-nucleic__rung--mismatch');
    expect(renderNucleicAcidPrimitive({ lesion: 'crosslink' })).toContain('mm-lesion--crosslink');
  });

  describe('elongating strand', () => {
    const options = { x: 30, y: 100, width: 240, state: 'elongating' as const };
    const svg = renderNucleicAcidPrimitive(options);
    const geometry = nascentStrandGeometry(options);
    const points = (d: string) => [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    const nascentPath = svg.match(/class="mm-nucleic__new[^"]*"[^>]*d="([^"]+)"/)![1]!;

    it('draws one continuous template and one nascent strand, never a third backbone', () => {
      expect(svg.match(/mm-nucleic__strand--template/g)).toHaveLength(1);
      expect(svg.match(/class="mm-nucleic__new/g)).toHaveLength(1);
      expect(svg).not.toContain('mm-nucleic__strand--back');
      const template = points(svg.match(/mm-nucleic__strand--template" d="([^"]+)"/)![1]!);
      expect(template[0]!.x).toBe(30);
      expect(template.at(-1)!.x).toBe(270);
      expect(svg.match(/mm-nucleic__strand--template" d="([^"]+)"/)![1]!.match(/M/g)).toHaveLength(1);
    });

    it('keeps the nascent strand on the complementary backbone over part of the template', () => {
      const nascent = points(nascentPath);
      for (const point of nascent) expect(Math.abs(point.y - geometry.nascentY(point.x))).toBeLessThan(.2);
      expect(nascent[0]).toEqual(geometry.fivePrime);
      expect(nascent.at(-1)).toEqual(geometry.threePrime);
      expect(geometry.fivePrime.x).toBeGreaterThan(30);
      expect(geometry.threePrime.x).toBeLessThan(270 - 30);
    });

    it('leaves a free 3′ end at maximal strand separation', () => {
      const { threePrime, fivePrime, templateY } = geometry;
      expect(Math.abs(threePrime.y - templateY(threePrime.x))).toBeCloseTo(26, 0);
      expect(Math.abs(fivePrime.y - templateY(fivePrime.x))).toBeCloseTo(26, 0);
      expect(svg).toMatch(/class="mm-nucleic__terminus[^"]*"[^>]*stroke-dashoffset="-\.999"/);
    });

    it('animates growth from the 3′ end while the 5′ end stays fixed', () => {
      // The path geometry is final; only the dash reveal moves, and a dash always starts at the 5′ end.
      const strand = svg.match(/<path class="mm-nucleic__new mm-nucleic__grow" style="--mm-grow-from:([\d.]+);--mm-grow-to:0" pathLength="1" stroke-dasharray="1 1"/);
      expect(strand).not.toBeNull();
      expect(Number(strand![1])).toBeGreaterThan(.3);
      expect(Number(strand![1])).toBeLessThan(.9);
      expect(svg).toMatch(/mm-nucleic__terminus mm-nucleic__grow" style="--mm-grow-from:-[\d.]+;--mm-grow-to:-0\.999"/);
      expect(primitiveCss).toContain('@keyframes mm-nucleic-grow');
      expect(primitiveCss).toMatch(/prefers-reduced-motion:reduce\)\{\.mm-primitive \*/);
      const still = renderNucleicAcidPrimitive({ ...options, animate: false });
      expect(still).not.toContain('mm-nucleic__grow');
      expect(still.match(/class="mm-nucleic__new"[^>]*d="([^"]+)"/)![1]).toBe(nascentPath);
    });

    it('labels 5′→3′ polarity only on request', () => {
      expect(svg).not.toContain('mm-nucleic__polarity');
      const labelled = renderNucleicAcidPrimitive({ ...options, showDirectionality: true });
      expect(labelled.match(/>5′</g)).toHaveLength(2);
      expect(labelled.match(/>3′</g)).toHaveLength(2);
    });

    it('is deterministic and does not depend on vocabulary scene composition', () => {
      expect(renderNucleicAcidPrimitive(options)).toBe(svg);
      expect(svg).not.toMatch(/polymerase|kinase|ligase/i);
    });
  });

  it('assembles primitiveCss from one constant per primitive', () => {
    for (const css of [proteinCss, modificationCss, moleculeCss, nucleicCss, lesionCss, membraneCss, compartmentCss, interactionCss, actionCss, motionCss]) {
      expect(css.length).toBeGreaterThan(0);
      expect(primitiveCss).toContain(css);
    }
  });

  it('supports horizontal, vertical and curved membranes', () => {
    for (const orientation of ['horizontal', 'vertical', 'curved'] as const) {
      const svg = renderMembranePrimitive({ orientation });
      expect(svg).toContain(`mm-membrane--${orientation}`);
      // Both leaflets are drawn, each with a row of heads and one tail stroke per lipid, over the core.
      const [membrane] = membranes(svg);
      const geometry = membraneGeometry({ orientation });
      expect(membrane!.heads.outer).toHaveLength(geometry.leaflets[0].lipids.length);
      expect(membrane!.heads.inner).toHaveLength(geometry.leaflets[1].lipids.length);
      expect(membrane!.tails).toHaveLength(geometry.leaflets[0].lipids.length + geometry.leaflets[1].lipids.length);
      expect(membrane!.core.length).toBeGreaterThanOrEqual(2);
    }
    // The legacy call (no orientation) is still a horizontal bilayer.
    expect(renderMembranePrimitive({ x: 20, y: 116, length: 260 })).toContain('mm-membrane--horizontal');
  });

  describe('lipid bilayer', () => {
    // Distance of a point from the (densely sampled) midplane.
    const offsetFrom = (geometry: MembraneGeometry, p: { x: number; y: number }) =>
      Math.min(...geometry.centerline.map(q => Math.hypot(q.x - p.x, q.y - p.y)));

    it.each([
      ['horizontal', { orientation: 'horizontal' as const }],
      ['vertical', { orientation: 'vertical' as const }],
      ['curved', { orientation: 'curved' as const }],
      ['ellipse', { shape: { kind: 'ellipse' as const, cx: 0, cy: 0, rx: 90, ry: 50 } }],
    ])('puts heads outside and tails inside each leaflet (%s)', (_, options) => {
      const geometry = membraneGeometry(options);
      const [outer, inner] = geometry.leaflets;
      expect(outer.name).toBe('outer'); expect(inner.name).toBe('inner');
      for (const leaflet of geometry.leaflets) for (const lipid of leaflet.lipids) {
        // Heads sit on their leaflet's side of the midplane, a half-thickness away.
        expect(offsetFrom(geometry, lipid.head)).toBeCloseTo(geometry.halfThickness, 0);
        expect(lipid.tails).toHaveLength(2);
        for (const [start, end] of lipid.tails) {
          // Tails run from the head towards the core and stop short of the midplane.
          expect(offsetFrom(geometry, end)).toBeLessThan(offsetFrom(geometry, start));
          expect(offsetFrom(geometry, end)).toBeGreaterThan(0);
          expect(offsetFrom(geometry, start)).toBeLessThan(geometry.halfThickness);
        }
      }
      // Opposite leaflets face opposite ways: the outer normal points away from the inner heads.
      const o = outer.lipids[Math.floor(outer.lipids.length / 2)]!;
      const nearestInner = inner.lipids.reduce((a, b) => Math.hypot(a.head.x - o.head.x, a.head.y - o.head.y) < Math.hypot(b.head.x - o.head.x, b.head.y - o.head.y) ? a : b);
      expect(o.normal.x * nearestInner.normal.x + o.normal.y * nearestInner.normal.y).toBeLessThan(-.9);
      expect((o.head.x - nearestInner.head.x) * o.normal.x + (o.head.y - nearestInner.head.y) * o.normal.y).toBeGreaterThan(geometry.halfThickness);
    });

    it('scales the head count per leaflet with membrane length', () => {
      for (const length of [90, 150, 260]) {
        const geometry = membraneGeometry({ length });
        for (const leaflet of geometry.leaflets) expect(leaflet.lipids).toHaveLength(Math.floor(length / 9));
        expect(renderMembranePrimitive({ length })).toContain(`data-heads="${Math.floor(length / 9)} ${Math.floor(length / 9)}"`);
      }
      expect(membraneGeometry({ length: 120, spacing: 12 }).leaflets[0].lipids).toHaveLength(10);
      // On a curve the convex (outer) leaflet holds more lipids than the concave one.
      const curved = membraneGeometry({ orientation: 'curved', length: 250 });
      expect(curved.leaflets[0].lipids.length).toBeGreaterThan(curved.leaflets[1].lipids.length);
    });

    it('closes ellipses and paths with an inside and outside leaflet and no seam', () => {
      const square = [{ x: 0, y: 0 }, { x: 120, y: 0 }, { x: 120, y: 120 }, { x: 0, y: 120 }];
      for (const shape of [
        { kind: 'ellipse' as const, cx: 150, cy: 96, rx: 105, ry: 58 },
        { kind: 'path' as const, points: square, closed: true },
        { kind: 'path' as const, points: [...square].reverse(), closed: true },
        { kind: 'path' as const, points: square, closed: true, smooth: false },
      ]) {
        const geometry = membraneGeometry({ shape });
        expect(geometry.closed).toBe(true);
        expect(renderMembranePrimitive({ shape })).toContain('mm-membrane--closed');
        const centre = geometry.centerline.reduce((c, p) => ({ x: c.x + p.x / geometry.centerline.length, y: c.y + p.y / geometry.centerline.length }), { x: 0, y: 0 });
        const [outer, inner] = geometry.leaflets;
        expect(outer.lipids.length).toBeGreaterThan(inner.lipids.length);
        for (const leaflet of geometry.leaflets) {
          const heads = leaflet.lipids.map(lipid => lipid.head);
          const gaps = heads.map((head, i) => { const next = heads[(i + 1) % heads.length]!; return Math.hypot(next.x - head.x, next.y - head.y); });
          // The wrap-around gap (last → first) is no larger than any other: there is no seam.
          expect(gaps.at(-1)!).toBeLessThanOrEqual(Math.max(...gaps.slice(0, -1)) + .5);
          expect(Math.max(...gaps)).toBeLessThan(12);
          // Outer heads face away from the lumen, inner heads face into it.
          const sign = leaflet.name === 'outer' ? 1 : -1;
          for (const { head, normal } of leaflet.lipids) expect(sign * ((head.x - centre.x) * normal.x + (head.y - centre.y) * normal.y)).toBeGreaterThan(0);
        }
      }
    });

    it('is deterministic and does not consult Math.random', () => {
      const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
      const options = { shape: { kind: 'path' as const, points: [{ x: 0, y: 0 }, { x: 80, y: 30 }, { x: 140, y: 0 }] } };
      expect(renderMembranePrimitive(options)).toBe(renderMembranePrimitive(options));
      expect(membraneGeometry({ orientation: 'curved' })).toEqual(membraneGeometry({ orientation: 'curved' }));
      expect(renderVocabularyGlyph('membrane-closed')).toBe(renderVocabularyGlyph('membrane-closed'));
      expect(random).not.toHaveBeenCalled();
      random.mockRestore();
    });

    it.each([
      ['horizontal', { x: 25, y: 96, length: 250 }],
      ['curved', { x: 25, y: 108, length: 250, orientation: 'curved' as const }],
      ['closed', { shape: { kind: 'ellipse' as const, cx: 150, cy: 96, rx: 105, ry: 58 } }],
    ])('draws exactly the geometry of membraneGeometry, in compact path data (%s)', (_, options) => {
      const geometry = membraneGeometry(options); const [membrane] = membranes(renderMembranePrimitive(options));
      const near = (a: { x: number; y: number }, b: { x: number; y: number }) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(.08);
      const lipids = geometry.leaflets.flatMap(leaflet => leaflet.lipids);
      // Relative commands do not accumulate rounding: every head and tail lands on its geometric position.
      [...membrane!.heads.outer, ...membrane!.heads.inner].forEach((head, i) => near(head, lipids[i]!.head));
      membrane!.tails.forEach((stroke, i) => {
        const [[a1, b1], [a2, b2]] = lipids[i]!.tails as [[MembranePoint, MembranePoint], [MembranePoint, MembranePoint]];
        expect(stroke).toHaveLength(4); [b1, a1, a2, b2].forEach((point, k) => near(stroke[k]!, point));
        // The bend between the two tails stays hidden under the head disc (radius r + rim).
        for (const point of [a1, a2]) expect(Math.hypot(point.x - lipids[i]!.head.x, point.y - lipids[i]!.head.y)).toBeLessThan(geometry.headRadius);
      });
      // Every rim is painted under its head, and the simplified core stays on the midplane.
      expect(membrane!.rims).toBe(membrane!.headPath);
      expect(membrane!.closed).toBe(geometry.closed);
      for (const point of membrane!.core) expect(Math.min(...geometry.centerline.map(q => Math.hypot(q.x - point.x, q.y - point.y)))).toBeLessThan(.2);
    });

    it('keeps bilayer markup within its size budget', () => {
      // Before the compact encoding: 5.4 KB for this membrane and 451 KB for the nine compartments.
      expect(renderMembranePrimitive({ x: 25, y: 96, length: 250 }).length).toBeLessThan(2600);
      const kinds = ['extracellular', 'cytoplasm', 'nucleus', 'organelle', 'er', 'golgi', 'mitochondrion', 'lysosome', 'endosome'] as const;
      const compartments = kinds.map(kind => renderCompartmentPrimitive(kind, { x: 20, y: 15 }, { width: 260, height: 150 })).join('');
      expect(compartments.length).toBeLessThan(160_000);
      // One group and four paths per bilayer, whatever its length.
      expect(renderMembranePrimitive({ length: 900 }).match(/<[a-z]/g)).toHaveLength(5);
    });
  });

  it('renders compartments and explicit multi-member complexes', () => {
    expect(renderCompartmentPrimitive('mitochondrion')).toContain('mm-compartment--mitochondrion');
    const complex = renderInteractionPrimitive([{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 10, y: 10 }, { id: 'C', x: 20, y: 0 }]);
    expect(complex.match(/data-interaction=/g)).toHaveLength(2);
  });

  it('defines accessible future and reduced-motion presentation', () => {
    expect(renderProteinPrimitive({ visualSeed: 'future', state: 'future' })).toContain('mm-primitive--future');
    expect(primitiveCss).toContain('pointer-events:none');
    expect(primitiveCss).toContain('@media(prefers-reduced-motion:reduce)');
    const glyph = renderVocabularyGlyph('protein-future');
    expect(glyph).toContain('role="img"');
    expect(glyph).toContain('<title');
    expect(renderVocabularyGlyph('protein-future', { decorative: true })).toContain('aria-hidden="true"');
  });
});
