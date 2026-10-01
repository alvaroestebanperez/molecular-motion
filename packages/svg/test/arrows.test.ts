import { describe, expect, it, vi } from 'vitest';
import {
  actionArrowGeometry, autoArrowCurvature, proteinGeometry, proteinOutlineWidth, renderActionArrow, renderActionVisual, renderInteractionPrimitive, renderVocabularyGlyph,
  type ActionArrowOptions,
} from '../src';
import { actionCss } from '../src/primitives';

type P = { x: number; y: number };
const numbers = (path: string) => (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
const points = (path: string): P[] => { const n = numbers(path); return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i]!, y: n[2 * i + 1]! })); };
const angle = (v: P) => Math.atan2(v.y, v.x);
const degrees = (a: number) => Math.abs(((a * 180 / Math.PI) + 540) % 360 - 180);
const distance = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
/** Signed distance of p from the line through a and b. */
const offLine = (p: P, a: P, b: P) => ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / distance(a, b);

const CASES: [string, P, P, ActionArrowOptions][] = [
  ['short horizontal', { x: 0, y: 0 }, { x: 30, y: 0 }, {}],
  ['long horizontal', { x: 0, y: 0 }, { x: 160, y: 0 }, {}],
  ['vertical', { x: 50, y: 0 }, { x: 50, y: 90 }, {}],
  ['diagonal with gaps', { x: 10, y: 20 }, { x: 120, y: 110 }, { startGap: 12, endGap: 18 }],
  ['strong explicit bend', { x: 0, y: 0 }, { x: 100, y: 0 }, { curvature: 25 }],
  ['reversed', { x: 0, y: 0 }, { x: 140, y: 30 }, { reverse: true }],
];

describe('action arrow geometry', () => {
  it.each(CASES)('%s: the head is oriented along the shaft’s end tangent', (_, from, to, options) => {
    const g = actionArrowGeometry(from, to, options);
    const [, , c2, c3] = points(g.shaft);
    const [tip, , notch] = points(g.head);
    const shaftTangent = { x: c3!.x - c2!.x, y: c3!.y - c2!.y };
    const headAxis = { x: tip!.x - notch!.x, y: tip!.y - notch!.y };
    expect(degrees(angle(headAxis) - angle(shaftTangent))).toBeLessThan(1);
    expect(degrees(angle(g.tangent) - angle(shaftTangent))).toBeLessThan(1);
  });

  it.each(CASES)('%s: the shaft ends inside the head, on its axis, so no seam or gap shows', (_, from, to, options) => {
    const g = actionArrowGeometry(from, to, options);
    const end = points(g.shaft)[3]!;
    const [tip, wingA, notch, wingB] = points(g.head);
    expect(Math.abs(offLine(end, notch!, tip!))).toBeLessThan(.05);
    // Past the notch (inside the solid head) but behind the tip.
    expect(distance(end, tip!)).toBeLessThan(distance(notch!, tip!));
    expect(distance(end, tip!)).toBeGreaterThan(1);
    // Constant head: same length and width whatever the arrow.
    expect(distance(tip!, { x: (wingA!.x + wingB!.x) / 2, y: (wingA!.y + wingB!.y) / 2 })).toBeCloseTo(9, 1);
    expect(distance(wingA!, wingB!)).toBeCloseTo(8.8, 1);
  });

  it('is deterministic and never consults Math.random', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('global randomness used'); });
    for (const [, from, to, options] of CASES) {
      expect(renderActionArrow(from, to, { ...options, variant: 'dashed', mark: 'cross' })).toBe(renderActionArrow(from, to, { ...options, variant: 'dashed', mark: 'cross' }));
    }
    for (const id of ['event-bind', 'event-recruit', 'event-inhibit', 'event-cleave', 'kinase', 'protease', 'test-translocation']) {
      expect(renderVocabularyGlyph(id)).toBe(renderVocabularyGlyph(id));
    }
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });

  it('is nearly straight when short and only gently curved when long', () => {
    expect(autoArrowCurvature(30)).toBe(0);
    const short = actionArrowGeometry({ x: 0, y: 0 }, { x: 36, y: 0 });
    for (const p of points(short.shaft)) expect(p.y).toBe(0);
    const long = actionArrowGeometry({ x: 0, y: 0 }, { x: 180, y: 0 });
    const lift = Math.min(...points(long.shaft).map(p => p.y));
    expect(lift).toBeLessThan(-4); // bends up…
    expect(lift).toBeGreaterThan(-12); // …but only slightly.
  });

  it('keeps the requested clearance from both actors', () => {
    const from = { x: 0, y: 0 }; const to = { x: 100, y: 0 };
    const g = actionArrowGeometry(from, to, { startGap: 15, endGap: 20, curvature: 0 });
    expect(points(g.shaft)[0]).toEqual({ x: 15, y: 0 });
    expect(distance(g.tip, to)).toBeCloseTo(20, 1);
    // Gaps larger than the distance shrink together instead of inverting the arrow.
    const tight = actionArrowGeometry(from, { x: 20, y: 0 }, { startGap: 30, endGap: 30 });
    expect(tight.tip.x).toBeGreaterThan(points(tight.shaft)[0]!.x);
  });

  it('reverses the direction without moving the path', () => {
    const from = { x: 0, y: 0 }; const to = { x: 120, y: 0 };
    const forward = actionArrowGeometry(from, to, { end: 'none' }); const back = actionArrowGeometry(from, to, { end: 'none', reverse: true });
    expect(points(back.shaft).reverse()).toEqual(points(forward.shaft));
    const pointed = actionArrowGeometry(from, to, { reverse: true });
    expect(distance(pointed.tip, from)).toBeLessThan(1);
    expect(pointed.tangent.x).toBeLessThan(0);
  });

  it('fits whole dashes on the dashed variant', () => {
    const g = actionArrowGeometry({ x: 0, y: 0 }, { x: 130, y: 20 }, { variant: 'dashed' });
    const [dash, gap] = g.dash!;
    const n = Math.round((g.length + gap) / (dash + gap));
    expect(n * dash + (n - 1) * gap).toBeCloseTo(g.length, 0);
    expect(renderActionArrow({ x: 0, y: 0 }, { x: 130, y: 20 })).not.toContain('stroke-dasharray');
  });

  it('draws the bar end perpendicular to the end tangent', () => {
    const g = actionArrowGeometry({ x: 0, y: 0 }, { x: 120, y: 30 }, { end: 'bar' });
    const [a, b] = points(g.head);
    const bar = { x: b!.x - a!.x, y: b!.y - a!.y };
    expect(Math.abs(bar.x * g.tangent.x + bar.y * g.tangent.y) / Math.hypot(bar.x, bar.y)).toBeLessThan(.01);
  });
});

