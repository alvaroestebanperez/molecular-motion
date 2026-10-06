import { describe, expect, it } from 'vitest';
import { compileMechanism, migrateV1, migrateV2 } from '../src';
import { parseMechanism } from '../src/yaml';
import { MECHANISMS, projectToV1, readGolden, readV1Fixture } from './helpers';

describe('v1 → v2 migration', () => {
  it.each(MECHANISMS)('%s: migrated v1 document reproduces the v1 engine exactly', name => {
    const definition = parseMechanism(readV1Fixture(name));
    expect(definition.schemaVersion).toBe(7);
    expect(projectToV1(compileMechanism(definition))).toEqual(readGolden(name));
  });

  // Neither example mirrors its v1 original any more: PARP1 became the full BER → SSBR story and HR now
  // models resection up to the RAD51 filament (RFC 0004). The migrated v1 fixtures above stay locked.

  it('maps every v1 action to its v2 equivalent', () => {
    const migrated = migrateV1({
      schemaVersion: 1,
      actors: [{ id: 'p', type: 'protein', initiallyVisible: true }],
      steps: [{
        id: 's', title: 'S', actions: [
          { type: 'create-lesion', target: 'dna.a' },
          { type: 'create-lesion', target: 'dna.a', lesion: 'double-strand-break' },
          { type: 'create-lesion', target: 'dna.a', lesion: 'base-damage', duration: 100 },
          { type: 'repair-lesion', target: 'dna.a' },
          { type: 'modify', actor: 'p', modification: 'phospho', label: 'P' },
          { type: 'recruit', actor: 'p', target: 'dna' },
        ],
      }],
    }) as { actors: unknown[]; steps: { actions: unknown[] }[] };
    expect(migrated.actors[0]).toEqual({ id: 'p', type: 'protein', initial: { visible: true } });
    expect(migrated.steps[0]!.actions).toEqual([
      { type: 'cleave', target: 'dna.a' },
      { type: 'cleave', target: 'dna.a', lesion: 'double-strand-break' },
      { type: 'damage', target: 'dna.a', lesion: 'base-damage', duration: 100 },
      { type: 'repair', target: 'dna.a' },
      { type: 'modify', actor: 'p', kind: 'phospho', label: 'P' },
      { type: 'recruit', actor: 'p', target: 'dna' },
    ]);
  });

  it('leaves v2 documents untouched', () => {
    const document = { schemaVersion: 2, actors: [] };
    expect(migrateV1(document)).toBe(document);
  });
});

describe('v2 → v3 migration (RFC 0004)', () => {
  const v2 = (sites: unknown[], type = 'dna') => ({ schemaVersion: 2, actors: [{ id: 'a', type, sites }] });
  const sitesOf = (document: unknown) => (document as { actors: { sites: unknown[] }[] }).actors[0]!.sites;

  it('turns nucleic-acid layout keywords into coordinates on the implicit 100-unit molecule', () => {
    const migrated = migrateV2(v2([
      { id: 's', position: 'start' }, { id: 'c', position: 'center', type: '8-oxoG' }, { id: 'e', position: 'end' }, { id: 'n' },
    ]));
    expect((migrated as { schemaVersion: number }).schemaVersion).toBe(3);
    expect(sitesOf(migrated)).toEqual([{ id: 's', at: 28 }, { id: 'c', at: 50, type: '8-oxoG' }, { id: 'e', at: 72 }, { id: 'n', at: 50 }]);
    expect(sitesOf(migrateV2(v2([{ id: 'r', position: 'end' }], 'rna')))).toEqual([{ id: 'r', at: 72 }]);
  });

  it('keeps point positions as layout overrides without a coordinate', () => {
    expect(sitesOf(migrateV2(v2([{ id: 'p', position: { x: 300, y: 10 } }])))).toEqual([{ id: 'p', position: { x: 300, y: 10 } }]);
  });

  it('drops keywords on other actors, where they never had an effect', () => {
    expect(sitesOf(migrateV2(v2([{ id: 'y1068', position: 'start' }, { id: 'y1173' }], 'protein')))).toEqual([{ id: 'y1068' }, { id: 'y1173' }]);
  });

  it('chains after v1 and leaves v3 documents untouched', () => {
    const document = { schemaVersion: 3, actors: [] };
    expect(migrateV2(document)).toBe(document);
    expect(parseMechanism(readV1Fixture('homologous-recombination')).actors[0]!.sites).toEqual([{ id: 'break', type: 'double-strand-break', at: 50 }]);
  });
});
