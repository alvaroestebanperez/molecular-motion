import { describe, expect, it } from 'vitest';
import { compileMechanism, type ActionNode } from '@molecular-motion/core';
import { buildSvgScene, describeScene, PAIRING, pairingGeometry, renderSvg } from '../src';
import { helixY } from '../src/scene';

/** Two aligned duplexes. Their ids carry no meaning: `upper` is declared first, so it is drawn first. */
const mechanism = (steps: ActionNode[][], ids: [string, string] = ['upper', 'lower']) => compileMechanism({
  schemaVersion: 5, mechanism: { id: 'x', name: 'X' },
  actors: [
    { id: ids[0], type: 'dna', label: 'Upper', nucleic: { length: 80 }, sites: [{ id: 'break', at: 40 }, { id: 'right', span: [40, 58] }, { id: 'left', span: [22, 40] }] },
    { id: ids[1], type: 'dna', label: 'Lower', nucleic: { length: 80 }, sites: [{ id: 'facing', span: [40, 58] }, { id: 'ahead', span: [22, 40] }] },
    { id: 'coat', type: 'protein', label: 'Coat', footprint: { length: 6 } },
  ],
  alignments: [{ id: 'pair', between: ids, range: [0, 80] }],
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const resected: ActionNode[] = [{ type: 'cleave', target: 'upper.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'upper.break', length: 18 }];
const paired: ActionNode[] = [...resected, { type: 'unwind', target: 'lower.facing' }, { type: 'pair', target: 'upper.right', with: 'lower' }];
const grown: ActionNode[] = [{ type: 'unwind', target: 'lower.ahead' }, { type: 'extend', target: 'upper.break', strand: 'bottom', length: 18 }];
const sceneOf = (steps: ActionNode[][]) => buildSvgScene(mechanism(steps).at(steps.length - 1));
const group = (svg: string) => svg.match(/<g class="mm-dna mm-pairing" data-key="([^"]+)"[^>]*>(.*?)<\/g><\/g>/)!;

describe('documents without pairings', () => {
  it('have no pairing layer and keep a single molecule where it was', () => {
    const scene = buildSvgScene(compileMechanism({
      schemaVersion: 5, mechanism: { id: 'x', name: 'X' }, actors: [{ id: 'dna', type: 'dna', sites: [{ id: 'a', at: 50 }] }],
      steps: [{ id: 's', title: 'S', actions: [{ type: 'cleave', target: 'dna.a' }] }],
    }).at(0));
    expect(scene.pairings).toEqual([]);
    expect(scene.nucleicAcids[0]!.y).toBeCloseTo(540 * .74);
    expect(renderSvg(scene)).not.toContain('data-layer="pairings"');
    expect(sceneOf([resected]).pairings).toEqual([]);
  });
});

describe('strands paired across two molecules (RFC 0006 §10)', () => {
  it('stacks molecules in declaration order, whatever they are called', () => {
    const scene = sceneOf([paired]);
    expect(scene.nucleicAcids.map(acid => acid.id)).toEqual(['upper', 'lower']);
    expect(scene.nucleicAcids[1]!.y - scene.nucleicAcids[0]!.y).toBe(150);
    expect(scene.nucleicAcids[1]!.y + 64).toBeLessThan(scene.height);
  });

  it('moves only the strand that pairs: the unwound molecule stays on its axis', () => {
    const scene = sceneOf([paired]);
    expect(scene.pairings).toEqual([{ key: 'lower.top~upper.bottom', segments: [{
      traveller: { acid: 'upper', strand: 'bottom', from: 40, to: 58 },
      host: { acid: 'lower', strand: 'top', from: 40, to: 58 },
      unpaired: [{ acid: 'lower', strand: 'bottom', from: 40, to: 58 }],
    }] }]);
    const [upper, lower] = scene.nucleicAcids as [typeof scene.nucleicAcids[0], typeof scene.nucleicAcids[0]];
    expect(upper.away).toEqual([{ strand: 'bottom', from: 40, to: 58, x0: 480, x1: 696, continues: [false, true] }]);
    expect(lower.away).toBeUndefined();
    // The unwound molecule is drawn exactly as it would be with nothing paired into it.
    const alone = buildSvgScene(mechanism([[{ type: 'unwind', target: 'lower.facing' }]]).at(0)).nucleicAcids[1]!;
    for (const x of [400, 500, 600, 700]) expect(helixY(lower, 0, x, 960)).toBeCloseTo(helixY(alone, 0, x, 960));
  });

  it('derives the choice from strand state, not from ids or declaration roles', () => {
    // The same story with the unwound molecule declared first: it still stays put, now on top.
    const swapped = buildSvgScene(compileMechanism({
      schemaVersion: 5, mechanism: { id: 'x', name: 'X' },
      actors: [
        { id: 'zeta', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'facing', span: [40, 58] }] },
        { id: 'alpha', type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'break', at: 40 }, { id: 'right', span: [40, 58] }] },
      ],
      alignments: [{ id: 'pair', between: ['alpha', 'zeta'], range: [0, 80] }],
      steps: [{ id: 's', title: 'S', actions: [
        { type: 'cleave', target: 'alpha.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'alpha.break', length: 18 },
        { type: 'unwind', target: 'zeta.facing' }, { type: 'pair', target: 'alpha.right', with: 'zeta' },
      ] }],
    }).at(0));
    expect(swapped.nucleicAcids.map(acid => acid.id)).toEqual(['zeta', 'alpha']);
    expect(swapped.pairings[0]!.segments[0]!.traveller.acid).toBe('alpha');
    expect(swapped.pairings[0]!.segments[0]!.host.acid).toBe('zeta');
  });

  it('runs the strand beside its partner, inside the bubble, well clear of the displaced strand', () => {
    const scene = sceneOf([paired]);
    const lower = scene.nucleicAcids[1]!;
    const { points, rungs, ends } = pairingGeometry(scene, scene.pairings[0]!.segments[0]!)!;
    const settled = points.filter(point => point.x > 500 && point.x < 600);
    for (const point of settled) {
      expect(point.y).toBeCloseTo(helixY(lower, 0, point.x, 960) + PAIRING.inset);
      expect(helixY(lower, 1, point.x, 960) - point.y).toBeGreaterThan(50);
      expect(point.y).toBeLessThan(lower.y);
    }
    // Base pairs join the two strands, and only where they lie side by side.
    expect(rungs.length).toBeGreaterThan(5);
    for (const [from, to] of rungs) { expect(from.x).toBeCloseTo(to.x); expect(from.y - to.y).toBeCloseTo(PAIRING.inset); }
    // The free 3′ end stays straight beside the partner and is labelled inside the bubble.
    expect(points[0]!.x).toBeCloseTo(480);
    expect(points[0]!.y).toBeCloseTo(settled[0]!.y);
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ label: '3′' });
    expect(ends[0]!.y).toBeGreaterThan(points[0]!.y);
    expect(ends[0]!.y).toBeLessThan(helixY(lower, 1, 520, 960));
  });

  it('enters smoothly: the strand leaves its own molecule where it continues there, in one monotonic curve', () => {
    const scene = sceneOf([paired]);
    const upper = scene.nucleicAcids[0]!;
    const { points } = pairingGeometry(scene, scene.pairings[0]!.segments[0]!)!;
    const last = points.at(-1)!;
    expect(last.x).toBeCloseTo(696);
    expect(last.y).toBeCloseTo(helixY(upper, 1, 696, 960));
    const entry = points.filter(point => point.x >= 696 - PAIRING.ramp);
    for (let index = 1; index < entry.length; index += 1) {
      expect(entry[index]!.y).toBeLessThanOrEqual(entry[index - 1]!.y + 1e-6);
      expect(Math.abs(entry[index]!.y - entry[index - 1]!.y)).toBeLessThan(12);
    }
  });

  it('keeps one keyed element per strand pair, and prolongs it when the pairing grows', () => {
    const before = sceneOf([paired]);
    const after = sceneOf([paired, grown]);
    const [keyBefore] = group(renderSvg(before)).slice(1);
    const [keyAfter, markup] = group(renderSvg(after)).slice(1);
    expect(keyBefore).toBe('pairing:lower.top~upper.bottom');
    expect(keyAfter).toBe(keyBefore);
    expect(renderSvg(after).match(/data-key="pairing:/g)).toHaveLength(1);
    expect(after.pairings[0]!.segments).toEqual([{
      traveller: { acid: 'upper', strand: 'bottom', from: 22, to: 58 }, host: { acid: 'lower', strand: 'top', from: 22, to: 58 },
      unpaired: [{ acid: 'lower', strand: 'bottom', from: 22, to: 58 }],
    }]);
    // The part that was already paired does not move: the new part is added at its end.
    const settled = (scene: typeof before) => pairingGeometry(scene, scene.pairings[0]!.segments[0]!)!.points.filter(point => point.x > 500 && point.x < 600).map(point => point.y);
    expect(settled(after)[0]).toBeCloseTo(settled(before)[0]!);
    // The new stretch is drawn as newly synthesised on the travelling strand, not on its own molecule.
    expect(markup).toContain('mm-dna__nascent');
    const geometry = pairingGeometry(after, after.pairings[0]!.segments[0]!)!;
    expect(geometry.nascent).toHaveLength(1);
    expect(geometry.nascent[0]![0]!.x).toBeCloseTo(264);
    expect(geometry.nascent[0]!.at(-1)!.x).toBeCloseTo(480);
    // Where synthesis stopped the strand is free: it does not run back to its own molecule.
    expect(after.nucleicAcids[0]!.away![0]!.continues).toEqual([false, true]);
    expect(geometry.ends[0]).toMatchObject({ label: '3′' });
  });

  it('describes structure only: which strand is paired with which, and what is left unpaired', () => {
    const summary = describeScene(sceneOf([paired]));
    expect(summary).toContain('Pairing: Upper bottom strand 40–58 paired with Lower top strand 40–58; Lower bottom strand 40–58 unpaired.');
    expect(summary).not.toMatch(/loop|invad|donor|sister/i);
  });

  it('carries an occupant along with the strand it sits on', () => {
    const scene = sceneOf([[...resected, { type: 'occupy', actor: 'coat', target: 'upper', span: [46, 52] }, { type: 'unwind', target: 'lower.facing' }, { type: 'pair', target: 'upper.right', with: 'lower' }]]);
    const actor = scene.actors.find(item => item.id === 'coat')!;
    const lower = scene.nucleicAcids[1]!;
    expect(actor.x).toBeCloseTo(588, 0);
    expect(actor.y).toBeGreaterThan(scene.nucleicAcids[0]!.y + 40);
    expect(actor.y).toBeLessThan(helixY(lower, 0, 588, 960) + PAIRING.inset);
  });

  it('returns to the plain molecules once unpaired, with the break drawn through by the new strand', () => {
    const scene = sceneOf([paired, grown, [{ type: 'unpair', target: 'upper' }, { type: 'anneal', target: 'lower.facing' }]]);
    expect(scene.pairings).toEqual([]);
    expect(scene.nucleicAcids[0]!.away).toBeUndefined();
    const svg = renderSvg(scene);
    expect(svg).not.toContain('data-layer="pairings"');
    // The free 3′ end of the new strand is labelled on its own molecule while it is unpaired.
    const labels = [...svg.matchAll(/class="mm-dna__polarity" x="([\d.]+)" y="([\d.]+)">([35])′/g)].map(match => [Number(match[1]), match[3]]);
    expect(labels).toContainEqual([275, '3']);
  });
});
