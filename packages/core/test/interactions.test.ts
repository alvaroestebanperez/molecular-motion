import { describe, expect, it } from 'vitest';
import { compileMechanism, componentOf, partnersOf, primaryPartner, type ActionNode } from '../src';

const mechanism = (actors: Record<string, unknown>[], steps: ActionNode[][], compartments?: string[]) => compileMechanism({
  schemaVersion: 4, mechanism: { id: 'x', name: 'X' }, ...(compartments && { compartments }),
  actors, steps: steps.map((actions, index) => ({ id: `s${index}`, title: `S${index}`, actions })),
});
const last = (compiled: ReturnType<typeof compileMechanism>) => compiled.at(compiled.length - 1);

const EGFR = [
  { id: 'egfr', type: 'protein', copies: 3, interfaces: [{ id: 'dimer' }, { id: 'ligand' }] },
  { id: 'egf', type: 'molecule', copies: 2 },
];
const dimerize = [
  { type: 'bind', actor: 'egf#1', target: 'egfr#1', targetInterface: 'ligand' },
  { type: 'bind', actor: 'egf#2', target: 'egfr#2', targetInterface: 'ligand' },
  { type: 'bind', actor: 'egfr#1', interface: 'dimer', target: 'egfr#2', targetInterface: 'dimer' },
];

describe('interaction graph: the only source of truth (RFC 0005 §4, D5)', () => {
  it('stores each legacy binding once: an edge between instances, an occupancy on a nucleic acid', () => {
    const snapshot = last(mechanism([{ id: 'dna', type: 'dna', sites: [{ id: 'lesion', at: 50 }] }, { id: 'parp1', type: 'protein' }, { id: 'xrcc1', type: 'protein' }], [[
      { type: 'bind', actor: 'parp1', target: 'dna.lesion' },
      { type: 'recruit', actor: 'xrcc1', target: 'parp1' },
    ]]));
    expect(snapshot.interactions).toEqual({ 'xrcc1~parp1': { id: 'xrcc1~parp1', ends: [{ instance: 'xrcc1' }, { instance: 'parp1' }] } });
    expect(snapshot.occupancy).toEqual({ 'parp1@dna': { id: 'parp1@dna', instance: 'parp1', acid: 'dna', site: 'lesion' } });
    for (const actor of Object.values(snapshot.actors)) expect(actor).not.toHaveProperty('boundTo');
    expect(snapshot.timeline.map(action => action.changes.map(change => change.key))).toEqual([['actors.parp1.visible', 'occupancy.parp1@dna'], ['actors.xrcc1.visible', 'interactions.xrcc1~parp1']]);
    expect([primaryPartner(snapshot, 'parp1'), primaryPartner(snapshot, 'xrcc1')]).toEqual(['dna.lesion', 'parp1']);
    expect(partnersOf(snapshot, 'parp1').map(partner => partner.reference)).toEqual(['dna.lesion', 'xrcc1']);
  });

  it('keeps v3 semantics for anonymous bindings: one attachment, replaced by the next, silent unbind', () => {
    const compiled = mechanism([{ id: 'a', type: 'protein' }, { id: 'b', type: 'protein' }, { id: 'c', type: 'protein' }],
      [[{ type: 'bind', actor: 'a', target: 'b' }], [{ type: 'bind', actor: 'a', target: 'c' }], [{ type: 'unbind', actor: 'a' }, { type: 'unbind', actor: 'a' }]]);
    expect(Object.keys(compiled.at(1).interactions)).toEqual(['a~c']);
    expect(compiled.at(2).interactions).toEqual({});
  });
});

