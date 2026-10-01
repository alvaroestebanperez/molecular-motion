import { describe, expect, it, vi } from 'vitest';
import {
  primitiveCss, proteinGeometry, renderCompartmentPrimitive, renderInteractionPrimitive,
  nascentStrandGeometry, renderMembranePrimitive, renderModificationPrimitive, renderNucleicAcidPrimitive,
  renderProteinPrimitive, renderVocabularyGlyph,
} from '../src';
import {
  actionCss, compartmentCss, interactionCss, lesionCss, membraneCss, modificationCss, moleculeCss, motionCss, nucleicCss, proteinCss,
} from '../src/primitives';

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
