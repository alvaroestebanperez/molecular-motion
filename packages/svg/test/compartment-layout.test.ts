import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  builtinRegistry, compileMechanism, definePrimitive, field, parseMechanism,
  type ActionNode, type ActionSpec, type CompiledMechanism, type MechanismSnapshot,
} from '@molecular-motion/core';
import { buildSvgScene, layoutReservation, mechanismReservation, renderSvg } from '../src';
import { coordinateMapOf } from '../src/coordinate-map';

/**
 * Compartment-aware layout (ADR 0003): an actor's resolved compartment constrains the region it is
 * drawn in, whatever its type, and the layout reads resolved states only, never actions.
 */
const HEIGHT = 540;
const ACTORS = [
  { id: 'gene', type: 'dna', compartment: 'nucleus', nucleic: { length: 60 }, sites: [{ id: 'promoter', span: [2, 10] }] },
  {
    id: 'mrna', type: 'rna', compartment: 'nucleus', nucleic: { length: 36 },
    sites: [{ id: 'cut', at: 8 }, { id: 'intron', span: [12, 24] }, { id: 'exon2', span: [24, 36] }],
  },
  { id: 'factor', type: 'protein', compartment: 'nucleus' },
  { id: 'ion', type: 'molecule', compartment: 'nucleus' },
  { id: 'ribosome', type: 'protein', compartment: 'cytoplasm', footprint: { length: 8, form: 'single' } },
];
const document = (steps: ActionNode[][], options: { compartments?: unknown[]; actors?: unknown[] } = {}) => ({
  schemaVersion: 6, mechanism: { id: 'x', name: 'X' }, compartments: options.compartments ?? ['nucleus', 'cytoplasm'], actors: options.actors ?? ACTORS,
  steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
/** A custom action that moves an actor. The layout has never heard of it. */
const ship = definePrimitive<ActionSpec & { actor: string; to: string }>({
  type: 'ship', description: 'Put an actor in a compartment.',
  fields: { actor: field.actor({ required: true }), to: field.compartment({ required: true }) },
  presentation: { verb: 'ships' },
  apply(_state, action, ctx) { ctx.actor(action.actor).compartment = action.to; },
});
const registry = builtinRegistry.extend([ship]);
const snapshots = (mechanism: CompiledMechanism) => Array.from({ length: mechanism.length }, (_, index) => mechanism.at(index));
const show: ActionNode[] = [{ type: 'show', actor: 'factor' }, { type: 'show', actor: 'ion' }];
const exported = compileMechanism(document([show, [{ type: 'translocate', actor: 'mrna', to: 'cytoplasm' }]]));
const region = (scene: ReturnType<typeof buildSvgScene>) => scene.regions[0]!;
const inNucleus = (scene: ReturnType<typeof buildSvgScene>, y: number) => y > region(scene).y;
const acid = (scene: ReturnType<typeof buildSvgScene>, id: string) => scene.nucleicAcids.find(item => item.id === id)!;
/** The same snapshot with one actor's resolved compartment changed, and nothing else. */
const moved = (snapshot: MechanismSnapshot, actor: string, compartment: string): MechanismSnapshot => {
  const copy = JSON.parse(JSON.stringify(snapshot)) as MechanismSnapshot;
  copy.actors[actor]!.compartment = compartment;
  return copy;
};

describe('layout reservation (ADR 0003 §4.2)', () => {
  it('reserves a lane in every compartment a molecule is ever resolved in, in declaration order', () => {
    expect(mechanismReservation(exported)).toEqual({ lanes: { cytoplasm: ['mrna'], nucleus: ['gene', 'mrna'] } });
    expect(mechanismReservation(compileMechanism(document([show])))).toEqual({ lanes: { nucleus: ['gene', 'mrna'] } });
  });

  it('is the same for the same resolved snapshots, however they were authored', () => {
    const byCustomAction = compileMechanism(document([show, [{ type: 'ship', actor: 'mrna', to: 'cytoplasm' }]]), { registry });
    const thereAndBack = compileMechanism(document([show, [
      { type: 'translocate', actor: 'mrna', to: 'cytoplasm' }, { type: 'translocate', actor: 'mrna', to: 'nucleus' }, { type: 'ship', actor: 'mrna', to: 'cytoplasm' },
    ]]), { registry });
    const states = (mechanism: CompiledMechanism) => snapshots(mechanism).map(snapshot => snapshot.actors);
    expect(states(byCustomAction)).toEqual(states(exported));
    expect(states(thereAndBack)).toEqual(states(exported));
    expect(mechanismReservation(byCustomAction)).toEqual(mechanismReservation(exported));
    expect(mechanismReservation(thereAndBack)).toEqual(mechanismReservation(exported));
  });

  it('reads actor states and nothing else: no steps, no timeline, no actions', () => {
    const bare = snapshots(exported).map(snapshot => ({
      actors: snapshot.actors,
      definition: { actors: snapshot.definition.actors.map(({ id, type }) => ({ id, type })) },
    })) as unknown as MechanismSnapshot[];
    expect(layoutReservation(bare)).toEqual(mechanismReservation(exported));
  });

  it('a molecule reserves where it is present; a single snapshot, having no other step, reserves for all of it', () => {
    const later = compileMechanism(document([show, [{ type: 'synthesize', product: 'mrna', compartment: 'cytoplasm' }]], {
      actors: ACTORS.map(actor => actor.id === 'mrna' ? { ...actor, initial: { present: false } } : actor),
    }));
    // Present only in the cytoplasm, so the nucleus keeps no lane for it.
    expect(mechanismReservation(later)).toEqual({ lanes: { cytoplasm: ['mrna'], nucleus: ['gene'] } });
    expect(layoutReservation([later.at(0)])).toEqual({ lanes: { nucleus: ['gene'] } });
    expect(layoutReservation([later.at(0)], { absent: true })).toEqual({ lanes: { nucleus: ['gene', 'mrna'] } });
  });
});

describe('the resolved compartment decides the region, whatever the actor (ADR 0003 §3)', () => {
  const reservation = mechanismReservation(exported);
  const [before, after] = [buildSvgScene(exported.at(0), { reservation }), buildSvgScene(exported.at(1), { reservation })];

  it('changing only a nucleic acid\'s resolved compartment is enough to move it to another region', () => {
    // No action produced this state: the snapshot is the first one with one field changed.
    const edited = buildSvgScene(moved(exported.at(0), 'mrna', 'cytoplasm'), { reservation });
    expect(inNucleus(before, acid(before, 'mrna').y)).toBe(true);
    expect(inNucleus(edited, acid(edited, 'mrna').y)).toBe(false);
    expect(acid(edited, 'mrna').compartment).toBe('cytoplasm');
    // And it is exactly where the action-authored step puts it.
    expect(acid(edited, 'mrna').y).toBe(acid(after, 'mrna').y);
    expect(acid(edited, 'gene')).toEqual(acid(before, 'gene'));
  });

  it('the same holds for a protein and for a small molecule', () => {
    for (const id of ['factor', 'ion']) {
      const edited = buildSvgScene(moved(exported.at(0), id, 'cytoplasm'), { reservation });
      const y = (scene: ReturnType<typeof buildSvgScene>) => scene.actors.find(actor => actor.id === id)!.y;
      expect(inNucleus(before, y(before)), id).toBe(true);
      expect(inNucleus(edited, y(edited)), id).toBe(false);
    }
  });

  it('a nucleic acid declared in a compartment is drawn inside that compartment\'s band', () => {
    for (const scene of [before, after]) expect(inNucleus(scene, acid(scene, 'gene').y - 36)).toBe(true);
    expect(acid(after, 'mrna').y + 36).toBeLessThan(region(after).y);
  });

  it('keeps bands and lanes where they are from step to step', () => {
    expect(region(after)).toEqual(region(before));
    expect(acid(after, 'gene').y).toBe(acid(before, 'gene').y);
  });

  it('moves nothing horizontally: the coordinate map does not depend on the band', () => {
    const horizontal = ({ y: _y, compartment: _compartment, sites, ...rest }: ReturnType<typeof acid>) => ({ ...rest, sites: sites.map(({ y: _siteY, ...site }) => site) });
    expect(horizontal(acid(after, 'mrna'))).toEqual(horizontal(acid(before, 'mrna')));
  });
});

describe('a scene from one snapshot, without a reservation (ADR 0003 §4.2)', () => {
  it('is valid for its step: every molecule is in the band of its resolved compartment', () => {
    for (const snapshot of snapshots(exported)) {
      const scene = buildSvgScene(snapshot);
      for (const molecule of scene.nucleicAcids) expect(inNucleus(scene, molecule.y), `${snapshot.step.id} ${molecule.id}`).toBe(molecule.compartment === 'nucleus');
      expect(scene.compartmentConflicts).toEqual([]);
      expect(renderSvg(scene).length).toBeGreaterThan(1000);
    }
  });

  it('reserves from that snapshot alone, so its bands may differ from the mechanism\'s', () => {
    const alone = buildSvgScene(exported.at(0));
    const reserved = buildSvgScene(exported.at(0), { reservation: mechanismReservation(exported) });
    // The mechanism keeps a cytoplasm lane for the transcript from the first step; this snapshot knows of none.
    expect(region(alone).y).not.toBe(region(reserved).y);
    expect(region(alone).y).toBeLessThan(region(reserved).y);
  });
});

describe('molecules that are not present (ADR 0003 §4.9)', () => {
  const later = compileMechanism(document([show, [{ type: 'synthesize', product: 'mrna', compartment: 'cytoplasm' }]], {
    actors: ACTORS.map(actor => actor.id === 'mrna' ? { ...actor, initial: { present: false } } : actor),
  }));
  const reservation = mechanismReservation(later);
  const [first, second] = [buildSvgScene(later.at(0), { reservation }), buildSvgScene(later.at(1), { reservation })];

  it('reserve capacity: the band and lane are already there before the molecule exists', () => {
    expect(region(first)).toEqual(region(second));
    expect(acid(first, 'gene').y).toBe(acid(second, 'gene').y);
    expect(acid(second, 'mrna').y + 36).toBeLessThan(region(second).y);
  });

  it('are not drawn, not interactive and not an obstacle', () => {
    expect(first.nucleicAcids.map(molecule => molecule.id)).toEqual(['gene']);
    expect(first.actors.some(actor => actor.id === 'mrna')).toBe(false);
    expect(renderSvg(first)).not.toContain('acid:mrna');
    // What is on screen is placed exactly as it is once the molecule exists and rests elsewhere.
    const place = (scene: typeof first, id: string) => { const actor = scene.actors.find(item => item.id === id)!; return [actor.x, actor.y]; };
    for (const id of ['factor', 'ion']) expect(place(first, id)).toEqual(place(second, id));
  });
});

describe('upcoming actors (ADR 0003 §4.9)', () => {
  it('wait in the band of their resolved compartment in a scene with more than one band', () => {
    const mechanism = compileMechanism(document([[{ type: 'show', actor: 'factor' }], [{ type: 'show', actor: 'ribosome' }, { type: 'show', actor: 'ion' }]]));
    const scene = buildSvgScene(mechanism.at(0), { ghosts: ['ribosome', 'ion'], reservation: mechanismReservation(mechanism) });
    const ghost = (id: string) => scene.actors.find(actor => actor.id === id)!;
    expect(ghost('ribosome')).toMatchObject({ ghost: true });
    expect(inNucleus(scene, ghost('ribosome').y)).toBe(false);
    expect(inNucleus(scene, ghost('ion').y)).toBe(true);
    expect(scene.compartmentConflicts).toEqual([]);
  });
});

describe('bound and resting actors (ADR 0003 §4.5)', () => {
  const resting = compileMechanism(document([[{ type: 'occupy', actor: 'ribosome', target: 'mrna.cut' }], [{ type: 'translocate', actor: 'mrna', to: 'cytoplasm' }]]));
  const reservation = mechanismReservation(resting);
  const [apart, together] = [buildSvgScene(resting.at(0), { reservation }), buildSvgScene(resting.at(1), { reservation })];
  const ribosome = (scene: typeof apart) => scene.actors.find(actor => actor.id === 'ribosome')!;

  it('the partner\'s position wins: an occupant is drawn on its molecule, in whatever band that is', () => {
    expect(inNucleus(apart, ribosome(apart).y)).toBe(true);
    expect(Math.abs(ribosome(apart).y - acid(apart, 'mrna').y)).toBeLessThan(90);
    expect(Math.abs(ribosome(together).y - acid(together, 'mrna').y)).toBeLessThan(90);
  });

  it('a disagreement is a diagnostic, not a relocation: the state is left as it was resolved', () => {
    expect(apart.compartmentConflicts).toEqual([{ kind: 'anchor', actor: 'ribosome', compartment: 'cytoplasm', anchor: 'mrna', anchorCompartment: 'nucleus' }]);
    expect(ribosome(apart).compartment).toBe('cytoplasm');
    expect(resting.at(0).actors.ribosome!.compartment).toBe('cytoplasm');
    expect(renderSvg(apart)).not.toMatch(/conflict/i);
    expect(together.compartmentConflicts).toEqual([]);
  });

  it('reports lanes that do not fit the canvas, and still draws every molecule', () => {
    const cramped = buildSvgScene(resting.at(0), { reservation, height: 300 });
    expect(cramped.compartmentConflicts).toContainEqual(expect.objectContaining({ kind: 'fit', available: 300 }));
    expect(cramped.nucleicAcids).toHaveLength(2);
  });
});

describe('excision geometry is unchanged apart from the lane (ADR 0002 with ADR 0003)', () => {
  const steps: ActionNode[][] = [[{ type: 'excise-interval', target: 'mrna.intron' }, { type: 'damage', target: 'mrna.exon2' }], [{ type: 'translocate', actor: 'mrna', to: 'cytoplasm' }]];
  const banded = compileMechanism(document(steps));
  const single = compileMechanism(document([steps[0]!], { compartments: ['nucleus'], actors: ACTORS.map(actor => ({ ...actor, compartment: 'nucleus' })) }));
  const horizontal = ({ y: _y, compartment: _compartment, sites, ...rest }: ReturnType<typeof acid>) => ({ ...rest, sites: sites.map(({ y: _siteY, ...site }) => site) });

  it('a spliced molecule is drawn closed about its centre in any band', () => {
    const reservation = mechanismReservation(banded);
    const [nuclear, cytosolic] = [buildSvgScene(banded.at(0), { reservation }), buildSvgScene(banded.at(1), { reservation })];
    const reference = acid(buildSvgScene(single.at(0)), 'mrna');
    for (const scene of [nuclear, cytosolic]) {
      expect(horizontal(acid(scene, 'mrna'))).toEqual(horizontal(reference));
      expect(coordinateMapOf(acid(scene, 'mrna'), 960).extent).toEqual(coordinateMapOf(reference, 960).extent);
      expect(scene.lesions.map(lesion => lesion.x)).toEqual(buildSvgScene(single.at(0)).lesions.map(lesion => lesion.x));
    }
    expect(acid(cytosolic, 'mrna').y).not.toBe(acid(nuclear, 'mrna').y);
  });
});

describe('documents shipped with the project', () => {
  const load = (name: string) => compileMechanism(parseMechanism(readFileSync(new URL(`../../../examples/${name}.yaml`, import.meta.url), 'utf8')));

  it.each(['parp1-ssb-repair', 'homologous-recombination', 'p53-mdm2-feedback'])('%s has one band: nothing is delimited, reserved or reported', name => {
    const mechanism = load(name);
    const reservation = mechanismReservation(mechanism);
    for (const snapshot of snapshots(mechanism)) {
      const scene = buildSvgScene(snapshot, { reservation });
      expect(scene.regions).toEqual([]);
      expect(scene.compartmentConflicts).toEqual([]);
      expect(renderSvg(scene)).toBe(renderSvg(buildSvgScene(snapshot)));
    }
  });

  it.each(['egfr-dimerization', 'cgas-sting'])('%s is drawn the same with the mechanism\'s reservation as from each snapshot', name => {
    const mechanism = load(name);
    const reservation = mechanismReservation(mechanism);
    for (const snapshot of snapshots(mechanism)) {
      const scene = buildSvgScene(snapshot, { reservation });
      expect(scene.compartmentConflicts).toEqual([]);
      expect(renderSvg(scene)).toBe(renderSvg(buildSvgScene(snapshot)));
    }
  });

  it('cGAS–STING keeps its cytosolic DNA between the membrane and the nucleus band', () => {
    const mechanism = load('cgas-sting');
    for (const snapshot of snapshots(mechanism)) {
      const scene = buildSvgScene(snapshot, { reservation: mechanismReservation(mechanism) });
      const dna = scene.nucleicAcids[0];
      if (!dna) continue;
      expect(dna.compartment).toBe('cytoplasm');
      expect(dna.y).toBeGreaterThan(scene.membranes[0]!.y);
      expect(dna.y + 36 + 16).toBe(scene.regions[0]!.y);
    }
  });

  it('gene expression: the gene and its transcript are in the nucleus, and the exported mRNA in the cytoplasm with its ribosome', () => {
    const mechanism = load('gene-expression');
    const reservation = mechanismReservation(mechanism);
    expect(reservation).toEqual({ lanes: { cytoplasm: ['pre-mrna'], nucleus: ['gene', 'pre-mrna'] } });
    const scenes = snapshots(mechanism).map(snapshot => buildSvgScene(snapshot, { reservation, height: HEIGHT }));
    for (const scene of scenes) {
      expect(scene.regions).toEqual(scenes[0]!.regions);
      expect(scene.compartmentConflicts).toEqual([]);
      for (const molecule of scene.nucleicAcids) expect(inNucleus(scene, molecule.y), `${scene.title} ${molecule.id}`).toBe(molecule.compartment === 'nucleus');
    }
    const last = scenes.at(-1)!;
    expect(acid(last, 'pre-mrna').compartment).toBe('cytoplasm');
    expect(inNucleus(last, last.actors.find(actor => actor.id === 'ribosome')!.y)).toBe(false);
    // The junction of ADR 0002 is still where the ribosome sits.
    expect(last.actors.find(actor => actor.id === 'ribosome')!.x).toBeCloseTo(acid(last, 'pre-mrna').excised![0]!.x0, 6);
  });
});
