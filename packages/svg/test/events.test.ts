import { describe, expect, it } from 'vitest';
import { renderUnitChainPrimitive, renderVocabularyGlyph } from '../src';

/** Each unit's markup without its placement, so identical units compare equal. */
const units = (markup: string) => [...markup.matchAll(/<rect class="mm-unit-chain__unit"[^>]*\/>/g)].map(m => m[0].replace(/transform="[^"]*"/, ''));
/** Card markup without its embedded stylesheet, so class checks only see drawn elements. */
const art = (id: string) => renderVocabularyGlyph(id).replace(/<style>[\s\S]*?<\/style>/, '');
const groups =(markup: string, kind: 'linked' | 'free') => [...markup.matchAll(new RegExp(`<g class="[^"]*mm-unit-chain--${kind}" data-units="(\\d+)">([\\s\\S]*?)</g>`, 'g'))];

describe('unit chain primitive', () => {
  it('links identical units into one chain, or leaves them free', () => {
    const chain = renderUnitChainPrimitive({ count: 5, spacing: 15, wave: 4 });
    expect(new Set(units(chain)).size).toBe(1);
    expect(units(chain)).toHaveLength(5);
    expect(chain).toContain('mm-unit-chain__bonds');
    const free = renderUnitChainPrimitive({ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }], linked: false });
    expect(free).not.toContain('mm-unit-chain__bonds');
    expect(free).toContain('mm-unit-chain--free');
  });

  it('is deterministic', () => {
    expect(renderUnitChainPrimitive({ count: 6, wave: 5 })).toBe(renderUnitChainPrimitive({ count: 6, wave: 5 }));
  });
});

describe('polymerize event', () => {
  const svg = art('event-polymerize');
  it('ends in a chain of at least four identical, connected units, with free monomers before it', () => {
    const linked = groups(svg, 'linked');
    const longest = Math.max(...linked.map(m => Number(m[1])));
    expect(longest).toBeGreaterThanOrEqual(4);
    const chain = linked.find(m => Number(m[1]) === longest)![2]!;
    expect(chain).toContain('mm-unit-chain__bonds');
    expect(new Set(units(chain)).size).toBe(1);
    expect(groups(svg, 'free').length).toBeGreaterThan(0);
    // The long chain is the product: it comes after the arrow.
    expect(svg.indexOf(chain)).toBeGreaterThan(svg.indexOf('mm-action--polymerize'));
  });
  it('uses neutral units, never a modification chain', () => {
    expect(svg).not.toContain('mm-modification');
  });
  it('is deterministic', () => expect(art('event-polymerize')).toBe(svg));
});

describe('synthesize event', () => {
  const svg = art('event-synthesize');
  const arrowAt = svg.indexOf('mm-action--synthesize');
  const source = svg.slice(0, arrowAt); const target = svg.slice(arrowAt);
  const seeds = (markup: string) => new Set([...markup.matchAll(/data-visual-seed="([^"]+)"/g)].map(m => m[1]));
  it('shows precursors before the arrow and a new product, absent from the source side, after it', () => {
    expect(arrowAt).toBeGreaterThan(0);
    expect(source.match(/mm-primitive--molecule/g)?.length).toBeGreaterThanOrEqual(2);
    expect(target).toContain('data-product');
    const product = [...seeds(target)];
    expect(product.length).toBeGreaterThan(0);
    for (const seed of product) expect(seeds(source).has(seed)).toBe(false);
    expect(source).not.toContain('mm-primitive--protein');
  });
  it('joins the two precursors into one molecule: A + B → AB, no protein product', () => {
    expect(source.match(/data-topology="ring"/g)).toHaveLength(2);
    expect(target).toMatch(/data-product="">[^]*data-topology="units"/);
    expect(target).toContain('data-units="1"');
    expect(svg).not.toContain('mm-primitive--protein');
  });
  it('is a solid transformation arrow and deterministic', () => {
    expect(svg).not.toContain('mm-action--dashed');
    expect(art('event-synthesize')).toBe(svg);
  });
});
