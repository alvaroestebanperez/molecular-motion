import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, geometryFrame, interpolateGeometry, nucleicLayerMarkup, pairingGeometry, type GeometryFrame } from '../src';
import { helixY } from '../src/scene';

/** Two aligned duplexes, with nicks on either strand. Ids carry no meaning. */
const frames = (steps: ActionNode[][]): GeometryFrame[] => {
  const mechanism = compileMechanism({
    schemaVersion: 5, mechanism: { id: 'x', name: 'X' },
    actors: [
      { id: 'upper', type: 'dna', nucleic: { length: 80 }, sites: [
        { id: 'break', at: 40 }, { id: 'right', span: [40, 58] }, { id: 'left', span: [22, 40] },
        { id: 'top-nick', at: 10, strand: 'top' }, { id: 'bottom-nick', at: 70, strand: 'bottom' },
      ] },
      { id: 'lower', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'facing', span: [40, 58] }, { id: 'ahead', span: [22, 40] }] },
    ],
    alignments: [{ id: 'pair', between: ['upper', 'lower'], range: [0, 80] }],
    steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
  });
  return steps.map((_, index) => geometryFrame(buildSvgScene(mechanism.at(index))));
};
const cut: ActionNode = { type: 'cleave', target: 'upper.break', lesion: 'double-strand-break' };
const resect: ActionNode = { type: 'resect', target: 'upper.break', length: 18 };
const open: ActionNode = { type: 'unwind', target: 'lower.facing' };
const pair: ActionNode = { type: 'pair', target: 'upper.right', with: 'lower' };
const grow: ActionNode[] = [{ type: 'unwind', target: 'lower.ahead' }, { type: 'extend', target: 'upper.break', strand: 'bottom', length: 18 }];
const ranges = (frame: GeometryFrame, acid: string, kind: 'missing' | 'nascent') => (frame.nucleicAcids.find(item => item.id === acid)![kind] ?? []).map(range => `${range.strand} ${range.from}–${range.to}`);
const bubbles = (frame: GeometryFrame, acid: string) => (frame.nucleicAcids.find(item => item.id === acid)!.open ?? []).map(range => `${range.from}–${range.to}`);
const markup = (frame: GeometryFrame) => JSON.stringify(nucleicLayerMarkup(frame, 'p'));

describe('a frame between two geometries (ADR 0001 §3.1)', () => {
  it('is the origin at t = 0 and the destination at t = 1, value for value', () => {
    const [a, b] = frames([[cut, resect, open], [pair]]) as [GeometryFrame, GeometryFrame];
    expect(interpolateGeometry(a, b, 0)).toBe(a);
    expect(interpolateGeometry(a, b, 1)).toBe(b);
    expect(interpolateGeometry(a, b, -1)).toBe(a);
    expect(interpolateGeometry(a, b, 2)).toBe(b);
  });

  it('draws what does not change identically in every frame', () => {
    const [a, b] = frames([[cut, resect, open], [pair]]) as [GeometryFrame, GeometryFrame];
    for (const t of [.1, .5, .9]) {
      const lower = interpolateGeometry(a, b, t).nucleicAcids.find(acid => acid.id === 'lower')!;
      expect(lower).toEqual(b.nucleicAcids.find(acid => acid.id === 'lower'));
    }
  });
});

