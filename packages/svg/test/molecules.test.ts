import { describe, expect, it } from 'vitest';
import { renderSmallMoleculePrimitive, renderVocabularyGlyph, SMALL_MOLECULE_TOPOLOGIES, type SmallMoleculeTopology } from '../src';

const draw = (id: string) => renderSmallMoleculePrimitive({ visualSeed: id, topology: SMALL_MOLECULE_TOPOLOGIES[id]!, x: 150, y: 100 });
const count = (svg: string, pattern: RegExp) => svg.match(pattern)?.length ?? 0;
const phosphorus = (svg: string) => count(svg, /mm-atom--p"/g);
const attr = (svg: string, name: string) => new RegExp(`data-${name}="([^"]*)"`).exec(svg)?.[1];
/** Closed sub-paths of the ring path: one per ring drawn. */
const rings = (svg: string) => count(/class="mm-molecule__bonds mm-molecule__rings" d="([^"]*)"/.exec(svg)?.[1] ?? '', /Z/g);
const units = (id: string) => { const t = SMALL_MOLECULE_TOPOLOGIES[id]!; return t.kind === 'units' ? t.units : []; };

describe('small molecule topology', () => {
  it('draws ATP with three phosphates and ADP with two, on the same base and sugar', () => {
    expect(phosphorus(draw('atp'))).toBe(3);
    expect(phosphorus(draw('adp'))).toBe(2);
    expect(attr(draw('atp'), 'phosphates')).toBe('3');
    expect(units('atp')[0]!.base).toEqual(units('adp')[0]!.base);
    // Purine (two fused rings) + sugar.
    expect(rings(draw('atp'))).toBe(3);
  });

  it('gives GTP and ATP the same grammar with a different base', () => {
    expect(phosphorus(draw('gtp'))).toBe(3);
    expect(units('gtp')[0]!.base).not.toEqual(units('atp')[0]!.base);
    expect(units('gtp')[0]!.base.substituents?.length).not.toBe(units('atp')[0]!.base.substituents?.length);
    expect(draw('gtp')).not.toBe(draw('atp').replace('"atp"', '"gtp"'));
  });

  it('draws NAD⁺ and NADH as two nucleotide units joined through their phosphates, with a redox cue', () => {
    for (const id of ['nad-plus', 'nadh']) {
      const svg = draw(id);
      expect(attr(svg, 'units')).toBe('2');
      expect(attr(svg, 'closure')).toBe('open');
      expect(phosphorus(svg)).toBe(2);
      // Purine (2) + sugar + sugar + single-ring base.
      expect(rings(svg)).toBe(5);
    }
    expect(draw('nad-plus')).toContain('mm-molecule__charge-mark');
    expect(draw('nadh')).not.toContain('mm-molecule__charge-mark');
    expect(draw('nadh')).toContain('mm-atom--h');
    expect(draw('nad-plus')).not.toContain('mm-atom--h');
  });

  it('closes cGAMP into a cycle of two nucleotides', () => {
    const svg = draw('cgamp');
    expect(attr(svg, 'closure')).toBe('cyclic');
    expect(attr(svg, 'units')).toBe('2');
    expect(phosphorus(svg)).toBe(2);
    expect(svg).toMatch(/class="mm-molecule__cycle" d="M[^"]+Z"/);
    expect(draw('atp')).not.toContain('mm-molecule__cycle');
  });

  it('draws glucose as a single closed ring without phosphates', () => {
    const svg = draw('glucose');
    expect(attr(svg, 'topology')).toBe('ring');
    expect(rings(svg)).toBe(1);
    expect(phosphorus(svg)).toBe(0);
  });

  it('keeps ions as one labelled sphere whose symbol and size are part of the glyph', () => {
    const calcium = draw('calcium'); const zinc = draw('zinc');
    for (const svg of [calcium, zinc]) {
      expect(count(svg, /<circle/g)).toBe(1);
      expect(svg).toContain('>2+</text>');
    }
    expect(calcium).toContain('>Ca</text>');
    expect(zinc).toContain('>Zn</text>');
    const radius = (svg: string) => Number(/mm-molecule__ion"[^>]* r="([\d.]+)"/.exec(svg)?.[1]);
    expect(radius(calcium)).toBeGreaterThan(radius(zinc));
  });

  it('is deterministic and independent of the seed', () => {
    const topology: SmallMoleculeTopology = SMALL_MOLECULE_TOPOLOGIES.atp!;
    expect(draw('atp')).toBe(draw('atp'));
    const a = renderSmallMoleculePrimitive({ visualSeed: 'one', topology });
    const b = renderSmallMoleculePrimitive({ visualSeed: 'two', topology });
    expect(a.replace('"one"', '"two"')).toBe(b);
    expect(a).not.toContain('NaN');
  });

  it('keeps the legacy call signature and markup', () => {
    const legacy = renderSmallMoleculePrimitive({ visualSeed: 'ATP', label: 'ATP', x: 42, y: 45, scale: .6 });
    expect(legacy).toContain('<g class="mm-primitive mm-primitive--molecule" data-visual-seed="ATP"><g class="mm-molecule__bonds">');
    expect(legacy).not.toContain('mm-molecule--topology');
    const ion = renderSmallMoleculePrimitive({ visualSeed: 'ion', x: 10, y: 10, scale: .5, ion: true });
    expect(count(ion, /<circle/g)).toBe(1);
    expect(ion).toContain('<g class="mm-molecule__bonds"></g>');
  });

  it('uses the shared topologies in the Small molecules cards', () => {
    for (const id of Object.keys(SMALL_MOLECULE_TOPOLOGIES)) expect(renderVocabularyGlyph(id)).toContain('mm-molecule--topology');
  });
});
