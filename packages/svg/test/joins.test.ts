import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode, type MechanismDefinition } from '@molecular-motion/core';
import { parseMechanism } from '@molecular-motion/core/yaml';
import { buildSvgScene, describeScene, exportSvg, geometryFrame, interpolateGeometry, nucleicLayerMarkup, pairingGeometry, renderSvg, type SvgScene } from '../src';
import { coordinateMapOf } from '../src/coordinate-map';
import { JOIN, joinGeometry } from '../src/scene';

/**
 * Drawing covalent joins between molecules (ADR 0004). Material is drawn where its own molecule is; a
 * link draws what continues into what. The fixtures are the ADR's §7 list. Ids carry no meaning.
 */
const POINTS = [['t22', 22, 'top'], ['b22', 22, 'bottom'], ['t58', 58, 'top'], ['b58', 58, 'bottom']].map(([id, at, strand]) => ({ id, at, strand }));
const duplex = (id: string, extra: object = {}) => ({ id, type: 'dna', nucleic: { length: 80 }, sites: [...POINTS, { id: 'break', at: 40 }, { id: 'window', span: [22, 58] }], ...extra });
const compile = (actors: object[], steps: ActionNode[][], alignments: object[] = [{ id: 'sister', between: ['dna', 'sister'], range: [0, 80] }]) => compileMechanism({
  schemaVersion: 7, mechanism: { id: 'x', name: 'X' }, actors, alignments,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
} as unknown as MechanismDefinition);
const reconnect = (site: string): ActionNode => ({ type: 'reconnect-strands', target: `dna.${site}`, with: `sister.${site}` });
/** A double Holliday junction between 22 and 58: both strands of `dna` are drawn beside `sister` there. */
const junctions: ActionNode[] = [
  { type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'dna.break', length: 18 },
  { type: 'unwind', target: 'sister.window' }, { type: 'invade', target: 'dna', strand: 'top', span: [22, 40], with: 'sister' },
  { type: 'extend', target: 'dna.break', strand: 'top', length: 18 }, { type: 'pair', target: 'dna', strand: 'bottom', span: [40, 58], with: 'sister' },
  { type: 'extend', target: 'dna.break', strand: 'bottom', length: 18 }, { type: 'ligate', target: 'dna.break' },
];
const idle: ActionNode[] = [{ type: 'unwind', target: 'dna.break', length: 2 }, { type: 'anneal', target: 'dna.break' }];
const two = [duplex('dna'), duplex('sister')];
const CASES = {
  F1: () => compile(two, [idle, [reconnect('t22')]]),
  F2: () => compile(two, [idle, [reconnect('b58')]]),
  F3: () => compile(two, [idle, [reconnect('t22'), reconnect('t58')]]),
  F4a: () => compile(two, [junctions, [reconnect('t22'), reconnect('t58')]]),
  F4b: () => compile(two, [junctions, [reconnect('t22'), reconnect('b58')]]),
  F5: () => compile([duplex('dna'), duplex('sister', { initial: { nucleic: { excised: [{ from: 40, to: 50 }] } } })], [idle, [reconnect('t22')]]),
  F6: () => compile(['a', 'b'].map(id => ({ id, type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'p20', at: 20, strand: 'top' }, { id: 'p60', at: 60, strand: 'top' }] })),
    [[{ type: 'reconnect-strands', target: 'a.p20', with: 'b.p60' }, { type: 'reconnect-strands', target: 'a.p60', with: 'b.p20' }]],
    [{ id: 'one', a: { acid: 'a', span: [0, 40] }, b: { acid: 'b', span: [40, 80] } }, { id: 'two', a: { acid: 'a', span: [40, 80] }, b: { acid: 'b', span: [0, 40] } }]),
  topBreak: () => compile(two, [idle, [reconnect('t22'), { type: 'cleave', target: 'dna.t22' }]]),
  bottomBreak: () => compile(two, [idle, [reconnect('b22'), { type: 'cleave', target: 'dna.b22' }]]),
} as const;
type Case = keyof typeof CASES;
const last = (name: Case) => { const mechanism = CASES[name](); return buildSvgScene(mechanism.at(mechanism.length - 1)); };
const steps = (name: Case) => { const mechanism = CASES[name](); return Array.from({ length: mechanism.length }, (_, index) => buildSvgScene(mechanism.at(index))); };

