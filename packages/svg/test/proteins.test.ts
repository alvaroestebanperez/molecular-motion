import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import {
  MOLECULAR_VOCABULARY, PROTEIN_MORPHOLOGIES, buildSvgScene, proteinAnchors, proteinGeometry, proteinMorphology, proteinOutlineWidth,
  renderProteinPrimitive, renderProteinSurface, renderSvg, renderVocabularyGlyph,
} from '../src';
import { silhouetteSimilarity } from './silhouette';

const surface = (svg: string) => svg.match(/<g class="mm-surface">[\s\S]*?<\/g><\/g>/)![0];
const parp1 = () => compileMechanism(parseMechanism(readFileSync(new URL('../../../examples/parp1-ssb-repair.yaml', import.meta.url), 'utf8')));

describe('protein surfaces', () => {
  it('derives geometry only from visualSeed (and size), without global randomness', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    expect(proteinGeometry('XRCC1', 40)).toEqual(proteinGeometry('XRCC1', 40));
    expect(proteinMorphology('XRCC1')).toBe(proteinMorphology('XRCC1'));
    const small = proteinGeometry('XRCC1', 20);
    const large = proteinGeometry('XRCC1', 40);
    small.forEach((particle, index) => {
      expect(large[index]!.x).toBeCloseTo(particle.x * 2, 6);
      expect(large[index]!.rx).toBeCloseTo(particle.rx * 2, 6);
    });
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('keeps the lobe index on every particle so shading can be computed per lobe', () => {
    for (const morphology of PROTEIN_MORPHOLOGIES) {
      const particles = proteinGeometry(`lobes-${morphology}`, 40, 28, morphology);
      expect(particles.every(particle => Number.isInteger(particle.domain))).toBe(true);
      expect(new Set(particles.map(particle => particle.domain)).size).toBeGreaterThan(1);
    }
  });

  it('keeps every family within its nominal radius', () => {
    for (const morphology of PROTEIN_MORPHOLOGIES) {
      for (const particle of proteinGeometry(`fit-${morphology}`, 50, 28, morphology)) {
        expect(Math.hypot(particle.x, particle.y) + Math.max(particle.rx, particle.ry)).toBeLessThanOrEqual(50 * .98 + 1e-9);
      }
    }
  });

  it('assigns all six morphology families across seeds', () => {
    const families = new Set(Array.from({ length: 60 }, (_, index) => proteinMorphology(`seed-${index}`)));
    expect([...families].sort()).toEqual([...PROTEIN_MORPHOLOGIES].sort());
  });

  it('keeps the identity-test proteins distinguishable by silhouette alone', () => {
    const ids = ['parp1', 'xrcc1', 'polb', 'lig3', 'ogg1', 'ape1'];
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        expect(silhouetteSimilarity(proteinGeometry(ids[a]!, 40), proteinGeometry(ids[b]!, 40), 40)).toBeLessThan(.8);
      }
    }
  });

  it('varies the silhouette within a family through visualSeed', () => {
    const compact = ['PARP1', 'POLB', 'Protein-X'].map(seed => proteinGeometry(seed, 40, 28, 'compact'));
    expect(compact[0]).not.toEqual(compact[1]);
    for (let a = 0; a < compact.length; a++) {
      for (let b = a + 1; b < compact.length; b++) expect(silhouetteSimilarity(compact[a]!, compact[b]!, 40)).toBeLessThan(.9);
    }
    for (const morphology of PROTEIN_MORPHOLOGIES) {
      const shapes = Array.from({ length: 6 }, (_, index) => proteinGeometry(`variant-${index}`, 40, 28, morphology));
      const scores = shapes.flatMap((shape, a) => shapes.slice(a + 1).map(other => silhouetteSimilarity(shape, other, 40))).sort();
      expect(scores[Math.floor(scores.length / 2)]).toBeLessThan(.8);
    }
  });

  it('makes families recognisably different from one another', () => {
    const shapes = PROTEIN_MORPHOLOGIES.map(morphology => proteinGeometry('family-probe', 40, 28, morphology));
    for (let a = 0; a < shapes.length; a++) {
      for (let b = a + 1; b < shapes.length; b++) expect(silhouetteSimilarity(shapes[a]!, shapes[b]!, 40)).toBeLessThan(.82);
    }
  });

  it('draws one unified surface: a single outline and no per-particle strokes', () => {
    const svg = renderProteinPrimitive({ visualSeed: 'PARP1', fill: '#7774d8' });
    expect(svg.match(/mm-surface__outline/g)).toHaveLength(1);
    expect(svg).not.toMatch(/<ellipse[^>]*stroke/);
    expect(svg).not.toContain('<circle cx');
    expect(svg).toContain(`data-morphology="${proteinMorphology('PARP1')}"`);
  });

  it('preserves the silhouette across non-destructive states', () => {
    const normal = surface(renderProteinPrimitive({ visualSeed: 'POLB', fill: '#d16f8b' }));
    for (const state of ['active', 'inactive', 'inhibited', 'selected', 'future'] as const) {
      expect(surface(renderProteinPrimitive({ visualSeed: 'POLB', fill: '#d16f8b', state }))).toBe(normal);
    }
  });

  it('renders mechanism actors with the same shared surface as the catalog primitive', () => {
    const scene = buildSvgScene(parp1().at('gap-filling'));
    const polb = scene.actors.find(actor => actor.id === 'polb')!;
    const expected = renderProteinSurface(proteinGeometry('polb', polb.radius, 28), polb.color, polb.radius);
    expect(renderSvg(scene)).toContain(expected);
  });

  it('keeps every PARP1 actor silhouette identical across all steps', () => {
    const mechanism = parp1();
    const seen = new Map<string, Set<string>>();
    for (let index = 0; index < mechanism.length; index++) {
      const svg = renderSvg(buildSvgScene(mechanism.at(index)));
      for (const [, id, markup] of svg.matchAll(/data-actor="([^"]+)"[\s\S]*?(<g class="mm-surface">[\s\S]*?<\/g><\/g>)/g)) {
        seen.set(id!, (seen.get(id!) ?? new Set()).add(markup!));
      }
    }
    expect([...seen.keys()]).toEqual(expect.arrayContaining(['parp1', 'xrcc1', 'polb', 'lig3']));
    for (const [, variants] of seen) expect(variants.size).toBe(1);
  });

  describe('identity test section', () => {
    const cards = MOLECULAR_VOCABULARY.filter(item => item.category === 'protein-identity');
    const glyph = (id: string) => renderVocabularyGlyph(id, { idPrefix: id });

    it('shows six proteins in one colour and size, then PARP1 in four states', () => {
      expect(cards.map(item => item.id)).toEqual([
        'identity-parp1', 'identity-xrcc1', 'identity-polb', 'identity-lig3', 'identity-ogg1', 'identity-ape1',
        'identity-parp1-normal', 'identity-parp1-active', 'identity-parp1-inhibited', 'identity-parp1-future',
      ]);
      expect(new Set(cards.map(item => item.color)).size).toBe(1);
      const outlines = cards.slice(0, 6).map(item => glyph(item.id).match(/mm-surface__outline" fill="([^"]+)"/)![1]);
      expect(new Set(outlines).size).toBe(1);
    });

    it('different protein → different silhouette', () => {
      const surfaces = cards.slice(0, 6).map(item => surface(glyph(item.id)));
      expect(new Set(surfaces).size).toBe(6);
    });

    it('same protein, different state → identical silhouette', () => {
      const surfaces = cards.slice(5 + 1).map(item => surface(glyph(item.id)));
      expect(new Set(surfaces).size).toBe(1);
      expect(surfaces[0]).toBe(surface(glyph('identity-parp1')));
      expect(glyph('identity-parp1-active')).toContain('mm-primitive__halo');
      expect(glyph('identity-parp1-inhibited')).toContain('mm-primitive__inhibition');
      expect(glyph('identity-parp1-future')).toContain('mm-primitive--future');
    });
  });

  it('renders the morphology legend deterministically', () => {
    const legend = renderVocabularyGlyph('protein-morphologies');
    expect(legend).toBe(renderVocabularyGlyph('protein-morphologies'));
    for (const morphology of PROTEIN_MORPHOLOGIES) expect(legend).toContain(`data-morphology="${morphology}"`);
  });
});