describe('fronts (ADR 0001 §4.1–4.2)', () => {
  it('grows a chain 5′→3′ by extension of its 3′ end: top from its lower coordinate, bottom from its higher one', () => {
    const [topGap, topFilled] = frames([[{ type: 'cleave', target: 'upper.top-nick' }, { type: 'resect', target: 'upper.top-nick', length: 6 }], [{ type: 'extend', target: 'upper.top-nick', length: 6 }]]);
    const top = interpolateGeometry(topGap!, topFilled!, .5);
    // top runs 5′→3′ with increasing coordinate: the tract 10–16 has reached 13, and 13–16 is still a gap.
    expect(ranges(top, 'upper', 'nascent')).toEqual(['top 10–13']);
    expect(ranges(top, 'upper', 'missing')).toEqual(['top 13–16']);
    const [bottomGap, bottomFilled] = frames([[{ type: 'cleave', target: 'upper.bottom-nick' }, { type: 'resect', target: 'upper.bottom-nick', length: 6 }], [{ type: 'extend', target: 'upper.bottom-nick', length: 6 }]]);
    const bottom = interpolateGeometry(bottomGap!, bottomFilled!, .5);
    // bottom runs 5′→3′ with decreasing coordinate: the tract 64–70 starts at 70 and has reached 67.
    expect(ranges(bottom, 'upper', 'nascent')).toEqual(['bottom 67–70']);
    expect(ranges(bottom, 'upper', 'missing')).toEqual(['bottom 64–67']);
    // Going back, the tract retracts 3′ end first: the same frames in reverse.
    expect(ranges(interpolateGeometry(topFilled!, topGap!, .5), 'upper', 'nascent')).toEqual(['top 10–13']);
    expect(ranges(interpolateGeometry(bottomFilled!, bottomGap!, .5), 'upper', 'nascent')).toEqual(['bottom 67–70']);
  });

  it('never shortens a growing tract', () => {
    const [gap, filled] = frames([[{ type: 'cleave', target: 'upper.top-nick' }, { type: 'resect', target: 'upper.top-nick', length: 6 }], [{ type: 'extend', target: 'upper.top-nick', length: 6 }]]);
    const lengths = [0, .1, .25, .5, .75, .9, 1].map(t => (interpolateGeometry(gap!, filled!, t).nucleicAcids[0]!.nascent ?? []).reduce((sum, range) => sum + range.to - range.from, 0));
    expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
    expect(lengths[0]).toBe(0);
    expect(lengths.at(-1)).toBe(6);
  });

  it('opens a gap from the break, where the strand already ends', () => {
    const [broken, resected] = frames([[cut], [resect]]);
    const half = interpolateGeometry(broken!, resected!, .5);
    expect(ranges(half, 'upper', 'missing')).toEqual(['top 40–49', 'bottom 31–40']);
    // And closes it towards the break when the change is undone: from the strand that is there.
    expect(ranges(interpolateGeometry(resected!, broken!, .25), 'upper', 'missing')).toEqual(['top 40–53.5', 'bottom 26.5–40']);
  });

  it('opens an isolated bubble from its middle, extends one from its edge, and closes it from both ends', () => {
    const [closed, opened, extended] = frames([[cut], [open], [{ type: 'unwind', target: 'lower.ahead' }]]);
    expect(bubbles(interpolateGeometry(closed!, opened!, .5), 'lower')).toEqual(['44.5–53.5']);
    expect(bubbles(interpolateGeometry(opened!, extended!, .5), 'lower')).toEqual(['31–58']);
    expect(bubbles(interpolateGeometry(opened!, closed!, .5), 'lower')).toEqual(['44.5–53.5']);
  });
});

describe('a strand between its own molecule and a pairing (ADR 0001 §4.3)', () => {
  const [unpaired, paired, grown] = frames([[cut, resect, open], [pair], grow]) as [GeometryFrame, GeometryFrame, GeometryFrame];

  it('moves every point on a straight line from its own line to its place', () => {
    const half = interpolateGeometry(unpaired, paired, .5);
    expect(half.pairings).toEqual([{ key: 'lower.top~upper.bottom', segments: [{ traveller: { acid: 'upper', strand: 'bottom', from: 40, to: 58 }, host: { acid: 'lower', strand: 'top', from: 40, to: 58 }, travel: .5 }] }]);
    const segment = half.pairings[0]!.segments[0]!;
    const [there, midway] = [pairingGeometry(paired, segment, 1)!, pairingGeometry(half, segment, segment.travel)!];
    const upper = half.nucleicAcids[0]!;
    // A point well inside the stretch is exactly half-way between where its molecule draws it and its place.
    const index = 10;
    const home = helixY(upper, 1, midway.points[index]!.x, 960);
    expect(midway.points[index]!.y).toBeCloseTo((home + there.points[index]!.y) / 2, 6);
    // Base pairs are drawn only once the strand has arrived.
    expect(midway.rungs).toEqual([]);
    expect(there.rungs.length).toBeGreaterThan(5);
  });

  it('is not a pairing on screen before it leaves or after it is back', () => {
    expect(interpolateGeometry(unpaired, paired, 0).pairings).toEqual([]);
    expect(interpolateGeometry(paired, unpaired, .75).pairings[0]!.segments[0]!.travel).toBe(.25);
    expect(interpolateGeometry(paired, unpaired, 1).pairings).toEqual([]);
  });

  it('prolongs a pairing that grows: the shared stretch stays, the end advances with the new nucleotides', () => {
    const half = interpolateGeometry(paired, grown, .5);
    expect(half.pairings[0]!.segments).toEqual([{ traveller: { acid: 'upper', strand: 'bottom', from: 31, to: 58 }, host: { acid: 'lower', strand: 'top', from: 31, to: 58 }, travel: 1 }]);
    expect(ranges(half, 'upper', 'nascent')).toEqual(['bottom 31–40']);
    // Where the strand has not arrived yet it is still missing, so its end is free and drawn as an end.
    expect(half.nucleicAcids[0]!.away).toMatchObject([{ strand: 'bottom', from: 31, to: 58, continues: [false, true] }]);
    // The part that was already paired is drawn at the same place in every frame.
    const settled = (frame: GeometryFrame) => pairingGeometry(frame, frame.pairings[0]!.segments[0]!, 1)!.points.filter(point => point.x > 520 && point.x < 620).map(point => point.y);
    expect(settled(half)[0]).toBeCloseTo(settled(paired)[0]!);
    expect(settled(half)[0]).toBeCloseTo(settled(grown)[0]!);
  });
});

