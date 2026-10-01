import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { compileMechanism, parseMechanism } from '@molecular-motion/core';
import {
  PROTEIN_MORPHOLOGIES, buildSvgScene, proteinGeometry, proteinMorphology,
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

  it('keeps PARP1, XRCC1, POLβ and LIG3 distinguishable by silhouette alone', () => {
    const ids = ['parp1', 'xrcc1', 'polb', 'lig3'];
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) {
        expect(silhouetteSimilarity(proteinGeometry(ids[a]!, 40), proteinGeometry(ids[b]!, 40), 40)).toBeLessThan(.8);
      }
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

  it('renders the morphology legend deterministically', () => {
    const legend = renderVocabularyGlyph('protein-morphologies');
    expect(legend).toBe(renderVocabularyGlyph('protein-morphologies'));
    for (const morphology of PROTEIN_MORPHOLOGIES) expect(legend).toContain(`data-morphology="${morphology}"`);
  });
});