const layer = (markup: string, name: string) => markup.match(new RegExp(`<g class="mm-layer" data-layer="${name}"[^>]*>([\\s\\S]*?)</g>(?=<g class="mm-layer"|</svg>)`))?.[1];
const links = (markup: string) => [...markup.matchAll(/<g class="mm-dna mm-join" data-key="join:([^"]+)"/g)].map(match => match[1]!.replace(/&gt;/g, ">"));
/** The 5′/3′ labels of one molecule's row: where each is, and on which strand's lane. */
const polarity = (scene: SvgScene, id: string) => {
  const acid = scene.nucleicAcids.find(item => item.id === id)!;
  const group = renderSvg(scene).match(new RegExp(`<g class="mm-dna__polarities" data-acid="${id}">(.*?)</g>`))![1]!;
  return [...group.matchAll(/x="([\d.-]+)" y="([\d.-]+)">([^<]+)</g)].map(([, x, y, label]) => ({ x: Number(x), strand: Number(y) < acid.y ? 'top' : 'bottom', label: label! }));
};
const boundaryX = (scene: SvgScene, id: string, at: number) => coordinateMapOf(scene.nucleicAcids.find(item => item.id === id)!, scene.width).place(at);

describe('links (ADR 0004 §5.1–5.5)', () => {
  it.each(['F1', 'F2', 'F3', 'F4a', 'F4b', 'F5', 'F6'] as const)('%s draws one link per directed join, in a layer of its own above the strands', name => {
    const scene = last(name);
    const markup = renderSvg(scene);
    expect(scene.joins!.length).toBeGreaterThan(0);
    expect(links(layer(markup, 'joins')!)).toEqual(scene.joins!.map(join => join.key));
    expect(new Set(scene.joins!.map(join => join.key)).size).toBe(scene.joins!.length);
    // Above the molecules and the strands drawn beside a partner, below what stands on them (§5.5).
    const order = [...markup.matchAll(/data-layer="([a-z]+)"/g)].map(match => match[1]);
    expect(order.indexOf('joins')).toBeGreaterThan(order.indexOf('acids'));
    if (order.includes('pairings')) expect(order.indexOf('joins')).toBeGreaterThan(order.indexOf('pairings'));
    expect(order.indexOf('joins')).toBeLessThan(order.indexOf('actors'));
  });

  it('ends a link where each stretch is drawn: on its own row, short of the boundary', () => {
    const scene = last('F1');
    const [dna, sister] = scene.nucleicAcids;
    for (const join of scene.joins!) {
      const { from, to } = joinGeometry(scene, join)!;
      expect(from.x).toBeCloseTo(boundaryX(scene, join.from.acid, 22) - JOIN.inset, 6);
      expect(to.x).toBeCloseTo(boundaryX(scene, join.to.acid, 22) + JOIN.inset, 6);
      // Each end is within its own molecule's helix, and the two are on different rows.
      const row = (id: string) => (id === 'dna' ? dna! : sister!).y;
      expect(Math.abs(from.y - row(join.from.acid))).toBeLessThanOrEqual(31);
      expect(Math.abs(to.y - row(join.to.acid))).toBeLessThanOrEqual(31);
    }
  });

  it('places an end through its own molecule\'s coordinate map when the other has an excised interval (F5)', () => {
    const [plain, excised] = [last('F1'), last('F5')];
    // The excision moves where sister draws 22, and leaves dna alone: material identity decides where.
    expect(boundaryX(excised, 'dna', 22)).toBe(boundaryX(plain, 'dna', 22));
    expect(boundaryX(excised, 'sister', 22)).not.toBe(boundaryX(plain, 'sister', 22));
    for (const join of excised.joins!) {
      const { from, to } = joinGeometry(excised, join)!;
      expect(from.x).toBeCloseTo(boundaryX(excised, join.from.acid, 22) - JOIN.inset, 6);
      expect(to.x).toBeCloseTo(boundaryX(excised, join.to.acid, 22) + JOIN.inset, 6);
    }
  });

  it('ends a link at the end of a stretch drawn beside its partner (F4b)', () => {
    const scene = last('F4b');
    const tips = scene.pairings.flatMap(pairing => pairing.segments).flatMap(segment => { const { points } = pairingGeometry(scene, segment)!; return [points[0]!, points.at(-1)!]; });
    const attached = scene.joins!.flatMap(join => { const { from, to } = joinGeometry(scene, join)!; return [from, to]; })
      .filter(end => tips.some(tip => Math.abs(tip.x - end.x) < 1e-6 && Math.abs(tip.y - end.y) < 1e-6));
    // Each junction joins one displaced stretch of dna to sister's row and sister's row back to dna's.
    expect(attached).toHaveLength(2);
  });

  it('draws nothing for a join whose molecule is not on screen, and says nothing about traversal', () => {
    const scene = last('F6');
    expect(scene.joins).toHaveLength(4);
    expect(JSON.stringify(scene)).not.toMatch(/circular|product/);
  });
});