describe('interfaces and valence: EGFR dimerization', () => {
  it('binds each EGF to one receptor and the receptors to each other through a symmetric dimer edge', () => {
    const snapshot = last(mechanism(EGFR, [dimerize, [{ type: 'phosphorylate', actor: 'egfr#2', site: 'Y1068', by: 'egfr#1' }]]));
    expect(Object.keys(snapshot.interactions)).toEqual(['egf#1~egfr#1:ligand', 'egf#2~egfr#2:ligand', 'egfr#1:dimer~egfr#2:dimer']);
    expect(snapshot.interactions['egfr#1:dimer~egfr#2:dimer']!.symmetric).toBe(true);
    expect(partnersOf(snapshot, 'egfr#1')).toEqual([
      { reference: 'egf#1', via: 'interaction', id: 'egf#1~egfr#1:ligand', interface: 'ligand' },
      { reference: 'egfr#2', via: 'interaction', id: 'egfr#1:dimer~egfr#2:dimer', interface: 'dimer', partnerInterface: 'dimer' },
    ]);
    expect(componentOf(snapshot, 'egf#2')).toEqual(['egf#1', 'egf#2', 'egfr#1', 'egfr#2']);
    expect(snapshot.actors['egfr#2']!.modifications.map(item => item.id)).toEqual(['phosphorylation@Y1068']);
    expect(snapshot.actors['egfr#1']!.modifications).toEqual([]);
  });

  it('enforces valence and never drops a partner silently', () => {
    expect(() => mechanism(EGFR, [[...dimerize, { type: 'bind', actor: 'egfr#3', interface: 'dimer', target: 'egfr#1', targetInterface: 'dimer' }]]))
      .toThrow(/"egfr#1" has no free "dimer" interface \(valence 1\)/);
    expect(() => mechanism(EGFR, [[...dimerize, { type: 'bind', actor: 'egf#2', target: 'egfr#1', targetInterface: 'ligand' }]]))
      .toThrow(/"egfr#1" has no free "ligand" interface/);
    expect(() => mechanism(EGFR, [[...dimerize, { type: 'bind', actor: 'egfr#2', interface: 'dimer', target: 'egfr#1', targetInterface: 'dimer' }]]))
      .toThrow(/"egfr#2" has no free "dimer" interface/);
  });

  it('releases a chosen binding by target or interface, and fails when there is none', () => {
    const compiled = mechanism(EGFR, [dimerize, [{ type: 'unbind', actor: 'egfr#1', interface: 'dimer' }], [{ type: 'unbind', actor: 'egf#1', target: 'egfr#1' }]]);
    expect(Object.keys(compiled.at(1).interactions)).toEqual(['egf#1~egfr#1:ligand', 'egf#2~egfr#2:ligand']);
    expect(Object.keys(compiled.at(2).interactions)).toEqual(['egf#2~egfr#2:ligand']);
    expect(() => mechanism(EGFR, [[{ type: 'unbind', actor: 'egfr#1', interface: 'dimer' }]])).toThrow(/"egfr#1" is not bound through "dimer"/);
  });
});

