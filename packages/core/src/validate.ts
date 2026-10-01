import { builtinRegistry } from './actions';
import { normalizeCompartments } from './compartments';
import { migrateV1 } from './migrate';
import { BASE_FIELDS, type ActionRegistry, type FieldSpec } from './registry';
import type { ActionSpec, MechanismDefinition } from './types';

const ACTOR_TYPES = new Set(['dna', 'rna', 'protein', 'molecule', 'complex']);
const ACTIVITIES = new Set(['active', 'inactive', 'inhibited']);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export class MechanismValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid molecular mechanism:\n- ${issues.join('\n- ')}`);
    this.name = 'MechanismValidationError';
  }
}

export interface ValidateOptions { registry?: ActionRegistry }

interface References {
  actors: Map<string, Set<string>>;
  compartments: Set<string>;
}

/**
 * Structural and referential validation. Accepts v1 documents (migrated automatically) and returns
 * a normalised, deep-copied v2 definition. State-dependent checks happen later, during compilation.
 */
export function validateMechanism(input: unknown, options: ValidateOptions = {}): MechanismDefinition {
  const registry = options.registry ?? builtinRegistry;
  const value = migrateV1(input);
  const issues: string[] = [];
  if (!isObject(value)) throw new MechanismValidationError(['root must be an object']);
  if (value.schemaVersion !== 2) issues.push('schemaVersion must be 1 or 2');
  if (!isObject(value.mechanism)) issues.push('mechanism must be an object');
  else {
    requiredString(value.mechanism.id, 'mechanism.id', issues);
    requiredString(value.mechanism.name, 'mechanism.name', issues);
  }
  if (value.compartments !== undefined && !Array.isArray(value.compartments)) issues.push('compartments must be an array');
  if (!Array.isArray(value.actors) || value.actors.length === 0) issues.push('actors must be a non-empty array');
  if (!Array.isArray(value.steps) || value.steps.length === 0) issues.push('steps must be a non-empty array');

  const compartments = normalizeCompartments(Array.isArray(value.compartments) ? value.compartments : [], issues);
  if (value.references !== undefined && !Array.isArray(value.references)) issues.push('references must be an array');
  const references = Array.isArray(value.references) ? value.references : [];
  const referenceIds = validateReferences(references, issues);
  const checkReferenceIds = (ids: unknown, path: string) => {
    if (ids === undefined) return;
    if (!Array.isArray(ids)) return issues.push(`${path} must be an array of reference ids`);
    ids.forEach((id, index) => {
      if (typeof id !== 'string' || !referenceIds.has(id)) issues.push(`${path}[${index}] references unknown reference "${String(id)}"`);
    });
  };
  if (isObject(value.mechanism)) checkReferenceIds(value.mechanism.references, 'mechanism.references');
  const refs: References = { actors: new Map(), compartments: new Set(compartments.map(compartment => compartment.id)) };

  if (Array.isArray(value.actors)) value.actors.forEach((actor, index) => {
    const path = `actors[${index}]`;
    if (!isObject(actor)) return issues.push(`${path} must be an object`);
    requiredString(actor.id, `${path}.id`, issues);
    const sites = new Set<string>();
    if (typeof actor.id === 'string') {
      if (refs.actors.has(actor.id)) issues.push(`${path}.id duplicates "${actor.id}"`);
      else refs.actors.set(actor.id, sites);
    }
    if (typeof actor.type !== 'string' || !ACTOR_TYPES.has(actor.type)) issues.push(`${path}.type is not supported`);
    if (actor.compartment !== undefined && !refs.compartments.has(actor.compartment as string)) issues.push(`${path}.compartment references unknown compartment "${String(actor.compartment)}"`);
    if (actor.molecule !== undefined) {
      if (actor.type !== 'molecule') issues.push(`${path}.molecule is only allowed on molecule actors`);
      else if (typeof actor.molecule !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(actor.molecule)) issues.push(`${path}.molecule must be a lowercase key such as "atp" or "nad-plus"`);
    }
    if (actor.initial !== undefined) validateInitial(actor.initial, `${path}.initial`, issues);
    if (Array.isArray(actor.sites)) actor.sites.forEach((site, siteIndex) => {
      if (!isObject(site) || typeof site.id !== 'string' || !site.id) issues.push(`${path}.sites[${siteIndex}].id must be a non-empty string`);
      else if (sites.has(site.id)) issues.push(`${path}.sites duplicates "${site.id}"`);
      else sites.add(site.id);
    });
  });

  const definition = { ...value, references, compartments } as unknown as MechanismDefinition;
  const stepIds = new Set<string>();
  if (Array.isArray(value.steps)) value.steps.forEach((step, stepIndex) => {
    const path = `steps[${stepIndex}]`;
    if (!isObject(step)) return issues.push(`${path} must be an object`);
    requiredString(step.id, `${path}.id`, issues);
    requiredString(step.title, `${path}.title`, issues);
    if (step.summary !== undefined) requiredString(step.summary, `${path}.summary`, issues);
    if (step.keyEvents !== undefined && (!Array.isArray(step.keyEvents) || step.keyEvents.some(event => typeof event !== 'string' || !event.trim()))) {
      issues.push(`${path}.keyEvents must be an array of non-empty strings`);
    }
    checkReferenceIds(step.references, `${path}.references`);
    if (typeof step.id === 'string') {
      if (stepIds.has(step.id)) issues.push(`${path}.id duplicates "${step.id}"`);
      stepIds.add(step.id);
    }
    if (!Array.isArray(step.actions)) return issues.push(`${path}.actions must be an array`);
    step.actions.forEach((node, index) => validateNode(node, `${path}.actions[${index}]`));
  });

  function validateNode(node: unknown, path: string): void {
    if (!isObject(node)) { issues.push(`${path} must be an object`); return; }
    for (const group of ['sequence', 'parallel'] as const) {
      if (!(group in node)) continue;
      const children = node[group];
      if (Object.keys(node).length > 1) issues.push(`${path} must contain only "${group}"`);
      if (!Array.isArray(children) || children.length === 0) issues.push(`${path}.${group} must be a non-empty array`);
      else children.forEach((child, index) => validateNode(child, `${path}.${group}[${index}]`));
      return;
    }
    validateAction(node, path);
  }

  function validateAction(action: Record<string, unknown>, path: string, expandedFrom?: string): void {
    const at = expandedFrom ? `${path} (expanded from "${expandedFrom}")` : path;
    if (typeof action.type !== 'string') { issues.push(`${at}.type must be a string`); return; }
    const definitionEntry = registry.get(action.type);
    if (!definitionEntry) { issues.push(`${at}.type "${action.type}" is not a registered action`); return; }
    const fields = { ...BASE_FIELDS, ...definitionEntry.fields };
    const before = issues.length;
    for (const key of Object.keys(action)) {
      if (key !== 'type' && !(key in fields)) issues.push(`${at}.${key} is not a field of "${action.type}"`);
    }
    for (const [key, spec] of Object.entries(fields)) validateField(action[key], spec, `${at}.${key}`, refs, issues);
    if (issues.length > before) return;
    if (definitionEntry.kind === 'primitive') {
      definitionEntry.validate?.(action as ActionSpec, { definition, issue: message => issues.push(`${at}: ${message}`) });
    } else {
      validateAction(definitionEntry.expand(action as ActionSpec) as Record<string, unknown>, path, expandedFrom ?? action.type);
    }
  }

  if (issues.length) throw new MechanismValidationError(issues);
  return structuredClone(definition);
}

function validateField(value: unknown, spec: FieldSpec, path: string, refs: References, issues: string[]) {
  if (value === undefined) {
    if (spec.required) issues.push(`${path} is required`);
    return;
  }
  switch (spec.kind) {
    case 'string':
      if (typeof value !== 'string' || !value) issues.push(`${path} must be a non-empty string`);
      break;
    case 'boolean':
      if (typeof value !== 'boolean') issues.push(`${path} must be a boolean`);
      break;
    case 'integer':
      if (!Number.isInteger(value) || (spec.min !== undefined && (value as number) < spec.min)) issues.push(`${path} must be an integer${spec.min !== undefined ? ` ≥ ${spec.min}` : ''}`);
      break;
    case 'enum':
      if (!spec.values.includes(value as string)) issues.push(`${path} must be one of: ${spec.values.join(', ')}`);
      break;
    case 'actor':
      if (typeof value !== 'string' || !refs.actors.has(value)) issues.push(`${path} references unknown actor "${String(value)}"`);
      break;
    case 'compartment':
      if (typeof value !== 'string' || !refs.compartments.has(value)) issues.push(`${path} references unknown compartment "${String(value)}"`);
      break;
    case 'reference':
    case 'site': {
      if (typeof value !== 'string') { issues.push(`${path} must be a string`); break; }
      const [actorId, siteId, ...extra] = value.split('.');
      const sites = actorId ? refs.actors.get(actorId) : undefined;
      if (!sites) issues.push(`${path} references unknown actor "${actorId}"`);
      else if (extra.length) issues.push(`${path} must use actor or actor.site syntax`);
      else if (spec.kind === 'site' && !siteId) issues.push(`${path} must reference a site (actor.site)`);
      else if (siteId && !sites.has(siteId)) issues.push(`${path} references unknown site "${value}"`);
    }
  }
}

function validateInitial(initial: unknown, path: string, issues: string[]) {
  if (!isObject(initial)) return issues.push(`${path} must be an object`);
  for (const key of Object.keys(initial)) {
    if (key === 'present' || key === 'visible') { if (typeof initial[key] !== 'boolean') issues.push(`${path}.${key} must be a boolean`); }
    else if (key === 'activity') { if (!ACTIVITIES.has(initial.activity as string)) issues.push(`${path}.activity must be one of: active, inactive, inhibited`); }
    else issues.push(`${path}.${key} is not supported`);
  }
}

const IDENTIFIERS = {
  pmid: /^\d{1,9}$/,
  doi: /^10\.\d{4,9}\/\S+$/,
  reactome: /^R-[A-Z]{3}-\d+(\.\d+)?$/,
  url: /^https?:\/\/\S+$/,
} as const;

function validateReferences(references: unknown[], issues: string[]): Set<string> {
  const ids = new Set<string>();
  references.forEach((reference, index) => {
    const path = `references[${index}]`;
    if (!isObject(reference)) return issues.push(`${path} must be an object`);
    requiredString(reference.id, `${path}.id`, issues);
    if (typeof reference.id === 'string') {
      if (ids.has(reference.id)) issues.push(`${path}.id duplicates "${reference.id}"`);
      ids.add(reference.id);
    }
    for (const key of Object.keys(reference)) {
      if (key === 'id') continue;
      if (key === 'citation') { requiredString(reference.citation, `${path}.citation`, issues); continue; }
      const pattern = IDENTIFIERS[key as keyof typeof IDENTIFIERS];
      if (!pattern) issues.push(`${path}.${key} is not supported`);
      else if (typeof reference[key] !== 'string' || !pattern.test(reference[key] as string)) issues.push(`${path}.${key} is not a valid ${key}`);
    }
    if (!Object.keys(IDENTIFIERS).some(key => key in reference)) issues.push(`${path} needs at least one of: pmid, doi, reactome, url`);
  });
  return ids;
}

function requiredString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'string' || !value.trim()) issues.push(`${path} must be a non-empty string`);
}
