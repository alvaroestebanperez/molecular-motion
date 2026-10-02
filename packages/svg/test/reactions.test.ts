import { describe, expect, it, vi } from 'vitest';
import { renderVocabularyGlyph } from '../src';

/**
 * Reaction cards are composed as reactants → products: the reactant column comes first in the markup,
 * then the catalyst and the arrow, then the product column. Split on those groups.
 */
function sides(id: string) {
  const svg = renderVocabularyGlyph(id, { decorative: true }).replace(/<style>[\s\S]*?<\/style>/, '');
  const start = svg.indexOf('data-reactants=""'); const arrow = svg.indexOf('<g class="mm-action'); const end = svg.indexOf('data-products=""');
  expect(start, `${id} has a reactant column`).toBeGreaterThan(-1);
  expect(end, `${id} has a product column`).toBeGreaterThan(arrow);
  const catalyst = svg.indexOf('data-catalyst=""');
  return { svg, reactants: svg.slice(start, catalyst > -1 ? catalyst : arrow), catalyst: catalyst > -1 ? svg.slice(catalyst, arrow) : '', products: svg.slice(end) };
}
/** data-phosphates of every topology molecule in a fragment. */
const phosphates = (markup: string) => [...markup.matchAll(/mm-molecule--topology"[^>]*data-phosphates="(\d+)"/g)].map(m => Number(m[1]));
const markers = (markup: string, kind: string) => markup.match(new RegExp(`mm-modification--${kind}`, 'g'))?.length ?? 0;
/** Number of continuous pieces of each front backbone in a fragment (a nick or break splits it). */
const frontPieces = (markup: string) => [...markup.matchAll(/mm-nucleic__strand--front" d="([^"]+)"/g)].map(m => m[1]!.match(/M/g)!.length);

describe('enzymatic reactions: reactants → products', () => {
  it('kinase: ATP + substrate → ADP + substrate-P, with the kinase as catalyst', () => {
    for (const id of ['kinase', 'test-kinase']) {
      const { reactants, products, catalyst } = sides(id);
      expect(phosphates(reactants)).toEqual([3]);
      expect(phosphates(products)).toEqual([2]);
      expect(reactants).toContain('data-species="atp"');
      expect(products).toContain('data-species="adp"');
      expect(markers(reactants, 'phosphorylation')).toBe(0);
      expect(markers(products, 'phosphorylation')).toBe(1);
      expect(catalyst).toContain('data-visual-seed="kinase"');
    }
  });

  it('kinase uses the catalogue ATP and ADP topologies', () => {
    const glyph = (id: string) => /<g class="mm-primitive mm-primitive--molecule mm-molecule--topology"[^>]*>/.exec(renderVocabularyGlyph(id, { decorative: true }))![0];
    const { reactants, products } = sides('kinase');
    expect(reactants).toContain(glyph('atp'));
    expect(products).toContain(glyph('adp'));
  });

  it('phosphatase releases a free phosphate', () => {
    const { reactants, products } = sides('phosphatase');
    expect(markers(reactants, 'phosphorylation')).toBe(1);
    expect(products).toContain('data-species="substrate"');
    expect(products).toContain('data-species="free-phosphorylation"');
    // The released phosphate is not attached to any protein.
    expect(/data-species="free-phosphorylation"><g class="mm-modification mm-modification--phosphorylation"/.test(products)).toBe(true);
  });

  it('ATPase: ATP → ADP + Pᵢ, coupled to the same protein changing state', () => {
    const { reactants, products } = sides('atpase');
    expect(phosphates(reactants)).toEqual([3]);
    expect(phosphates(products)).toEqual([2]);
    expect(products).toContain('data-species="free-phosphorylation"');
    expect(reactants).toContain('mm-primitive--protein mm-primitive--normal" data-visual-seed="atpase"');
    expect(products).toContain('mm-primitive--protein mm-primitive--active" data-visual-seed="atpase"');
  });

  it('ligase: nicked DNA → an intact backbone', () => {
    for (const id of ['ligase', 'event-ligate']) {
      const { reactants, products } = sides(id);
      expect(frontPieces(reactants)).toEqual([2]);
      expect(frontPieces(products)).toEqual([1]);
      expect(products).not.toMatch(/mm-lesion/);
    }
  });

  it('nuclease: intact DNA → broken DNA', () => {
    const { reactants, products } = sides('nuclease');
    expect(frontPieces(reactants)).toEqual([1]);
    expect(frontPieces(products)).toEqual([2]);
    expect(sides('nuclease').svg).toContain('mm-action--cleave');
  });

  it('glycosylase: damaged base → AP site', () => {
    const { reactants, products } = sides('glycosylase');
    expect(reactants).toContain('mm-lesion--damaged-base');
    expect(reactants).not.toContain('mm-lesion--ap-site');
    expect(products).toContain('mm-lesion--ap-site');
    expect(products).not.toContain('mm-lesion--damaged-base');
  });

  it('helicase: duplex + ATP → unwound DNA + ADP + Pᵢ', () => {
    const { reactants, products } = sides('helicase');
    expect(reactants).toContain('mm-primitive--dsdna mm-primitive--normal');
    expect(products).toContain('mm-primitive--unwound');
    expect(phosphates(reactants)).toEqual([3]);
    expect(phosphates(products)).toEqual([2]);
  });

  it('keeps the catalyst out of both columns', () => {
    for (const id of ['kinase', 'phosphatase', 'protease', 'nuclease', 'helicase', 'ligase', 'glycosylase', 'transferase', 'ubiquitin-ligase', 'deacetylase']) {
      const { reactants, products, catalyst } = sides(id);
      expect(catalyst).toContain(`data-visual-seed="${id}"`);
      expect(reactants).not.toContain(`data-visual-seed="${id}"`);
      expect(products).not.toContain(`data-visual-seed="${id}"`);
    }
  });

  it('is deterministic and never consults Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    for (const id of ['kinase', 'phosphatase', 'atpase', 'ligase', 'nuclease', 'glycosylase', 'helicase', 'transferase', 'test-kinase', 'event-ligate']) {
      expect(renderVocabularyGlyph(id)).toBe(renderVocabularyGlyph(id));
    }
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});
