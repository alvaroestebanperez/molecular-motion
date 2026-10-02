import { describe, expect, it } from 'vitest';
import { compileMechanism, parseMechanism, primaryPartner, type MechanismDefinition } from '../src';
import { MECHANISMS, allStates, readExample } from './helpers';

/** Deterministic permutation (no Math.random) so failures are reproducible. */
function shuffled(length: number, seed: number): number[] {
  const order = Array.from({ length }, (_, index) => index);
  let value = seed;
  for (let index = length - 1; index > 0; index--) {
    value = (value * 1103515245 + 12345) % 2 ** 31;
    const swap = value % (index + 1);
    [order[index], order[swap]] = [order[swap]!, order[index]!];
  }
  return order;
}

describe.each(MECHANISMS)('determinism: %s', name => {
  const definition = parseMechanism(readExample(name));
  const mechanism = compileMechanism(definition);
  const forward = allStates(mechanism);

  it('seeking in any order yields the same snapshot as walking forward', () => {
    for (const seed of [1, 7, 42]) {
      for (const index of shuffled(mechanism.length, seed)) {
        expect(JSON.parse(JSON.stringify(mechanism.at(index)))).toMatchObject(forward[index]);
      }
    }
    for (let index = mechanism.length - 1; index >= 0; index--) {
      expect(allStates(mechanism)[index]).toEqual(forward[index]);
    }
  });

  it('each step equals a fresh fold of the initial state over the preceding steps only', () => {
    for (let index = 0; index < definition.steps.length; index++) {
      const truncated: MechanismDefinition = { ...definition, steps: definition.steps.slice(0, index + 1) };
      const replay = compileMechanism(truncated);
      expect(allStates(replay).at(-1)).toEqual(forward[index]);
    }
  });

  it('independent compilations of the same source are identical', () => {
    expect(allStates(compileMechanism(parseMechanism(readExample(name))))).toEqual(forward);
  });

  it('returns the same frozen object for the same step, by index or id', () => {
    const last = mechanism.length - 1;
    const snapshot = mechanism.at(last);
    expect(mechanism.at(definition.steps[last]!.id)).toBe(snapshot);
    expect(Object.isFrozen(snapshot.actors)).toBe(true);
    expect(() => { (snapshot.actors as Record<string, unknown>).intruder = {}; }).toThrow(TypeError);
    expect(allStates(mechanism)).toEqual(forward);
  });

  it('does not mutate or freeze the caller\'s definition', () => {
    const input = structuredClone(definition);
    compileMechanism(input);
    expect(Object.isFrozen(input.steps)).toBe(false);
    expect(input).toEqual(definition);
  });

  it('snapshots survive a JSON round trip unchanged', () => {
    for (const state of forward) expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe('determinism: parallel groups', () => {
  const base = {
    schemaVersion: 2,
    mechanism: { id: 'ber', name: 'BER fragment' },
    compartments: ['nucleus'],
    actors: [
      { id: 'dna', type: 'dna', compartment: 'nucleus', sites: [{ id: 'g8', type: '8-oxoG' }] },
      { id: 'polb', type: 'protein', compartment: 'nucleus' },
      { id: 'lig3', type: 'protein', compartment: 'nucleus' },
    ],
  };
  const withBranches = (branches: unknown[]) => ({
    ...base,
    steps: [
      { id: 'nick', title: 'Nick', actions: [{ type: 'cleave', target: 'dna.g8' }, { type: 'recruit', actor: 'polb', target: 'dna.g8' }] },
      { id: 'seal', title: 'Seal', actions: [{ type: 'recruit', actor: 'lig3', target: 'dna' }, { parallel: branches }] },
    ],
  });
  const ligate = { type: 'ligate', target: 'dna.g8', by: 'lig3', duration: 800 };
  const release = { type: 'unbind', actor: 'polb' };

  it('branch order does not change the resulting state', () => {
    const a = compileMechanism(withBranches([ligate, release])).at('seal');
    const b = compileMechanism(withBranches([release, ligate])).at('seal');
    expect({ actors: a.actors, sites: a.sites, interactions: a.interactions, occupancy: a.occupancy })
      .toEqual({ actors: b.actors, sites: b.sites, interactions: b.interactions, occupancy: b.occupancy });
    expect(a.sites['dna.g8']!.lesion).toBeUndefined();
    expect(primaryPartner(a, 'polb')).toBeUndefined();
  });

  it('assigns offsets: sequences add up, parallel blocks take the longest branch', () => {
    const snapshot = compileMechanism(withBranches([ligate, release])).at('seal');
    expect(snapshot.timeline.map(({ type, start, duration }) => ({ type, start, duration }))).toEqual([
      { type: 'recruit', start: 0, duration: 600 },
      { type: 'ligate', start: 600, duration: 800 },
      { type: 'unbind', start: 600, duration: 600 },
    ]);
    expect(snapshot.duration).toBe(1400);
  });

  it('rejects parallel branches that change the same state key', () => {
    expect(() => compileMechanism(withBranches([release, { type: 'hide', actor: 'lig3' }, { type: 'show', actor: 'lig3' }])))
      .toThrow(/parallel branches \[1\] and \[2\] both change actors\.lig3\.visible/);
  });
});
