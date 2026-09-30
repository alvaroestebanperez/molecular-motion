import { describe, expect, it } from 'vitest';
import { compileMechanism, migrateV1, parseMechanism } from '../src';
import { MECHANISMS, projectToV1, readExample, readGolden, readV1Fixture } from './helpers';

describe('v1 → v2 migration', () => {
  it.each(MECHANISMS)('%s: migrated v1 document reproduces the v1 engine exactly', name => {
    const definition = parseMechanism(readV1Fixture(name));
    expect(definition.schemaVersion).toBe(2);
    expect(projectToV1(compileMechanism(definition))).toEqual(readGolden(name));
  });

  it.each(MECHANISMS)('%s: hand-written v2 example keeps the same scenes as v1', name => {
    expect(projectToV1(compileMechanism(parseMechanism(readExample(name))))).toEqual(readGolden(name));
  });

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
