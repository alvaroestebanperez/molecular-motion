import { describe, expect, it, vi } from 'vitest';
import {
  primitiveCss, proteinGeometry, renderCompartmentPrimitive, renderInteractionPrimitive,
  renderMembranePrimitive, renderModificationPrimitive, renderNucleicAcidPrimitive,
  renderProteinPrimitive, renderVocabularyGlyph,
} from '../src';

describe('visual primitives', () => {
  it('generates stable but distinct protein surfaces from visualSeed', () => {
    expect(proteinGeometry('PARP1')).toEqual(proteinGeometry('PARP1'));
    expect(proteinGeometry('PARP1')).not.toEqual(proteinGeometry('XRCC1'));
  });

  it('renders deterministic SVG without consulting Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    expect(() => renderVocabularyGlyph('kinase')).not.toThrow();
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

  it('supports horizontal, vertical and curved membranes', () => {
    for (const orientation of ['horizontal', 'vertical', 'curved'] as const) {
      expect(renderMembranePrimitive({ orientation })).toContain(`mm-membrane--${orientation}`);
    }
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