describe('catalogue arrows', () => {
  /** Inside a protein's visible outline (outline margin plus `slack`) at (cx, cy). */
  const inside = (seed: string, radius: number, cx: number, cy: number, p: P, slack = 1) => proteinGeometry(seed, radius).some(s => {
    const t = s.rotation * Math.PI / 180; const dx = p.x - cx - s.x; const dy = p.y - cy - s.y;
    const u = dx * Math.cos(t) + dy * Math.sin(t); const v = -dx * Math.sin(t) + dy * Math.cos(t);
    const m = proteinOutlineWidth(radius) + slack;
    return (u / (s.rx + m)) ** 2 + (v / (s.ry + m)) ** 2 <= 1;
  });
  /** Every point of the card's arrow: the sampled shaft and the head's vertices. */
  const arrowPoints = (svg: string) => {
    const [p0, p1, p2, p3] = points(/class="mm-action__shaft" d="([^"]+)"/.exec(svg)![1]!);
    const shaft = Array.from({ length: 41 }, (_, i) => { const t = i / 40; const s = 1 - t; return {
      x: s ** 3 * p0!.x + 3 * s * s * t * p1!.x + 3 * s * t * t * p2!.x + t ** 3 * p3!.x,
      y: s ** 3 * p0!.y + 3 * s * s * t * p1!.y + 3 * s * t * t * p2!.y + t ** 3 * p3!.y }; });
    const head = /class="mm-action__(?:head|bar)" d="([^"]+)"/.exec(svg);
    return [...shaft, ...(head ? points(head[1]!) : [])];
  };
  const ACTORS: [string, [string, number, number, number][]][] = [
    ['event-phosphorylate', [['event-actor', 29, 62, 108], ['event-actor', 29, 238, 108]]],
    ['event-conformational-change', [['event-actor', 29, 62, 108], ['event-actor', 29, 238, 108]]],
    ['event-polymerize', [['event-actor', 29, 72, 108], ['event-actor', 29, 215, 108]]],
    ['event-translocate', [['event-actor', 24, 150, 52], ['event-actor', 24, 150, 140]]],
    ['kinase', [['kinase-substrate', 24, 55, 128], ['kinase', 37, 150, 68], ['kinase-substrate', 24, 245, 128]]],
    ['test-translocation', [['IRF3', 27, 150, 52], ['IRF3', 27, 150, 140]]],
    ['proteasome', [['target', 25, 55, 67], ['proteasome', 48, 150, 110]]],
    ['ligase', [['ligase', 37, 150, 68]]],
  ];
  it.each(ACTORS)('%s: the arrow never enters an actor', (id, actors) => {
    const arrow = arrowPoints(renderVocabularyGlyph(id));
    for (const [seed, radius, x, y] of actors) for (const p of arrow) expect(inside(seed, radius, x, y, p), `${seed} at ${p.x},${p.y}`).toBe(false);
  });
  it('event-inhibit: the bar stays outside the inhibition ring', () => {
    for (const p of arrowPoints(renderVocabularyGlyph('event-inhibit'))) expect(Math.hypot(p.x - 238, p.y - 108)).toBeGreaterThan(29 + 8 + 1);
  });
});

