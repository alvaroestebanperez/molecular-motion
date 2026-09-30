import { describe, expect, it } from 'vitest';
import { compileMechanism, MechanismValidationError, parseMechanism } from '../src';

const yaml = `
schemaVersion: 1
mechanism:
  id: repair
  name: Repair
actors:
  - id: dna
    type: dna
    sites:
      - id: lesion
  - id: sensor
    type: protein
steps:
  - id: damage
    title: Damage
    actions:
      - type: create-lesion
        target: dna.lesion
  - id: binding
    title: Binding
    actions:
      - type: bind
        actor: sensor
        target: dna.lesion
`;

describe('mechanism compiler', () => {
  it('parses YAML and deterministically reduces any step', () => {
    const mechanism = compileMechanism(parseMechanism(yaml));
    expect(mechanism.at('binding').actors.sensor!.boundTo).toBe('dna.lesion');
    expect(mechanism.at('damage').actors.sensor!.boundTo).toBeUndefined();
    expect(mechanism.at(1).lesions['dna.lesion']).toBe('single-strand-break');
  });

  it('reports semantic references with useful paths', () => {
    expect(() => parseMechanism(yaml.replace('dna.lesion', 'dna.missing'))).toThrow(MechanismValidationError);
    expect(() => parseMechanism(yaml.replace('dna.lesion', 'dna.missing'))).toThrow(/unknown site/);
  });
});
