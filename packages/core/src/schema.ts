import { builtinRegistry } from './actions';
import { COMPARTMENT_KINDS } from './compartments';
import { BASE_FIELDS, type ActionRegistry, type FieldSpec } from './registry';

type JsonSchema = Record<string, unknown>;

const ID = '^[a-z][a-z0-9-]*$';
const REFERENCE = '^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)?$';
const SITE = '^[a-z][a-z0-9-]*\\.[a-z][a-z0-9-]*$';

function fieldSchema(spec: FieldSpec): JsonSchema {
  const description = spec.description ? { description: spec.description } : {};
  switch (spec.kind) {
    case 'actor':
    case 'compartment': return { $ref: '#/$defs/id', ...description };
    case 'reference': return { type: 'string', pattern: REFERENCE, ...description };
    case 'site': return { type: 'string', pattern: SITE, ...description };
    case 'string': return { type: 'string', minLength: 1, ...description };
    case 'boolean': return { type: 'boolean', ...description };
    case 'integer': return { type: 'integer', ...(spec.min !== undefined && { minimum: spec.min }), ...description };
    case 'enum': return { enum: [...spec.values], ...description };
  }
}

/** JSON Schema for mechanism documents, generated from the registry so the two cannot drift. */
export function toJsonSchema(registry: ActionRegistry = builtinRegistry): JsonSchema {
  const actions = registry.list().map(definition => {
    const fields = { ...BASE_FIELDS, ...definition.fields };
    return {
      type: 'object',
      description: definition.description,
      required: ['type', ...Object.entries(fields).filter(([, spec]) => spec.required).map(([key]) => key)],
      properties: {
        type: { const: definition.type },
        ...Object.fromEntries(Object.entries(fields).map(([key, spec]) => [key, fieldSchema(spec)])),
      },
      additionalProperties: false,
    };
  });

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://molecular-motion.dev/schema/v2.json',
    title: 'Molecular Motion mechanism',
    type: 'object',
    required: ['schemaVersion', 'mechanism', 'actors', 'steps'],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: 2 },
      mechanism: {
        type: 'object',
        required: ['id', 'name'],
        additionalProperties: false,
        properties: {
          id: { $ref: '#/$defs/id' },
          name: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          references: { $ref: '#/$defs/referenceIds' },
        },
      },
      references: { type: 'array', items: { $ref: '#/$defs/reference' } },
      compartments: { type: 'array', items: { $ref: '#/$defs/compartment' } },
      actors: { type: 'array', minItems: 1, items: { $ref: '#/$defs/actor' } },
      steps: { type: 'array', minItems: 1, items: { $ref: '#/$defs/step' } },
    },
    $defs: {
      id: { type: 'string', pattern: ID },
      referenceIds: { type: 'array', items: { type: 'string', minLength: 1 } },
      reference: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        anyOf: [{ required: ['pmid'] }, { required: ['doi'] }, { required: ['reactome'] }, { required: ['url'] }],
        properties: {
          id: { type: 'string', minLength: 1 },
          citation: { type: 'string', minLength: 1, description: 'Human-readable short citation, e.g. "Ray Chaudhuri & Nussenzweig (2017) Nat Rev Mol Cell Biol".' },
          pmid: { type: 'string', pattern: '^\\d{1,9}$' },
          doi: { type: 'string', pattern: '^10\\.\\d{4,9}/\\S+$' },
          reactome: { type: 'string', pattern: '^R-[A-Z]{3}-\\d+(\\.\\d+)?$' },
          url: { type: 'string', format: 'uri' },
        },
      },
      point: {
        type: 'object',
        required: ['x', 'y'],
        properties: { x: { type: 'number' }, y: { type: 'number' } },
        additionalProperties: false,
      },
      compartment: {
        oneOf: [
          { type: 'string', description: 'A standard compartment id.' },
          {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: {
              id: { $ref: '#/$defs/id' },
              kind: { enum: [...COMPARTMENT_KINDS] },
              label: { type: 'string' },
              parent: { $ref: '#/$defs/id' },
            },
          },
        ],
      },
      site: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: {
          id: { $ref: '#/$defs/id' },
          type: { type: 'string' },
          label: { type: 'string' },
          position: { oneOf: [{ enum: ['start', 'center', 'end'] }, { $ref: '#/$defs/point' }] },
        },
      },
      actor: {
        type: 'object',
        required: ['id', 'type'],
        additionalProperties: false,
        properties: {
          id: { $ref: '#/$defs/id' },
          type: { enum: ['dna', 'rna', 'protein', 'molecule', 'complex'] },
          label: { type: 'string' },
          description: { type: 'string' },
          color: { type: 'string' },
          position: { $ref: '#/$defs/point' },
          sites: { type: 'array', items: { $ref: '#/$defs/site' } },
          compartment: { $ref: '#/$defs/id' },
          molecule: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$', description: 'Molecule actors only: key of the small-molecule vocabulary naming its structure, e.g. atp or nad-plus.' },
          initial: {
            type: 'object',
            additionalProperties: false,
            properties: {
              present: { type: 'boolean' },
              visible: { type: 'boolean' },
              activity: { enum: ['active', 'inactive', 'inhibited'] },
            },
          },
        },
      },
      step: {
        type: 'object',
        required: ['id', 'title', 'actions'],
        additionalProperties: false,
        properties: {
          id: { $ref: '#/$defs/id' },
          title: { type: 'string', minLength: 1 },
          summary: { type: 'string', minLength: 1 },
          description: { type: 'string' },
          keyEvents: { type: 'array', items: { type: 'string', minLength: 1 } },
          references: { $ref: '#/$defs/referenceIds' },
          duration: { type: 'number', minimum: 0 },
          actions: { type: 'array', items: { $ref: '#/$defs/node' } },
        },
      },
      node: {
        oneOf: [
          { $ref: '#/$defs/action' },
          { type: 'object', required: ['sequence'], additionalProperties: false, properties: { sequence: { type: 'array', minItems: 1, items: { $ref: '#/$defs/node' } } } },
          { type: 'object', required: ['parallel'], additionalProperties: false, properties: { parallel: { type: 'array', minItems: 1, items: { $ref: '#/$defs/node' } } } },
        ],
      },
      action: { oneOf: actions },
    },
  };
}