describe('action arrow markup', () => {
  it('keeps the kind-based API, mapping kinds onto generic styles', () => {
    const from = { x: 0, y: 0 }; const to = { x: 120, y: 0 };
    expect(renderActionVisual('modify', from, to)).toContain('mm-action--modify');
    expect(renderActionVisual('modify', from, to)).toContain('mm-action__head');
    expect(renderActionVisual('recruit', from, to)).not.toContain('mm-action--dashed');
    expect(renderActionVisual('inhibit', from, to)).toContain('mm-action__bar');
    expect(renderActionVisual('cleave', from, to)).toContain('mm-action__mark');
    expect(renderActionVisual('bind', from, to, { reverse: true })).toBe(renderActionArrow(from, to, { reverse: true, className: 'mm-action--bind' }));
  });

  it('recruit: solid motion arrow, the dashed directed relation is the only dashed cue', () => {
    for (const id of ['recruit', 'event-recruit']) {
      // Markup only: the inlined <style> block mentions every class name.
      const svg = renderVocabularyGlyph(id, { idPrefix: id }).replace(/<style>[\s\S]*?<\/style>/, '');
      const motion = svg.match(/<g class="mm-action [^"]*mm-action--recruit[^"]*"/g) ?? [];
      expect(motion).toHaveLength(1);
      expect(motion[0]).not.toContain('mm-action--dashed');
      expect(svg.match(/mm-interaction--directed/g)).toHaveLength(1);
      expect(svg).not.toContain('mm-action--dashed');
    }
  });

  it('inhibit: a T-bar terminal, never a cross', () => {
    const svg = renderVocabularyGlyph('event-inhibit', { idPrefix: 'event-inhibit' }).replace(/<style>[\s\S]*?<\/style>/, '');
    expect(svg).toContain('mm-action__bar');
    expect(svg).not.toContain('mm-action__mark');
    expect(svg).not.toContain('mm-action__head');
  });

  it('is animable, and reduced motion leaves the finished arrow', () => {
    const svg = renderActionArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, { draw: true });
    expect(svg).toContain('mm-action--draw');
    expect(svg).toContain('pathLength="1"');
    expect(actionCss).toMatch(/prefers-reduced-motion:reduce\)\{\.mm-action \*\{animation:none!important\}/);
    // The draw keyframes end on the complete stroke.
    expect(actionCss).toContain('to{stroke-dashoffset:0}');
  });

  it('gives directed relations the same arrowhead as action arrows', () => {
    const relation = renderInteractionPrimitive([{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 80, y: 0 }], { kind: 'directed' });
    const arrow = actionArrowGeometry({ x: 0, y: 0 }, { x: 80, y: 0 }, { variant: 'dashed', curvature: 0 });
    expect(relation).toContain(`class="mm-interaction__head" d="${arrow.head}"`);
    expect(relation).toContain(`d="${arrow.shaft}"`);
  });
});
