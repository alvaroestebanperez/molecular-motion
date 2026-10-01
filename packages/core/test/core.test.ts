import { describe, expect, it } from 'vitest';
import {
  builtinRegistry, compileMechanism, defineAlias, definePrimitive, field, MechanismValidationError, parseMechanism,
} from '../src';

const yaml = `
schemaVersion: 2
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
      - type: cleave
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
    expect(mechanism.at(1).sites['dna.lesion']!.lesion).toBe('single-strand-break');
  });

  it('reports semantic references with useful paths', () => {
    expect(() => parseMechanism(yaml.replace('dna.lesion', 'dna.missing'))).toThrow(MechanismValidationError);
    expect(() => parseMechanism(yaml.replace('dna.lesion', 'dna.missing'))).toThrow(/steps\[0\]\.actions\[0\]\.target references unknown site/);
  });

  it('rejects unknown actions and misspelled fields', () => {
    expect(() => parseMechanism(yaml.replace('type: cleave', 'type: explode'))).toThrow(/"explode" is not a registered action/);
    expect(() => parseMechanism(yaml.replace('actor: sensor', 'acter: sensor'))).toThrow(/acter is not a field of "bind"/);
  });

  it('keeps renderer-only visual presets separate from mechanism state', () => {
    const definition = parseMechanism(yaml.replace('type: protein', 'type: protein\n    visual: { preset: glycosylase }'));
    expect(definition.actors[1]!.visual).toEqual({ preset: 'glycosylase' });
    expect(() => parseMechanism(yaml.replace('type: protein', 'type: protein\n    visual: { preset: "Bad preset" }'))).toThrow(/visual\.preset must be a lowercase identifier/);
  });

  it('reports alias errors at the authored path', () => {
    expect(() => parseMechanism(yaml.replace('type: cleave\n        target: dna.lesion', 'type: phosphorylate\n        actor: ghost')))
      .toThrow(/steps\[0\]\.actions\[0\]\.actor references unknown actor "ghost"/);
  });

  it('reports state-dependent errors at compile time', () => {
    const ligateIntact = yaml.replace('type: cleave', 'type: ligate');
    expect(() => compileMechanism(parseMechanism(ligateIntact))).toThrow(/steps\[0\]\.actions\[0\]: no strand break to ligate/);
  });

  it('still accepts schemaVersion 1 documents', () => {
    const v1 = yaml.replace('schemaVersion: 2', 'schemaVersion: 1').replace('type: cleave', 'type: create-lesion');
    expect(compileMechanism(parseMechanism(v1)).at(1).sites['dna.lesion']!.lesion).toBe('single-strand-break');
  });
});

describe('built-in actions across target mechanisms', () => {
  it('BER: base damage → abasic site → nick → sealed', () => {
    const mechanism = compileMechanism({
      schemaVersion: 2,
      mechanism: { id: 'ber', name: 'BER' },
      actors: [{ id: 'dna', type: 'dna', sites: [{ id: 'g' }] }, { id: 'ogg1', type: 'protein' }, { id: 'ape1', type: 'protein' }, { id: 'lig3', type: 'protein' }],
      steps: [
        { id: 'ox', title: 'Oxidation', actions: [{ type: 'damage', target: 'dna.g' }] },
        { id: 'glyc', title: 'Glycosylase', actions: [{ type: 'recruit', actor: 'ogg1', target: 'dna.g' }, { type: 'excise', target: 'dna.g', by: 'ogg1' }] },
        { id: 'incise', title: 'APE1', actions: [{ type: 'cleave', target: 'dna.g', by: 'ape1' }] },
        { id: 'seal', title: 'Ligation', actions: [{ type: 'ligate', target: 'dna.g', by: 'lig3' }] },
      ],
    });
    expect(['ox', 'glyc', 'incise', 'seal'].map(step => mechanism.at(step).sites['dna.g']!.lesion))
      .toEqual(['base-damage', 'abasic-site', 'single-strand-break', undefined]);
  });

  it('cGAS–STING: synthesis, activation, and translocation between declared compartments', () => {
    const mechanism = compileMechanism({
      schemaVersion: 2,
      mechanism: { id: 'cgas-sting', name: 'cGAS–STING' },
      compartments: ['cytoplasm', 'er', 'golgi', 'nucleus'],
      actors: [
        { id: 'cgas', type: 'protein', compartment: 'cytoplasm', initial: { visible: true, activity: 'inactive' } },
        { id: 'cgamp', type: 'molecule', initial: { present: false } },
        { id: 'sting', type: 'protein', compartment: 'er', initial: { visible: true } },
        { id: 'tbk1', type: 'protein', compartment: 'er' },
        { id: 'irf3', type: 'protein', compartment: 'cytoplasm', initial: { visible: true } },
      ],
      steps: [
        { id: 'sense', title: 'cGAS activation', actions: [{ type: 'activate', actor: 'cgas' }] },
        { id: 'cgamp', title: 'cGAMP synthesis', actions: [{ type: 'synthesize', product: 'cgamp', by: 'cgas' }] },
        { id: 'sting', title: 'STING activation', actions: [{ type: 'bind', actor: 'cgamp', target: 'sting' }, { type: 'recruit', actor: 'tbk1', target: 'sting' }, { type: 'translocate', actor: 'sting', to: 'golgi', includeBound: true }] },
        { id: 'irf3', title: 'IRF3', actions: [{ type: 'phosphorylate', actor: 'irf3', site: 'S386', by: 'tbk1' }, { type: 'translocate', actor: 'irf3', to: 'nucleus' }] },
      ],
    });
    expect(mechanism.at('cgamp').actors.cgamp).toMatchObject({ present: true, visible: true, compartment: 'cytoplasm' });
    const sting = mechanism.at('sting');
    expect(sting.actors.sting!.compartment).toBe('golgi');
    expect(sting.actors.cgamp!.compartment).toBe('golgi');     // includeBound: bound to STING
    expect(sting.actors.tbk1!.compartment).toBe('golgi');
    const irf3 = mechanism.at('irf3').actors.irf3!;
    expect(irf3.compartment).toBe('nucleus');
    expect(irf3.modifications).toEqual([{ id: 'phosphorylation@S386', kind: 'phosphorylation', site: 'S386', label: 'P' }]);
    expect(mechanism.at('irf3').timeline[0]).toMatchObject({ type: 'phosphorylate', primitive: 'modify', presentation: { verb: 'phosphorylates' }, agent: 'tbk1' });
  });

  it('EGFR–MAPK: inhibition, dephosphorylation, degradation', () => {
    const mechanism = compileMechanism({
      schemaVersion: 2,
      mechanism: { id: 'egfr', name: 'EGFR' },
      compartments: ['extracellular', 'membrane', 'cytoplasm'],
      actors: [
        { id: 'egf', type: 'molecule', compartment: 'extracellular', initial: { visible: true } },
        { id: 'egfr', type: 'protein', compartment: 'membrane', initial: { visible: true } },
        { id: 'erlotinib', type: 'molecule', compartment: 'cytoplasm' },
      ],
      steps: [
        { id: 'on', title: 'On', actions: [{ type: 'bind', actor: 'egf', target: 'egfr' }, { type: 'phosphorylate', actor: 'egfr', site: 'Y1068' }, { type: 'activate', actor: 'egfr', by: 'egf' }] },
        { id: 'drug', title: 'Drug', actions: [{ type: 'inhibit', actor: 'egfr', by: 'erlotinib' }, { type: 'dephosphorylate', actor: 'egfr', site: 'Y1068' }] },
        { id: 'down', title: 'Down', actions: [{ type: 'degrade', actor: 'egfr' }] },
      ],
    });
    expect(mechanism.at('on').actors.egfr!.activity).toEqual({ state: 'active', by: 'egf' });
    expect(mechanism.at('drug').actors.egfr).toMatchObject({ activity: { state: 'inhibited', by: 'erlotinib' }, modifications: [] });
    const down = mechanism.at('down').actors;
    expect(down.egfr).toMatchObject({ present: false, visible: false });
    expect(down.egf!.boundTo).toBeUndefined();
  });

  it('refuses actions on actors that are not present', () => {
    expect(() => compileMechanism({
      schemaVersion: 2,
      mechanism: { id: 'x', name: 'X' },
      actors: [{ id: 'a', type: 'protein' }, { id: 'b', type: 'protein', initial: { present: false } }],
      steps: [{ id: 's', title: 'S', actions: [{ type: 'bind', actor: 'a', target: 'b' }] }],
    })).toThrow(/"b" is not present/);
  });
});

describe('translocate', () => {
  // mek ← erk ← dusp6 (erk bound to mek, dusp6 bound to erk); nothing bound to dusp6
  const doc = (translocation: Record<string, unknown>) => ({
    schemaVersion: 2,
    mechanism: { id: 'mapk', name: 'MAPK' },
    compartments: ['cytoplasm', 'nucleus'],
    actors: [
      { id: 'mek', type: 'protein', compartment: 'cytoplasm', initial: { visible: true } },
      { id: 'erk', type: 'protein', compartment: 'cytoplasm' },
      { id: 'dusp6', type: 'protein', compartment: 'cytoplasm' },
    ],
    steps: [
      { id: 'assemble', title: 'Assemble', actions: [{ type: 'bind', actor: 'erk', target: 'mek' }, { type: 'bind', actor: 'dusp6', target: 'erk' }] },
      { id: 'move', title: 'Move', actions: [{ type: 'translocate', to: 'nucleus', ...translocation }] },
    ],
  });
  const compartments = (snapshot: ReturnType<ReturnType<typeof compileMechanism>['at']>) =>
    Object.fromEntries(Object.values(snapshot.actors).map(actor => [actor.id, actor.compartment]));
  const bindings = (snapshot: ReturnType<ReturnType<typeof compileMechanism>['at']>) =>
    Object.fromEntries(Object.values(snapshot.actors).map(actor => [actor.id, actor.boundTo]));

  it('moves only the named actor by default and changes no bindings', () => {
    const mechanism = compileMechanism(doc({ actor: 'erk' }));
    const move = mechanism.at('move');
    expect(compartments(move)).toEqual({ mek: 'cytoplasm', erk: 'nucleus', dusp6: 'cytoplasm' });
    expect(bindings(move)).toEqual(bindings(mechanism.at('assemble')));
    expect(move.timeline[0]!.changes).toEqual([{ key: 'actors.erk.compartment', from: 'cytoplasm', to: 'nucleus' }]);
  });

  it('includeBound: false is the default', () => {
    expect(compileMechanism(doc({ actor: 'erk', includeBound: false })).at('move').actors)
      .toEqual(compileMechanism(doc({ actor: 'erk' })).at('move').actors);
  });

  it('includeBound moves actors bound to it, transitively, and keeps every binding', () => {
    const mechanism = compileMechanism(doc({ actor: 'mek', includeBound: true }));
    const move = mechanism.at('move');
    expect(compartments(move)).toEqual({ mek: 'nucleus', erk: 'nucleus', dusp6: 'nucleus' });
    expect(bindings(move)).toEqual({ mek: undefined, erk: 'mek', dusp6: 'erk' });
    expect(move.timeline[0]!.changes.map(change => change.key)).toEqual(['actors.mek.compartment', 'actors.erk.compartment', 'actors.dusp6.compartment']);
  });

  it('includeBound does not move the partner the actor itself is bound to', () => {
    const move = compileMechanism(doc({ actor: 'erk', includeBound: true })).at('move');
    expect(compartments(move)).toEqual({ mek: 'cytoplasm', erk: 'nucleus', dusp6: 'nucleus' });
    expect(move.actors.erk!.boundTo).toBe('mek');
  });

  it('reports invalid translocations', () => {
    expect(() => compileMechanism(doc({ actor: 'erk', to: 'cytoplasm' }))).toThrow(/"erk" is already in "cytoplasm"/);
    expect(() => compileMechanism(doc({ actor: 'erk', to: 'golgi' }))).toThrow(/unknown compartment "golgi"/);
    expect(() => compileMechanism(doc({ actor: 'erk', includeBound: 'yes' }))).toThrow(/includeBound must be a boolean/);
  });
});

describe('compartments', () => {
  const doc = (compartments: unknown[]) => ({
    schemaVersion: 2, mechanism: { id: 'x', name: 'X' }, compartments,
    actors: [{ id: 'a', type: 'protein', compartment: 'nucleus' }],
    steps: [{ id: 's', title: 'S', actions: [{ type: 'show', actor: 'a' }] }],
  });

  it('resolves shorthands from the standard library and drops undeclared library parents', () => {
    expect(compileMechanism(doc(['nucleus'])).definition.compartments).toEqual([{ id: 'nucleus', kind: 'nucleus', label: 'Nucleus' }]);
    expect(compileMechanism(doc(['cytoplasm', 'nucleus'])).definition.compartments[1]!.parent).toBe('cytoplasm');
  });

  it('accepts custom compartments and rejects bad references', () => {
    expect(compileMechanism(doc([{ id: 'nucleus', kind: 'nucleus' }, { id: 'nucleolus', parent: 'nucleus' }])).definition.compartments[1])
      .toEqual({ id: 'nucleolus', kind: 'generic', parent: 'nucleus' });
    expect(() => compileMechanism(doc(['cytoplasm']))).toThrow(/unknown compartment "nucleus"/);
    expect(() => compileMechanism(doc(['nucleus', 'vacuole']))).toThrow(/"vacuole" is not a standard compartment/);
    expect(() => compileMechanism(doc([{ id: 'nucleus', parent: 'x' }, { id: 'x', parent: 'nucleus' }]))).toThrow(/cyclic/);
  });
});

describe('action registry', () => {
  it('can be extended with custom primitives and aliases without touching the engine', () => {
    const registry = builtinRegistry.extend([
      defineAlias({
        type: 'acetylate',
        description: 'Add an acetyl group.',
        fields: { actor: field.actor({ required: true }), site: field.string() },
        presentation: { verb: 'acetylates' },
        expand: action => ({ type: 'modify', actor: action.actor, kind: 'acetylation', site: action.site, label: 'Ac' }),
      }),
      definePrimitive<{ type: string; actor: string }>({
        type: 'reset',
        description: 'Clear all modifications.',
        fields: { actor: field.actor({ required: true }) },
        presentation: { verb: 'resets' },
        apply: (_state, action, ctx) => { ctx.actor(action.actor).modifications = []; },
      }),
    ]);
    const mechanism = compileMechanism({
      schemaVersion: 2,
      mechanism: { id: 'x', name: 'X' },
      actors: [{ id: 'h3', type: 'protein' }],
      steps: [
        { id: 'ac', title: 'Ac', actions: [{ type: 'acetylate', actor: 'h3', site: 'K27' }] },
        { id: 'reset', title: 'Reset', actions: [{ type: 'reset', actor: 'h3' }] },
      ],
    }, { registry });
    expect(mechanism.at('ac').actors.h3!.modifications[0]!.id).toBe('acetylation@K27');
    expect(mechanism.at('reset').actors.h3!.modifications).toEqual([]);
    expect(() => builtinRegistry.extend([builtinRegistry.get('bind')!])).toThrow(/already registered/);
  });
});

describe('references and step metadata', () => {
  const doc = (extra: Record<string, unknown> = {}, step: Record<string, unknown> = {}) => ({
    schemaVersion: 2,
    mechanism: { id: 'x', name: 'X', references: ['review'] },
    references: [
      { id: 'review', citation: 'Ray Chaudhuri & Nussenzweig (2017) Nat Rev Mol Cell Biol', pmid: '28676700', doi: '10.1038/nrm.2017.53' },
      { id: 'pathway', reactome: 'R-HSA-73884' },
    ],
    actors: [{ id: 'a', type: 'protein' }],
    steps: [{ id: 's', title: 'S', summary: 'Short', keyEvents: ['One', 'Two'], references: ['review', 'pathway'], actions: [], ...step }],
    ...extra,
  });

  it('keeps summary, key events, and references on the step', () => {
    const { definition } = compileMechanism(doc());
    expect(definition.steps[0]).toMatchObject({ summary: 'Short', keyEvents: ['One', 'Two'], references: ['review', 'pathway'] });
    expect(definition.references.map(reference => reference.id)).toEqual(['review', 'pathway']);
  });

  it('defaults references to an empty list', () => {
    const { references: _, ...rest } = doc({ mechanism: { id: 'x', name: 'X' } }, { references: undefined });
    expect(compileMechanism(rest).definition.references).toEqual([]);
  });

  it('rejects unknown ids, malformed identifiers, and references without an identifier', () => {
    expect(() => compileMechanism(doc({}, { references: ['missing'] }))).toThrow(/steps\[0\]\.references\[0\] references unknown reference "missing"/);
    expect(() => compileMechanism(doc({ references: [{ id: 'r', pmid: 'PMC123' }] }, { references: [] }))).toThrow(/pmid is not a valid pmid/);
    expect(() => compileMechanism(doc({ references: [{ id: 'r', citation: 'Someone (2020)' }], mechanism: { id: 'x', name: 'X' } }, { references: [] })))
      .toThrow(/needs at least one of: pmid, doi, reactome, url/);
    expect(() => compileMechanism(doc({}, { keyEvents: ['ok', ''] }))).toThrow(/keyEvents must be an array of non-empty strings/);
  });
});
