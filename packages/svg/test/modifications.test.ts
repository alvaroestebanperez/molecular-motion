import { describe, expect, it } from 'vitest';
import {
  PROTEIN_MORPHOLOGIES, UBIQUITIN_RADIUS, proteinGeometry, proteinOutlineWidth, renderModificationPrimitive, renderProteinPrimitive,
  renderVocabularyGlyph, ubiquitinGeometry, type ModificationVisualKind,
} from '../src';
import { outline, outlineDistance, penetration, type Placed } from './contact';

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const toOutline = (shape: Placed, point: Point) => Math.min(...outline(shape).map(p => distance(p, point)));
const units = (svg: string): Point[] => [...svg.matchAll(/class="mm-modification__unit" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
const ub = (at: Point): Placed => ({ particles: ubiquitinGeometry(), margin: proteinOutlineWidth(UBIQUITIN_RADIUS), x: at.x, y: at.y });
const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;

describe('ubiquitin as a small protein', () => {
  it('draws mono-ubiquitin as one protein surface, and PAR as beads without surfaces', () => {
    const mono = renderModificationPrimitive({ kind: 'ubiquitination' });
    expect(count(mono, /class="mm-surface"/g)).toBe(1);
    expect(mono).toContain('>Ub</text>');
    const par = renderModificationPrimitive({ kind: 'parylation', length: 8 });
    expect(par).not.toContain('mm-surface');
    expect(count(par, /<circle/g)).toBe(8);
  });

  it.each([2, 3, 4, 6])('draws a chain of %i ubiquitins as that many connected surfaces', n => {
    const svg = renderModificationPrimitive({ kind: 'ubiquitination', length: n }, { x: 0, y: -40 });
    expect(svg).toContain('mm-modification--chain');
    expect(count(svg, /class="mm-surface"/g)).toBe(n);
    const centres = units(svg);
    expect(centres).toHaveLength(n);
    const links = [...svg.matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)].map(([, a, b, c, d]) => [{ x: Number(a), y: Number(b) }, { x: Number(c), y: Number(d) }] as const);
    expect(links).toHaveLength(n - 1);
    links.forEach(([from, to], index) => {
      const a = ub(centres[index]!); const b = ub(centres[index + 1]!);
      // Neighbours stay separate units, a short gap apart, and the link reaches into both outlines.
      expect(penetration(a, b)).toBe(0);
      expect(outlineDistance(a, b)).toBeLessThan(7);
      expect(toOutline(a, from)).toBeLessThan(3);
      expect(toOutline(b, to)).toBeLessThan(3);
    });
  });

  it('reuses the protein surface without the Protein primitive (no halo, state or nested markers)', () => {
    const svg = renderModificationPrimitive({ kind: 'ubiquitination', length: 4 });
    for (const forbidden of ['mm-primitive', 'mm-primitive__halo', 'mm-primitive__inhibition', 'data-visual-seed', 'data-morphology']) expect(svg).not.toContain(forbidden);
    expect(count(svg, /class="mm-modification /g)).toBe(1);
  });

  it('is deterministic and every ubiquitin unit is the same small protein everywhere', () => {
    const inner = (svg: string) => [...svg.matchAll(/<g class="mm-modification__unit" transform="[^"]+">(.*?<\/text>)<\/g>/g)].map(match => match[1]);
    const glyphs = ['ubiquitination', 'ubiquitin-ligase', 'event-ubiquitinate', 'proteasome'].map(id => renderVocabularyGlyph(id));
    const all = glyphs.flatMap(inner);
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(new Set(all).size).toBe(1);
    for (const id of ['ubiquitination', 'proteasome']) expect(renderVocabularyGlyph(id)).toBe(renderVocabularyGlyph(id));
    // Small: a mini-protein, never another protagonist.
    expect(UBIQUITIN_RADIUS).toBeLessThan(15);
  });
});

describe('modification markers attach to the visible surface', () => {
  const radius = 44;
  const badges: ModificationVisualKind[] = ['phosphorylation', 'acetylation', 'methylation', 'sumoylation', 'glycosylation'];

  it.each(PROTEIN_MORPHOLOGIES)('labelled tags, PAR and ubiquitin touch the outline of a %s protein', family => {
    const seed = `attach-${family}`;
    const protein: Placed = { particles: proteinGeometry(seed, radius, 28, family), margin: proteinOutlineWidth(radius), x: 0, y: 0 };
    const tags = renderProteinPrimitive({ visualSeed: seed, morphology: family, radius, modifications: badges.map(kind => ({ kind })) });
    const points = [...tags.matchAll(/class="mm-modification mm-modification--\w+" transform="translate\(([-\d.]+) ([-\d.]+)\)"/g)].map(([, x, y]) => ({ x: Number(x), y: Number(y) }));
    expect(points).toHaveLength(badges.length);
    for (const point of points) expect(toOutline(protein, point)).toBeLessThan(1.5);

    const par = renderProteinPrimitive({ visualSeed: seed, morphology: family, radius, modifications: [{ kind: 'parylation', length: 6 }] });
    const [, x, y] = /mm-modification--parylation"><path d="M([-\d.]+) ([-\d.]+)/.exec(par)!;
    expect(toOutline(protein, { x: Number(x), y: Number(y) })).toBeLessThan(1.5);

    for (const length of [1, 3]) {
      const chain = renderProteinPrimitive({ visualSeed: seed, morphology: family, radius, modifications: [{ kind: 'ubiquitination', length }] });
      const first = ub(units(chain)[0]!);
      // The proximal ubiquitin is pressed against the carrier: in contact, without burying itself.
      expect(outlineDistance(protein, first)).toBeLessThan(.6);
      expect(penetration(protein, first)).toBeLessThan(2.5);
      // Distal units grow away from the carrier instead of folding back onto it.
      for (const centre of units(chain).slice(1)) expect(penetration(protein, ub(centre))).toBe(0);
    }
  });

  it('keeps the marker order and angles stable across states', () => {
    const modifications = badges.map(kind => ({ kind }));
    const markers = (state: 'normal' | 'active' | 'inhibited') => renderProteinPrimitive({ visualSeed: 'stable', state, modifications }).match(/translate\([^)]+\)/g);
    expect(markers('active')).toEqual(markers('normal'));
    expect(markers('inhibited')).toEqual(markers('normal'));
  });
});