describe('one visual continuation per stretch end (ADR 0004 §5.3–5.4)', () => {
  const ALL = ['F1', 'F2', 'F3', 'F4a', 'F4b', 'F5', 'F6', 'topBreak', 'bottomBreak'] as const;

  it.each(ALL)('%s: every nucleotide beside a joined boundary is continued by at most one link', name => {
    const scene = last(name);
    for (const acid of scene.nucleicAcids) for (const item of acid.joined ?? []) {
      const here = (point: { acid: string; strand: string; at: number }) => point.acid === acid.id && point.strand === item.strand && point.at === item.at;
      const leaving = scene.joins!.filter(join => here(join.from)), arriving = scene.joins!.filter(join => here(join.to));
      const [lower, higher] = item.strand === 'top' ? [leaving, arriving] : [arriving, leaving];
      for (const [side, joins] of [[0, lower], [1, higher]] as const) {
        expect(joins.length).toBeLessThanOrEqual(1);
        // A link, or an exposed end: never both, and a broken bond has no link.
        expect(joins.filter(join => !join.broken).length + Number(item.exposed[side])).toBeLessThanOrEqual(1);
      }
    }
  });

  it.each(ALL)('%s: the row backbone stops short of a joined boundary on the joined strand only', name => {
    const scene = last(name);
    const unjoined = buildSvgScene((() => { const mechanism = CASES[name](); const { joins: _joins, ...rest } = mechanism.at(mechanism.length - 1); return rest; })());
    // Same molecules, same places: only the drawing of the joined boundaries differs.
    expect(scene.nucleicAcids.map(acid => [acid.id, acid.y])).toEqual(unjoined.nucleicAcids.map(acid => [acid.id, acid.y]));
    expect(layer(renderSvg(scene), 'acids')).not.toBe(layer(renderSvg(unjoined), 'acids'));
  });

  it('suppresses the pairing ramp that a join has replaced (F4a, F4b)', () => {
    for (const name of ['F4a', 'F4b'] as const) {
      const scene = last(name);
      let suppressed = 0;
      for (const segment of scene.pairings.flatMap(pairing => pairing.segments)) {
        const stretch = scene.nucleicAcids.find(acid => acid.id === segment.traveller.acid)!.away!
          .find(range => range.strand === segment.traveller.strand && range.from === segment.traveller.from && range.to === segment.traveller.to)!;
        const [drawn, ramped] = [pairingGeometry(scene, segment)!.points, pairingGeometry(scene, segment, 1, 'own-row')!.points];
        const middle = drawn[Math.floor(drawn.length / 2)]!.y;
        for (const index of [0, 1] as const) {
          if (!stretch.joined?.[index]) continue;
          const [tip, rampTip] = index ? [drawn.at(-1)!, ramped.at(-1)!] : [drawn[0]!, ramped[0]!];
          // The joined end stays beside the partner: it does not ease back to its own row.
          expect(tip.y).toBeCloseTo(middle, 6);
          if (stretch.continues[index]) { expect(Math.abs(rampTip.y - middle)).toBeGreaterThan(20); suppressed += 1; }
        }
      }
      expect(suppressed).toBeGreaterThan(0);
    }
  });

  it('keeps the ramp of a stretch end that no join claims', () => {
    const mechanism = CASES.F4b();
    const before = buildSvgScene(mechanism.at(0));
    const ramps = (scene: SvgScene) => scene.pairings.flatMap(pairing => pairing.segments).flatMap(segment => {
      const { points } = pairingGeometry(scene, segment)!;
      const middle = points[Math.floor(points.length / 2)]!.y;
      return [points[0]!, points.at(-1)!].filter(tip => Math.abs(tip.y - middle) > 20).length;
    }).reduce((sum, count) => sum + count, 0);
    expect(ramps(before)).toBeGreaterThan(0);
    expect(ramps(last('F4b'))).toBeLessThan(ramps(before));
  });
});