describe('STING: a ligand bridging both protomers, and moving the assembly', () => {
  const STING = [
    { id: 'sting', type: 'protein', copies: 4, compartment: 'er', interfaces: [{ id: 'dimer' }, { id: 'pocket' }, { id: 'oligo' }] },
    { id: 'cgamp', type: 'molecule', compartment: 'er', interfaces: [{ id: 'bridge', valence: 2 }] },
  ];
  const assemble = [
    { type: 'bind', actor: 'sting#1', interface: 'dimer', target: 'sting#2', targetInterface: 'dimer' },
    { type: 'bind', actor: 'sting#3', interface: 'dimer', target: 'sting#4', targetInterface: 'dimer' },
    { type: 'bind', actor: 'cgamp', interface: 'bridge', target: 'sting#1', targetInterface: 'pocket' },
    { type: 'bind', actor: 'cgamp', interface: 'bridge', target: 'sting#2', targetInterface: 'pocket' },
    { type: 'bind', actor: 'sting#2', interface: 'oligo', target: 'sting#3', targetInterface: 'oligo' },
  ];

  it('lets one cGAMP bind the pockets of both protomers, up to its valence', () => {
    const snapshot = last(mechanism(STING, [assemble], ['er', 'golgi']));
    expect(partnersOf(snapshot, 'cgamp').map(partner => [partner.reference, partner.interface, partner.partnerInterface]))
      .toEqual([['sting#1', 'bridge', 'pocket'], ['sting#2', 'bridge', 'pocket']]);
    expect(() => mechanism(STING, [[...assemble, { type: 'bind', actor: 'cgamp', interface: 'bridge', target: 'sting#3', targetInterface: 'pocket' }]], ['er', 'golgi']))
      .toThrow(/"cgamp" has no free "bridge" interface \(valence 2\)/);
  });

  it('translocate includeBound carries what is bound to it, through symmetric edges, keeping every binding', () => {
    const compiled = mechanism(STING, [assemble, [{ type: 'translocate', actor: 'sting#1', to: 'golgi', includeBound: true }]], ['er', 'golgi']);
    const moved = last(compiled);
    expect(Object.fromEntries(Object.values(moved.actors).map(actor => [actor.id, actor.compartment])))
      .toEqual({ 'sting#1': 'golgi', 'sting#2': 'golgi', 'sting#3': 'golgi', 'sting#4': 'golgi', cgamp: 'golgi' });
    expect(moved.interactions).toEqual(compiled.at(0).interactions);
  });

  it('degrade releases every edge of the degraded instance', () => {
    const snapshot = last(mechanism(STING, [assemble, [{ type: 'degrade', actor: 'sting#2' }]], ['er', 'golgi']));
    expect(Object.keys(snapshot.interactions)).toEqual(['sting#3:dimer~sting#4:dimer', 'cgamp:bridge~sting#1:pocket']);
  });
});

describe('static validation of interfaces', () => {
  it('rejects undeclared interfaces, interfaces on nucleic acids and malformed declarations', () => {
    const base = [{ id: 'dna', type: 'dna', sites: [{ id: 'a', at: 5 }] }, { id: 'p', type: 'protein', interfaces: [{ id: 'dna-binding' }] }, { id: 'q', type: 'protein' }];
    expect(() => mechanism(base, [[{ type: 'bind', actor: 'p', interface: 'kinase', target: 'q' }]])).toThrow(/"p" declares no interface "kinase"/);
    expect(() => mechanism(base, [[{ type: 'bind', actor: 'p', target: 'q', targetInterface: 'x' }]])).toThrow(/"q" declares no interface "x"/);
    expect(() => mechanism(base, [[{ type: 'bind', actor: 'p', interface: 'dna-binding', target: 'dna.a' }]])).toThrow(/binding a nucleic acid is an occupancy, which has no interfaces/);
    expect(() => mechanism([{ id: 'dna', type: 'dna', interfaces: [{ id: 'x' }] }], [[]])).toThrow(/interfaces is not allowed on dna and rna/);
    expect(() => mechanism([{ id: 'p', type: 'protein', interfaces: [{ id: 'x', valence: 0 }, { id: 'x' }] }], [[]])).toThrow(/valence must be an integer ≥ 1[\s\S]*duplicates "x"/);
  });
});

describe('occupancy record (legacy bindings to nucleic acids)', () => {
  it('rests on the whole molecule or a site, and is released when either side is degraded', () => {
    const actors = [{ id: 'dna', type: 'dna', sites: [{ id: 'a', at: 5 }] }, { id: 'p', type: 'protein' }, { id: 'q', type: 'protein' }];
    const compiled = mechanism(actors, [[{ type: 'bind', actor: 'p', target: 'dna' }, { type: 'bind', actor: 'q', target: 'dna.a' }], [{ type: 'degrade', actor: 'dna' }]]);
    expect(compiled.at(0).occupancy).toEqual({ 'p@dna': { id: 'p@dna', instance: 'p', acid: 'dna' }, 'q@dna': { id: 'q@dna', instance: 'q', acid: 'dna', site: 'a' } });
    expect(compiled.at(1).occupancy).toEqual({});
  });
});
