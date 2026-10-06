import { describe, expect, it } from 'vitest';
import { compileMechanism, covalentSuccessor, type ActionNode, type MechanismDefinition, type StrandId } from '@molecular-motion/core';
import { buildSvgScene, pairingGeometry, renderSvg, type SceneNucleicAcid, type SvgScene } from '../src';
import { freeStrandEnds, synthesisNickOpen } from '../src/scene';

/**
 * The free end drawn where newly made nucleotides stop (RFC 0006 §10) marks an unsealed nick. Three facts
 * are kept apart: `nascent` records provenance, a break lesion records an unsealed nick, and covalent
 * topology records continuity. The end of a `nascent` range is drawn as a free end only while the break
 * that owns that nick is still there. Ids carry no meaning.
 */
type Lesion = 'nick' | 'single-strand-break' | 'double-strand-break';
const site = (at: number, lesion?: Lesion, strands: StrandId[] = ['top', 'bottom']) => ({ reference: `m.s${at}`, x: at * 12, y: 0, at: { from: at, to: at }, ...(lesion && { lesion, lesionStrands: strands }) });
const range = (strand: StrandId, from: number, to: number) => ({ strand, from, to, x0: from * 12, x1: to * 12 });
const acid = (sites: ReturnType<typeof site>[], nascent: ReturnType<typeof range>[], excised: [number, number][] = []) =>
  ({ sites, nascent, excised: excised.map(([from, to]) => ({ from, to, x0: from * 12, x1: from * 12 })) }) as unknown as Pick<SceneNucleicAcid, 'sites' | 'nascent' | 'excised'>;

describe('synthesisNickOpen: whether a live break owns the nick at the end of a nascent run', () => {
  const top = [range('top', 40, 58)], bottom = [range('bottom', 22, 40)];

  it('top: the break the synthesis started from owns the nick at the 3′ end of the run, to its right', () => {
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], top), 'top', 58)).toBe(true);
    expect(synthesisNickOpen(acid([site(40, 'nick', ['top'])], top), 'top', 58)).toBe(true);
  });

  it('bottom: the same, with the 3′ end of the run to the left of the break', () => {
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], bottom), 'bottom', 22)).toBe(true);
    expect(synthesisNickOpen(acid([site(40, 'single-strand-break', ['bottom'])], bottom), 'bottom', 22)).toBe(true);
  });

  it('is closed once that break is gone, whatever `nascent` still says', () => {
    expect(synthesisNickOpen(acid([site(40)], top), 'top', 58)).toBe(false);
    expect(synthesisNickOpen(acid([site(40)], bottom), 'bottom', 22)).toBe(false);
    expect(synthesisNickOpen(acid([], top), 'top', 58)).toBe(false);
  });

  it('an unrelated break does not qualify: elsewhere on the strand, or at the right place on the other strand', () => {
    expect(synthesisNickOpen(acid([site(40), site(10, 'nick', ['top'])], top), 'top', 58)).toBe(false);
    expect(synthesisNickOpen(acid([site(40), site(70, 'double-strand-break')], top), 'top', 58)).toBe(false);
    expect(synthesisNickOpen(acid([site(40, 'nick', ['bottom'])], top), 'top', 58)).toBe(false);
    expect(synthesisNickOpen(acid([site(40, 'nick', ['top'])], bottom), 'bottom', 22)).toBe(false);
    // A break inside the run is not at its start: the run it owns ends where the run does, not before.
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], top), 'top', 50)).toBe(false);
  });

  it('a break at the boundary itself owns it', () => {
    expect(synthesisNickOpen(acid([site(58, 'nick', ['top'])], top), 'top', 58)).toBe(true);
    expect(synthesisNickOpen(acid([site(22, 'nick', ['bottom'])], bottom), 'bottom', 22)).toBe(true);
  });

  it('follows the run as `ligate` does: over ranges that touch and across the junction of an excised interval, and no further', () => {
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], [range('top', 40, 50), range('top', 50, 58)]), 'top', 58)).toBe(true);
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], [range('top', 40, 45), range('top', 50, 58)]), 'top', 58)).toBe(false);
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], [range('top', 50, 58)], [[40, 50]]), 'top', 58)).toBe(true);
    // A run on the other strand does not carry the walk.
    expect(synthesisNickOpen(acid([site(40, 'double-strand-break')], [range('bottom', 40, 58)]), 'top', 58)).toBe(false);
  });

  it('a lesion that is not a break owns nothing', () => {
    const damaged = { ...site(40), lesion: 'base-damage', lesionStrands: ['top'] } as unknown as ReturnType<typeof site>;
    expect(synthesisNickOpen(acid([damaged], top), 'top', 58)).toBe(false);
  });
});

// ---- The same, through documents: two aligned duplexes, a break repaired from the second ----

const duplex = (id: string) => ({ id, type: 'dna', nucleic: { length: 80 }, sites: [{ id: 'break', at: 40 }, { id: 'window', span: [22, 58] }, { id: 'far', at: 70, strand: 'top' }] });
const sceneAfter = (...steps: ActionNode[][]) => {
  const mechanism = compileMechanism({
    schemaVersion: 7, mechanism: { id: 'x', name: 'X' }, actors: [duplex('dna'), duplex('sister')],
    alignments: [{ id: 'sister', between: ['dna', 'sister'], range: [0, 80] }],
    steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
  } as unknown as MechanismDefinition);
  const snapshot = mechanism.at(mechanism.length - 1);
  return { snapshot, scene: buildSvgScene(snapshot) };
};
const invaded: ActionNode[] = [
  { type: 'cleave', target: 'dna.break', lesion: 'double-strand-break' }, { type: 'resect', target: 'dna.break', length: 18 },
  { type: 'unwind', target: 'sister.window' }, { type: 'invade', target: 'dna', strand: 'top', span: [22, 40], with: 'sister' },
  { type: 'extend', target: 'dna.break', strand: 'top', length: 18 },
];
const captured: ActionNode[] = [{ type: 'pair', target: 'dna', strand: 'bottom', span: [40, 58], with: 'sister' }, { type: 'extend', target: 'dna.break', strand: 'bottom', length: 18 }];
const seal: ActionNode = { type: 'ligate', target: 'dna.break' };
const release: ActionNode = { type: 'unpair', target: 'dna' };

