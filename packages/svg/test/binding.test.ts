import { describe, expect, it } from 'vitest';
import {
  PROTEIN_MORPHOLOGIES, contactOffset, proteinAnchors, proteinGeometry, renderInteractionPrimitive, renderVocabularyGlyph,
  type ContactSide,
} from '../src';

/** Contact threshold in px: facing anchors of bound partners must (nearly) coincide. */
const TOUCH = 3;
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

interface Actor { id: string; seed: string; morphology: string; x: number; y: number; radius: number }
/** Actors of a rendered card, in document order, with their anchors in card coordinates. */
function actors(svg: string) {
  const pattern = /<g transform="translate\(([-\d.]+) ([-\d.]+)\)" data-actor="([^"]+)" data-radius="([\d.]+)"><g class="mm-primitive mm-primitive--protein[^"]*" data-visual-seed="([^"]+)" data-morphology="([^"]+)"/g;
  return [...svg.matchAll(pattern)].map(([, x, y, id, radius, seed, morphology]): Actor => ({ id: id!, seed: seed!, morphology: morphology!, x: Number(x), y: Number(y), radius: Number(radius) }));
}
function anchor(actor: Actor, side: ContactSide) {
  const local = proteinAnchors(proteinGeometry(actor.seed, actor.radius), actor.radius)[side];
  return { x: actor.x + local.x, y: actor.y + local.y };
}
const gap = (left: Actor, right: Actor) => distance(anchor(left, 'right'), anchor(right, 'left'));
const hasDottedLink = (svg: string) => /<path data-interaction=/.test(svg);

describe('contact placement', () => {
  it.each(PROTEIN_MORPHOLOGIES)('brings a %s partner anchor-to-anchor on every side', morphology => {
    const radius = 30;
    const a = proteinAnchors(proteinGeometry(`contact-a-${morphology}`, radius, 28, morphology), radius);
    const b = proteinAnchors(proteinGeometry(`contact-b-${morphology}`, radius, 28, morphology), radius);
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;
    for (const side of ['left', 'right', 'top', 'bottom'] as const) {
      const offset = contactOffset(a, b, side);
      const facing = { x: b[opposite[side]].x + offset.x, y: b[opposite[side]].y + offset.y };
      expect(distance(a[side], facing)).toBeLessThanOrEqual(TOUCH);
      expect(contactOffset(a, b, side)).toEqual(offset);
    }
  });
});

describe('interaction kinds', () => {
  const points = [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 40, y: 0 }];
  it('keeps the default dotted relation unchanged', () => {
    expect(renderInteractionPrimitive(points)).toBe('<g class="mm-primitive mm-primitive--interaction"><path data-interaction="A:B" d="M0 0L40 0"/></g>');
  });
  it('adds an arrowhead for a directed relation', () => {
    const svg = renderInteractionPrimitive(points, { kind: 'directed' });
    expect(svg).toContain('mm-interaction--directed');
    expect(svg).toContain('<path data-interaction="A:B"');
    expect(svg).toContain('mm-interaction__head');
  });
  it('never draws a line for physical contact', () => {
    const svg = renderInteractionPrimitive(points, { kind: 'contact' });
    expect(svg).toContain('mm-interaction--contact');
    expect(svg).not.toContain('<path');
  });
});

describe('binding cards', () => {
  it.each(['bind', 'event-bind', 'dimerize', 'event-dimerize'])('%s: separate partners end up touching, without a dotted link', id => {
    const svg = renderVocabularyGlyph(id);
    const [a, b, boundA, boundB] = actors(svg);
    expect(gap(a!, b!)).toBeGreaterThan(8);
    expect(gap(boundA!, boundB!)).toBeLessThanOrEqual(TOUCH);
    expect(svg).toContain('mm-interaction--contact');
    expect(hasDottedLink(svg)).toBe(false);
  });

  it.each(['unbind', 'event-unbind'])('%s: touching partners end up separate', id => {
    const svg = renderVocabularyGlyph(id);
    const [a, b, freeA, freeB] = actors(svg);
    expect(gap(a!, b!)).toBeLessThanOrEqual(TOUCH);
    expect(gap(freeA!, freeB!)).toBeGreaterThan(8);
    expect(hasDottedLink(svg)).toBe(false);
  });

  it.each(['dimerize', 'event-dimerize'])('%s: shows two copies of the same protein as distinct actors', id => {
    const [, , a, b] = actors(renderVocabularyGlyph(id));
    expect(a!.seed).toBe(b!.seed);
    expect(a!.id).not.toBe(b!.id);
  });

  it.each(['recruit', 'event-recruit'])('%s: keeps a directed dotted relation and no contact', id => {
    const svg = renderVocabularyGlyph(id);
    expect(svg).toContain('mm-interaction--directed');
    expect(hasDottedLink(svg)).toBe(true);
    expect(svg).not.toContain('mm-interaction--contact');
  });

  it('complex: three distinct actors touch as one unit', () => {
    const svg = renderVocabularyGlyph('complex-abc');
    const members = actors(svg);
    expect(members.map(member => member.id).sort()).toEqual(['A', 'B', 'C']);
    expect(new Set(members.map(member => member.seed)).size).toBe(3);
    expect(new Set(members.map(member => member.morphology)).size).toBe(3);
    const [b, a, c] = members;
    expect(gap(b!, a!)).toBeLessThanOrEqual(TOUCH);
    expect(gap(a!, c!)).toBeLessThanOrEqual(TOUCH);
    expect(hasDottedLink(svg)).toBe(false);
  });
});