describe('F4a and F4b: the same material, joined differently (ADR 0004 §7)', () => {
  it('are drawn differently, and only where the joins differ', () => {
    const [a, b] = [last('F4a'), last('F4b')];
    const [markupA, markupB] = [renderSvg(a), renderSvg(b)];
    expect(markupA).not.toBe(markupB);
    expect(layer(markupA, 'joins')).not.toBe(layer(markupB, 'joins'));
    expect(links(markupA)).not.toEqual(links(markupB));
    // The junction they share has the same two links; the other junction has none in common.
    const shared = links(markupA).filter(key => links(markupB).includes(key));
    expect(shared).toHaveLength(2);
    expect(shared.every(key => key.includes('top@22'))).toBe(true);
    // Material identity decides where: both draw every molecule on the same row.
    expect(a.nucleicAcids.map(acid => [acid.id, acid.y])).toEqual(b.nucleicAcids.map(acid => [acid.id, acid.y]));
    expect(describeScene(a)).not.toBe(describeScene(b));
  });
});

describe('a broken joined bond (ADR 0004 §5.6–5.7)', () => {
  const extra = (scene: SvgScene, id: string) => {
    const ends = polarity(scene, id);
    // A whole duplex labels its four ends; anything else is an end the break exposed.
    return ends.filter(end => end.x > 30 && end.x < scene.width - 30);
  };

  it('on top: no link, a 3′ end on the source and a 5′ end on the destination, each where its material is', () => {
    const scene = last('topBreak');
    const broken = scene.joins!.filter(join => join.broken);
    expect(broken.map(join => join.key)).toEqual(['dna.top@22>sister.top@22']);
    expect(links(renderSvg(scene))).toEqual(['sister.top@22>dna.top@22']);
    const [source, destination] = [extra(scene, 'dna'), extra(scene, 'sister')];
    expect(source).toEqual([expect.objectContaining({ strand: 'top', label: '3′' })]);
    expect(source[0]!.x).toBeLessThan(boundaryX(scene, 'dna', 22));
    expect(destination).toEqual([expect.objectContaining({ strand: 'top', label: '5′' })]);
    expect(destination[0]!.x).toBeGreaterThan(boundaryX(scene, 'sister', 22));
  });

  it('on bottom: no link, a 3′ end on the source and a 5′ end on the destination, each where its material is', () => {
    const scene = last('bottomBreak');
    const broken = scene.joins!.filter(join => join.broken);
    // On bottom the nucleotide before the site is the destination: the bond named is the one arriving.
    expect(broken.map(join => join.key)).toEqual(['sister.bottom@22>dna.bottom@22']);
    expect(links(renderSvg(scene))).toEqual(['dna.bottom@22>sister.bottom@22']);
    const [destination, source] = [extra(scene, 'dna'), extra(scene, 'sister')];
    expect(source).toEqual([expect.objectContaining({ strand: 'bottom', label: '3′' })]);
    expect(source[0]!.x).toBeGreaterThan(boundaryX(scene, 'sister', 22));
    expect(destination).toEqual([expect.objectContaining({ strand: 'bottom', label: '5′' })]);
    expect(destination[0]!.x).toBeLessThan(boundaryX(scene, 'dna', 22));
  });

  it.each(['F1', 'F2', 'F3'] as const)('%s: an unbroken join exposes no end', name => {
    const scene = last(name);
    expect(extra(scene, 'dna')).toEqual([]);
    expect(extra(scene, 'sister')).toEqual([]);
  });

  it('says so in the description', () => {
    expect(describeScene(last('topBreak'))).toContain('dna top strand was joined to sister top strand at 22, and that bond is broken');
    expect(describeScene(last('F1'))).toContain('dna top strand continues as sister top strand at 22. sister top strand continues as dna top strand at 22.');
  });
});