describe('protein state catalog', () => {
  it('shows one protein in every non-destructive state card', () => {
    const states = ['protein-normal', 'protein-active', 'protein-inactive', 'protein-inhibited', 'protein-selected', 'protein-future'];
    const surfaces = states.map(id => surface(renderVocabularyGlyph(id, { idPrefix: id })));
    expect(new Set(surfaces).size).toBe(1);
    const colors = MOLECULAR_VOCABULARY.filter(item => states.includes(item.id)).map(item => item.color);
    expect(new Set(colors).size).toBe(1);
  });
});

describe('protein contact anchors', () => {
  const inside = (particles: ReturnType<typeof proteinGeometry>, x: number, y: number, margin: number) => particles.some(particle => {
    const theta = particle.rotation * Math.PI / 180;
    const u = (x - particle.x) * Math.cos(theta) + (y - particle.y) * Math.sin(theta);
    const v = -(x - particle.x) * Math.sin(theta) + (y - particle.y) * Math.cos(theta);
    return (u / (particle.rx + margin)) ** 2 + (v / (particle.ry + margin)) ** 2 <= 1;
  });

  it.each(PROTEIN_MORPHOLOGIES)('places %s anchors on the visible surface, outline included', morphology => {
    const radius = 40;
    const particles = proteinGeometry(`anchor-${morphology}`, radius, 28, morphology);
    const margin = proteinOutlineWidth(radius);
    const anchors = proteinAnchors(particles, radius);
    const outward = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] } as const;
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const point = anchors[side];
      const [dx, dy] = outward[side];
      expect(inside(particles, point.x - dx * .3, point.y - dy * .3, margin)).toBe(true);
      expect(inside(particles, point.x + dx * 1.2, point.y + dy * 1.2, margin)).toBe(false);
    }
    expect(anchors.left.x).toBeLessThan(anchors.center.x);
    expect(anchors.right.x).toBeGreaterThan(anchors.center.x);
    expect(anchors.top.y).toBeLessThan(anchors.center.y);
    expect(anchors.bottom.y).toBeGreaterThan(anchors.center.y);
    expect(anchors.bounds.x).toBeLessThanOrEqual(anchors.left.x);
    expect(anchors.bounds.x + anchors.bounds.width).toBeGreaterThanOrEqual(anchors.right.x);
  });

  it('uses the outer surface of a ring, not its hole', () => {
    const particles = proteinGeometry('anchor-ring', 40, 28, 'ring');
    const { right, center } = proteinAnchors(particles, 40);
    expect(right.x - center.x).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    const particles = proteinGeometry('XRCC1', 36);
    expect(proteinAnchors(particles, 36)).toEqual(proteinAnchors(proteinGeometry('XRCC1', 36), 36));
  });
});
