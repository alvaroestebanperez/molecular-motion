import { describe, expect, it } from 'vitest';
import { actorInstances, compileMechanism, instanceDefinition, migrateV3, parseMechanism, primaryPartner, type ActionNode } from '../src';

const doc = (actors: Record<string, unknown>[], actions: ActionNode[] = []) => ({
  schemaVersion: 4, mechanism: { id: 'x', name: 'X' },
  actors, steps: [{ id: 's', title: 'S', actions }],
});
const egfr = { id: 'egfr', type: 'protein', copies: 2, sites: [{ id: 'y1068' }] };

describe('actor instances (RFC 0005 §3)', () => {
  it('compiles copies to individual instances and keeps single-copy actors under their own id', () => {
    const definition = parseMechanism(doc([{ id: 'rad51', type: 'protein', copies: 3 }, { id: 'brca2', type: 'protein' }]));
    expect(actorInstances(definition).map(instance => instance.id)).toEqual(['rad51#1', 'rad51#2', 'rad51#3', 'brca2']);
    expect(instanceDefinition(definition, 'rad51#2')!.id).toBe('rad51');
    expect(instanceDefinition(definition, 'rad51#4')).toBeUndefined();
    expect(Object.keys(compileMechanism(definition).at(0).actors)).toEqual(['rad51#1', 'rad51#2', 'rad51#3', 'brca2']);
  });

  it('gives every copy its own state and its own sites', () => {
    const snapshot = compileMechanism(doc([egfr, { id: 'egf', type: 'molecule' }], [
      { type: 'phosphorylate', actor: 'egfr#2', site: 'Y1068', by: 'egfr#1' },
      { type: 'activate', actor: 'egfr#1' },
      { type: 'bind', actor: 'egf', target: 'egfr#1' },
    ])).at(0);
    expect(snapshot.actors['egfr#1']!.modifications).toEqual([]);
    expect(snapshot.actors['egfr#2']!.modifications.map(item => item.id)).toEqual(['phosphorylation@Y1068']);
    expect(snapshot.actors['egfr#1']!.activity).toEqual({ state: 'active' });
    expect(snapshot.actors['egfr#2']!.activity).toBeUndefined();
    expect(primaryPartner(snapshot, 'egf')).toBe('egfr#1');
    expect(Object.keys(snapshot.sites)).toEqual(['egfr#1.y1068', 'egfr#2.y1068']);
    expect(snapshot.timeline[0]!.agent).toBe('egfr#1');
  });

  it('explains references that do not name one instance', () => {
    expect(() => compileMechanism(doc([egfr], [{ type: 'activate', actor: 'egfr' }]))).toThrow(/references "egfr", which has 2 copies; name one instance such as "egfr#1"/);
    expect(() => compileMechanism(doc([egfr], [{ type: 'activate', actor: 'egfr#3' }]))).toThrow(/references unknown instance "egfr#3" \("egfr" has 2 copies\)/);
    expect(() => compileMechanism(doc([egfr, { id: 'grb2', type: 'protein' }], [{ type: 'bind', actor: 'grb2', target: 'egfr.y1068' }]))).toThrow(/which has 2 copies/);
    expect(() => compileMechanism(doc([{ id: 'p', type: 'protein' }], [{ type: 'activate', actor: 'p#1' }]))).toThrow(/references unknown actor "p#1"/);
  });

  it('validates copies', () => {
    expect(() => parseMechanism(doc([{ id: 'a', type: 'protein', copies: 1 }]))).toThrow(/copies must be an integer ≥ 2 \(omit it for a single copy\)/);
    expect(() => parseMechanism(doc([{ id: 'a', type: 'protein', copies: 2.5 }]))).toThrow(/copies must be an integer ≥ 2/);
    expect(() => parseMechanism(doc([{ id: 'dna', type: 'dna', copies: 2, sites: [] }]))).toThrow(/copies is not allowed on dna and rna: each nucleic-acid molecule is its own actor/);
    expect(() => parseMechanism(doc([{ id: 'a#1', type: 'protein' }]))).toThrow(/id must not contain "#"/);
  });
});

describe('v3 → v4 migration (RFC 0005 §8)', () => {
  it('only moves the version, so ids, references and keys are unchanged', () => {
    const v3 = { schemaVersion: 3, actors: [{ id: 'a', type: 'protein' }], steps: [] };
    expect(migrateV3(v3)).toEqual({ ...v3, schemaVersion: 4 });
    const v4 = { schemaVersion: 4 };
    expect(migrateV3(v4)).toBe(v4);
    expect(parseMechanism({ ...doc([{ id: 'a', type: 'protein' }]), schemaVersion: 3 }).schemaVersion).toBe(6);
  });
});