const dna = (scene: SvgScene) => scene.nucleicAcids.find(item => item.id === 'dna')!;
/** For each strand drawn beside the sister: whether it goes on along its own row past its 3′ end, and the label it carries there. */
const displaced = (scene: SvgScene) => Object.fromEntries(scene.pairings.flatMap(pairing => pairing.segments).filter(segment => segment.traveller.acid === 'dna').map(segment => {
  const { strand, from, to } = segment.traveller;
  const stretch = dna(scene).away!.find(item => item.strand === strand && item.from === from && item.to === to)!;
  const { points, ends } = pairingGeometry(scene, segment)!;
  const [tip, middle] = [strand === 'top' ? points.at(-1)! : points[0]!, points[Math.floor(points.length / 2)]!];
  return [strand, { continues: stretch.continues[strand === 'top' ? 1 : 0], labels: ends.map(end => end.label), ramps: Math.abs(tip.y - middle.y) > 20 }];
}));
/** 5′/3′ labels drawn on the row of `dna`, away from the ends of the molecule. */
const internalLabels = (scene: SvgScene) => {
  const group = renderSvg(scene).match(/<g class="mm-dna__polarities" data-acid="dna">(.*?)<\/g>/)![1]!;
  return [...group.matchAll(/x="([\d.-]+)" y="[\d.-]+">([^<]+)</g)].map(([, x, label]) => ({ x: Number(x), label: label! })).filter(({ x }) => x > 30 && x < scene.width - 30);
};

describe('a strand drawn beside its partner, where new nucleotides stop', () => {
  it('with the break still open: a free 3′ end, on top and on bottom', () => {
    const { scene } = sceneAfter(invaded, captured);
    expect(displaced(scene)).toEqual({ top: { continues: false, labels: ['3′'], ramps: false }, bottom: { continues: false, labels: ['3′'], ramps: false } });
    // The strand that was already there begins at the nick, and is labelled as the 5′ end it is.
    expect(internalLabels(scene).map(end => end.label)).toEqual(['5′', '5′']);
  });

  it('with the break sealed: the strand goes on, and eases back to its own row as any continuing strand does', () => {
    const { scene, snapshot } = sceneAfter(invaded, captured, [seal]);
    expect(displaced(scene)).toEqual({ top: { continues: true, labels: [], ramps: true }, bottom: { continues: true, labels: [], ramps: true } });
    expect(internalLabels(scene)).toEqual([]);
    // Provenance is untouched, and topology agreed all along: only the lesion changed.
    expect(dna(scene).nascent!.map(item => `${item.strand} ${item.from}–${item.to}`).sort()).toEqual(['bottom 22–40', 'top 40–58']);
    expect(covalentSuccessor(snapshot, snapshot.definition, { acid: 'dna', strand: 'top', index: 57 })).toEqual({ acid: 'dna', strand: 'top', index: 58 });
    expect(covalentSuccessor(snapshot, snapshot.definition, { acid: 'dna', strand: 'bottom', index: 22 })).toEqual({ acid: 'dna', strand: 'bottom', index: 21 });
  });

  it('an unrelated break does not reopen it', () => {
    const { scene } = sceneAfter(invaded, captured, [seal], [{ type: 'cleave', target: 'dna.far' }]);
    expect(displaced(scene)).toEqual({ top: { continues: true, labels: [], ramps: true }, bottom: { continues: true, labels: [], ramps: true } });
  });

  it('topology said the same in both states: it does not tell an open nick from a sealed one', () => {
    for (const steps of [[invaded, captured], [invaded, captured, [seal]]]) {
      const { snapshot } = sceneAfter(...steps);
      expect(covalentSuccessor(snapshot, snapshot.definition, { acid: 'dna', strand: 'top', index: 57 })).toBeDefined();
    }
  });
});

describe('a strand on its own row, where new nucleotides stop inside an unwound region', () => {
  const ends = (scene: SvgScene) => freeStrandEnds(dna(scene), scene.width).map(([strand, x]) => `${strand ? 'bottom' : 'top'}@${Math.round(x / (scene.width / 80))}`).sort();

  it('with the break still open: a free end, on top and on bottom', () => {
    const { scene } = sceneAfter(invaded, captured, [release]);
    expect(dna(scene).away).toBeUndefined();
    expect(ends(scene)).toEqual(['bottom@22', 'top@58']);
    expect(internalLabels(scene).map(end => end.label).sort()).toEqual(expect.arrayContaining(['3′', '3′']));
  });

  it('with the break sealed: no free end, and no label inside the molecule', () => {
    const { scene } = sceneAfter(invaded, captured, [seal], [release]);
    expect(dna(scene).away).toBeUndefined();
    expect(dna(scene).open).toBeDefined();
    expect(ends(scene)).toEqual([]);
    expect(internalLabels(scene)).toEqual([]);
  });

  it('an unrelated break does not reopen it', () => {
    const { scene } = sceneAfter(invaded, captured, [seal], [release, { type: 'cleave', target: 'dna.far' }]);
    expect(ends(scene)).toEqual([]);
  });
});