describe('interruption (ADR 0001 §3.1)', () => {
  const [unpaired, paired, grown] = frames([[cut, resect, open], [pair], grow]) as [GeometryFrame, GeometryFrame, GeometryFrame];

  it('starts the next transition from the frame on screen, exactly', () => {
    const shown = interpolateGeometry(paired, grown, .37);
    const first = interpolateGeometry(shown, unpaired, 0);
    expect(first).toBe(shown);
    expect(markup(first)).toBe(markup(shown));
    // …and gets to the new destination.
    expect(interpolateGeometry(shown, unpaired, 1)).toBe(unpaired);
  });

  it('continues from intermediate values instead of restarting', () => {
    const shown = interpolateGeometry(unpaired, paired, .4);
    // Caught 40 % of the way in, the strand goes back from there…
    expect(interpolateGeometry(shown, unpaired, .5).pairings[0]!.segments[0]!.travel).toBeCloseTo(.2);
    // …or on to its place, without passing through 0 or jumping to 1.
    expect(interpolateGeometry(shown, paired, .5).pairings[0]!.segments[0]!.travel).toBeCloseTo(.7);
    const growing = interpolateGeometry(paired, grown, .5);
    expect(ranges(interpolateGeometry(growing, paired, .5), 'upper', 'nascent')).toEqual(['bottom 35.5–40']);
    expect(ranges(interpolateGeometry(growing, grown, .5), 'upper', 'nascent')).toEqual(['bottom 26.5–40']);
  });

  it('has no jump just after the interruption either', () => {
    const shown = interpolateGeometry(paired, grown, .37);
    const next = interpolateGeometry(shown, unpaired, 1e-4);
    const length = (frame: GeometryFrame) => (frame.nucleicAcids[0]!.nascent ?? []).reduce((sum, range) => sum + range.to - range.from, 0);
    expect(Math.abs(length(next) - length(shown))).toBeLessThan(.01);
    expect(next.pairings[0]!.segments[0]!.travel).toBeCloseTo(1, 3);
  });
});

describe('no knowledge of actions', () => {
  it('takes two frames and a number, nothing else', () => {
    expect(interpolateGeometry.length).toBe(3);
  });

  it('animates the same pair of states the same way, whatever actions produced them', () => {
    const nick: ActionNode = { type: 'cleave', target: 'upper.top-nick' };
    const once = frames([[nick, { type: 'resect', target: 'upper.top-nick', length: 6 }], [{ type: 'extend', target: 'upper.top-nick', length: 6 }]]);
    const twice = frames([
      [nick, { type: 'resect', target: 'upper.top-nick', length: 2 }, { type: 'resect', target: 'upper.top-nick', length: 4 }],
      [{ type: 'extend', target: 'upper.top-nick', length: 1 }, { type: 'extend', target: 'upper.top-nick', length: 5 }],
    ]);
    for (const t of [.2, .5, .8]) expect(interpolateGeometry(twice[0]!, twice[1]!, t)).toEqual(interpolateGeometry(once[0]!, once[1]!, t));
    // Pairing and then unpairing a different way round reaches the same two states too.
    const forward = frames([[cut, resect, open], [pair]]);
    const viaAlias = frames([[cut, { type: 'resect', target: 'upper.break', length: 6 }, { type: 'resect', target: 'upper.break', length: 12 }, open], [{ type: 'invade', target: 'upper.right', with: 'lower' }]]);
    expect(interpolateGeometry(viaAlias[0]!, viaAlias[1]!, .5)).toEqual(interpolateGeometry(forward[0]!, forward[1]!, .5));
  });

  it('keeps actions, timelines and steps out of the animation modules', () => {
    for (const file of ['packages/svg/src/frame.ts', 'packages/react/src/animate.ts']) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(source, file).not.toMatch(/timeline|TimedAction|ActionSpec|ActionNode|registry|primitive|presentation|MechanismSnapshot|\bstep\b/i);
    }
  });
});