describe('a document without joins (ADR 0004 §5.11)', () => {
  it('has no joins in its scene, its frames or its markup', () => {
    for (const scene of steps('F4b').slice(0, 1)) {
      expect('joins' in scene).toBe(false);
      expect('joins' in geometryFrame(scene)).toBe(false);
      expect(scene.nucleicAcids.every(acid => !('joined' in acid) && (acid.away ?? []).every(range => !('joined' in range)))).toBe(true);
      const markup = renderSvg(scene);
      expect(markup).not.toContain('data-layer="joins"');
      expect(markup).not.toMatch(/mm-join|mm-dna__fading|mm-dna__continuation/);
      expect(Object.keys(nucleicLayerMarkup(geometryFrame(scene), 'p'))).toEqual(['acids', 'pairings', 'joins']);
      expect(nucleicLayerMarkup(geometryFrame(scene), 'p').joins).toBe('');
      expect(describeScene(scene)).not.toContain('Joins:');
    }
  });

  it('is drawn as it was before a transition between two of its steps', () => {
    const [before] = steps('F4b');
    const frame = interpolateGeometry(geometryFrame(before!), geometryFrame(before!), .5);
    expect('joins' in frame).toBe(false);
    expect(JSON.stringify(nucleicLayerMarkup(frame, 'p'))).toBe(JSON.stringify(nucleicLayerMarkup(geometryFrame(before!), 'p')));
  });
});

