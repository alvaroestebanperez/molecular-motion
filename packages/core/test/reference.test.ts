import { readFileSync, writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { ACTIVITIES, BASE_FIELDS, builtinRegistry, COMPARTMENT_KINDS, compileMechanism, definePrimitive, field, LESIONS, STANDARD_COMPARTMENTS, type ActionDefinition, type ActionSpec, type FieldSpec } from '../src';
import { parseMechanism } from '../src/yaml';

/**
 * `docs/actions.md` is generated from the action registry, like `schema.json`, so the reference of
 * the actions cannot drift from what the compiler accepts. `npm run reference` regenerates it.
 */
const path = new URL('../../../docs/actions.md', import.meta.url);

const KINDS: Record<Exclude<FieldSpec['kind'], 'integer' | 'enum'>, string> = {
  actor: 'instance',
  actors: 'list of instances',
  reference: '`actor` or `actor.site`',
  site: '`actor.site`',
  compartment: 'compartment id',
  string: 'text',
  boolean: '`true` or `false`',
  interval: '`[from, to]`',
};
const kindOf = (spec: FieldSpec) => spec.kind === 'integer' ? `integer${spec.min !== undefined ? ` ≥ ${spec.min}` : ''}`
  : spec.kind === 'enum' ? spec.values.map(value => `\`${value}\``).join(', ')
  : KINDS[spec.kind];
const cell = (text: string) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ');

function fieldsTable(fields: Record<string, FieldSpec>): string {
  const rows = Object.entries(fields).map(([name, spec]) =>
    `| \`${name}\` | ${spec.required ? 'yes' : ''} | ${cell(kindOf(spec))} | ${cell(spec.description ?? '')} |`);
  return rows.length ? ['| Field | Required | Value | Notes |', '|---|---|---|---|', ...rows].join('\n') : '_No fields of its own._';
}

/** What an alias becomes: the primitive it reaches, and the fields it sets when given only what it requires. */
function expansion(definition: ActionDefinition): string {
  const given = Object.fromEntries(Object.entries(definition.fields).filter(([, spec]) => spec.required).map(([name]) => [name, `‹${name}›`]));
  const { primitive, spec } = builtinRegistry.resolve({ type: definition.type, ...given } as ActionSpec);
  const set = Object.entries(spec).filter(([name, value]) => name !== 'type' && !(typeof value === 'string' && value.startsWith('‹')));
  const passed = Object.entries(spec).filter(([, value]) => typeof value === 'string' && value.startsWith('‹'))
    .filter(([name, value]) => value !== `‹${name}›`).map(([name, value]) => `its \`${String(value).slice(1, -1)}\` as \`${name}\``);
  return `Alias of [\`${primitive.type}\`](#${primitive.type})`
    + (set.length ? `, with ${set.map(([name, value]) => `\`${name}: ${String(value)}\``).join(', ')}` : '')
    + (passed.length ? `${set.length ? ';' : ','} it passes ${passed.join(', ')}` : '') + '.';
}

function section(definition: ActionDefinition): string {
  return [
    `### \`${definition.type}\``,
    '',
    definition.description,
    '',
    ...(definition.kind === 'alias' ? [expansion(definition), ''] : []),
    `In captions: "${definition.presentation.verb}"${definition.presentation.tone && definition.presentation.tone !== 'neutral' ? ` (${definition.presentation.tone})` : ''}.`,
    '',
    fieldsTable(definition.fields),
  ].join('\n');
}

function reference(): string {
  const all = builtinRegistry.list();
  const [primitives, aliases] = [all.filter(item => item.kind === 'primitive'), all.filter(item => item.kind === 'alias')];
  const index = (list: ActionDefinition[]) => list.map(item => `[\`${item.type}\`](#${item.type})`).join(' · ');
  return [
    '# Actions',
    '',
    '<!-- Generated from the action registry by packages/core/test/reference.test.ts. Do not edit: run `npm run reference`. -->',
    '',
    'Every action a step can contain, as the compiler accepts it. For the rest of a document, see [the language](language.md).',
    '',
    `**Primitives** define every change of state: ${index(primitives)}`,
    '',
    `**Aliases** are biological verbs that expand to a primitive and keep their own wording in captions: ${index(aliases)}`,
    '',
    '## Fields every action accepts',
    '',
    fieldsTable(BASE_FIELDS),
    '',
    '## Primitives',
    '',
    primitives.map(section).join('\n\n'),
    '',
    '## Aliases',
    '',
    aliases.map(section).join('\n\n'),
    '',
  ].join('\n');
}

it('docs/actions.md matches the action registry (UPDATE_REFERENCE=1 to regenerate)', () => {
  const generated = reference();
  if (process.env.UPDATE_REFERENCE) writeFileSync(path, generated);
  expect(readFileSync(path, 'utf8')).toBe(generated);
});

/**
 * `docs/language.md` is written by hand. These keep its checkable parts honest: the complete documents
 * it shows compile, every action it mentions exists, and it names the vocabularies the core defines.
 */
const language = readFileSync(new URL('../../../docs/language.md', import.meta.url), 'utf8');
const blocks = (tag: string) => [...language.matchAll(new RegExp('```' + tag + '\\n([\\s\\S]*?)```', 'g'))].map(match => match[1]!);

it('the complete documents in docs/language.md compile', () => {
  const documents = blocks('yaml').filter(block => block.startsWith('schemaVersion:'));
  expect(documents.length).toBeGreaterThan(0);
  for (const document of documents) expect(compileMechanism(parseMechanism(document)).length).toBeGreaterThan(0);
});

it('docs/language.md names only actions that exist, and every vocabulary of the core', () => {
  const used = [...language.matchAll(/type: ([a-z-]+)[,\s}]/g)].map(match => match[1]!).filter(name => !['dna', 'rna', 'protein', 'molecule', 'complex'].includes(name));
  expect(used.length).toBeGreaterThan(5);
  for (const name of used) expect(builtinRegistry.get(name), name).toBeDefined();
  for (const word of [...COMPARTMENT_KINDS, ...Object.keys(STANDARD_COMPARTMENTS), ...LESIONS, ...ACTIVITIES]) expect(language, word).toContain(`\`${word}\``);
});

it('the custom action of docs/language.md works as written', () => {
  const methylate = definePrimitive<ActionSpec & { actor: string }>({
    type: 'methylate',
    description: 'Add a methyl group to an actor.',
    fields: { actor: field.actor({ required: true }) },
    presentation: { verb: 'methylates' },
    apply(_state, action, ctx) {
      ctx.requirePresent(action.actor).modifications.push({ id: 'methylation', kind: 'methylation', label: 'Me' });
    },
  });
  expect(language).toContain("ctx.requirePresent(action.actor).modifications.push({ id: 'methylation', kind: 'methylation', label: 'Me' });");
  const mechanism = compileMechanism({
    schemaVersion: 6, mechanism: { id: 'x', name: 'X' }, actors: [{ id: 'histone', type: 'protein' }],
    steps: [{ id: 's', title: 'S', actions: [{ type: 'methylate', actor: 'histone' }] }],
  }, { registry: builtinRegistry.extend([methylate]) });
  expect(mechanism.at(0).actors.histone!.modifications).toEqual([{ id: 'methylation', kind: 'methylation', label: 'Me' }]);
});