describe('transitions (ADR 0004 §6)', () => {
  const markup = (frame: Parameters<typeof nucleicLayerMarkup>[0]) => JSON.stringify(nucleicLayerMarkup(frame, 'p'));

  it.each(['F1', 'F2', 'F3', 'F4a', 'F4b', 'F5'] as const)('%s: a completed transition is the clean render of the step it ends on', name => {
    const [before, after] = steps(name).slice(-2).map(geometryFrame);
    for (const [from, to] of [[before!, after!], [after!, before!]] as const) {
      const settled = markup(to);
      expect(markup(interpolateGeometry(from, to, 1))).toBe(settled);
      // Just short of the end the cross-fade has already let go: nothing half-drawn is left behind.
      const nearly = markup(interpolateGeometry(from, to, 1 - 1e-9));
      expect(nearly).toBe(settled);
      expect(settled).not.toMatch(/mm-dna__fading|mm-dna__continuation|mm-join[^>]*opacity/);
    }
    expect(markup(interpolateGeometry(before!, after!, 0))).toBe(markup(before!));
  });

  it('cross-fades: one share per directed join, the old continuation at the complement', () => {
    const [before, after] = steps('F4b').slice(-2).map(geometryFrame);
    for (const t of [.25, .5, .75]) {
      const frame = interpolateGeometry(before!, after!, t);
      expect(frame.joins!.map(join => join.share)).toEqual(after!.joins!.map(() => t));
      const drawn = nucleicLayerMarkup(frame, 'p');
      expect([...drawn.joins.matchAll(/mm-join"[^>]*opacity="([\d.]+)"/g)].map(match => Number(match[1]))).toEqual(after!.joins!.map(() => t));
      expect([...drawn.acids.matchAll(/mm-dna__continuation" opacity="([\d.]+)"/g)].map(match => Number(match[1])).every(opacity => Math.abs(opacity - (1 - t)) < 1e-6)).toBe(true);
      const fading = [...drawn.pairings.matchAll(/mm-dna__fading" opacity="([\d.]+)"/g)].map(match => Number(match[1]));
      expect(fading.length).toBeGreaterThan(0);
      expect(fading.every(opacity => Math.abs(opacity - t) < 1e-6 || Math.abs(opacity - (1 - t)) < 1e-6)).toBe(true);
    }
  });

  it('leaves a join that both steps have at full strength', () => {
    const mechanism = compile(two, [[reconnect('t22')], [reconnect('t58')]]);
    const [before, after] = [0, 1].map(index => geometryFrame(buildSvgScene(mechanism.at(index))));
    const frame = interpolateGeometry(before!, after!, .5);
    expect(frame.joins!.filter(join => join.key.includes('@22')).map(join => join.share)).toEqual([undefined, undefined]);
    expect(frame.joins!.filter(join => join.key.includes('@58')).map(join => join.share)).toEqual([.5, .5]);
  });

  it('moves nothing: every molecule is where its own material is throughout', () => {
    const [before, after] = steps('F4b').slice(-2).map(geometryFrame);
    for (const t of [0, .3, .6, 1]) expect(interpolateGeometry(before!, after!, t).nucleicAcids.map(acid => acid.y)).toEqual(after!.nucleicAcids.map(acid => acid.y));
  });
});

describe('the public double Holliday junction example', () => {
  const example = readFileSync(new URL('../../../examples/double-holliday-junction.yaml', import.meta.url), 'utf8');

  it('reconnects strands, and draws a link for each join from the step that makes them', () => {
    expect(example).toContain('type: reconnect-strands');
    const mechanism = compileMechanism(parseMechanism(example));
    const drawn = Array.from({ length: mechanism.length }, (_, index) => links(renderSvg(buildSvgScene(mechanism.at(index)))).length);
    expect(drawn.slice(0, -1).every(count => count === 0)).toBe(true);
    expect(drawn.at(-1)).toBe(4);
    // Different strands at the two junctions: a crossover.
    const strands = (buildSvgScene(mechanism.at(mechanism.length - 1)).joins ?? []).map(join => `${join.from.strand}@${join.from.at}`);
    expect([...new Set(strands)].sort()).toEqual(['bottom@58', 'top@22']);
  });

  it('is drawn in both themes and at a phone size, with every link inside the canvas', () => {
    const mechanism = compileMechanism(parseMechanism(example));
    const snapshot = mechanism.at(mechanism.length - 1);
    for (const size of [{}, { width: 520, height: 600 }]) {
      const scene = buildSvgScene(snapshot, size);
      for (const join of scene.joins!) {
        const { from, to } = joinGeometry(scene, join)!;
        for (const point of [from, to]) { expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(scene.width); expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(scene.height); }
      }
      for (const theme of ['light', 'dark'] as const) expect(links(exportSvg(scene, { theme }))).toHaveLength(4);
    }
  });
});

describe('the double Holliday junction fixture (RFC 0008)', () => {
  const source = readFileSync(new URL('../../core/test/fixtures/v7/double-holliday-junction.yaml', import.meta.url), 'utf8');

  it('renders every step and every transition, and draws its joins once they exist', () => {
    const mechanism = compileMechanism(parseMechanism(source));
    for (let index = 0; index < mechanism.length; index += 1) {
      const snapshot = mechanism.at(index);
      const scene = buildSvgScene(snapshot);
      expect(renderSvg(scene)).toMatch(/^<svg[\s\S]*<\/svg>\s*$/);
      expect(renderSvg(scene, { compact: true })).toContain('<svg');
      expect(links(renderSvg(scene))).toHaveLength(Object.values(snapshot.joins ?? {}).flat().length);
      if (index > 0) for (const t of [.25, .5, .75]) expect(() => nucleicLayerMarkup(interpolateGeometry(geometryFrame(buildSvgScene(mechanism.at(index - 1))), geometryFrame(scene), t), 'p')).not.toThrow();
    }
    const resolved = buildSvgScene(mechanism.at('resolution'));
    expect(resolved.joins).toHaveLength(4);
    expect(describeScene(resolved)).toContain('Joins: Broken chromatid top strand continues as Sister chromatid top strand at 22.');
  });
});
