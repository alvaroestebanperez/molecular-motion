import { builtinRegistry } from './actions';
import { normalizeCompartments } from './compartments';
import { instanceIds, INSTANCE_SEPARATOR } from './instances';
import { migrateV1, migrateV2, migrateV3 } from './migrate';
import { nucleicForm, nucleicLength } from './nucleic';
import { BASE_FIELDS, type ActionRegistry, type FieldSpec } from './registry';
import type { ActionSpec, ActorDefinition, MechanismDefinition } from './types';

const ACTOR_TYPES = new Set(['dna', 'rna', 'protein', 'molecule', 'complex']);
const ACTIVITIES = new Set(['active', 'inactive', 'inhibited']);
const FORMS = new Set(['duplex', 'single']);
const STRANDS = new Set(['top', 'bottom']);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export class MechanismValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid molecular mechanism:\n- ${issues.join('\n- ')}`);
    this.name = 'MechanismValidationError';
  }
}

export interface ValidateOptions { registry?: ActionRegistry }

interface References {
  /** Instance id (the actor id for single-copy actors) → the actor's site ids. */
  actors: Map<string, Set<string>>;
  /** Actors declared with `copies`, so a bare id or an out-of-range copy gets a precise message. */
  copies: Map<string, number>;
  compartments: Set<string>;
}

/**
 * Structural and referential validation. Accepts v1–v3 documents (migrated automatically) and
 * returns a normalised, deep-copied v4 definition. State-dependent checks happen later, during compilation.
 */
export function validateMechanism(input: unknown, options: ValidateOptions = {}): MechanismDefinition {
  const registry = options.registry ?? builtinRegistry;
  const value = migrateV3(migrateV2(migrateV1(input)));
  const issues: string[] = [];
  if (!isObject(value)) throw new MechanismValidationError(['root must be an object']);
  if (value.schemaVersion !== 4) issues.push('schemaVersion must be 1, 2, 3 or 4');
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
  const refs: References = { actors: new Map(), copies: new Map(), compartments: new Set(compartments.map(compartment => compartment.id)) };
  const actorIds = new Set<string>();

  if (Array.isArray(value.actors)) value.actors.forEach((actor, index) => {
    const path = `actors[${index}]`;
    if (!isObject(actor)) return issues.push(`${path} must be an object`);
    requiredString(actor.id, `${path}.id`, issues);
    const sites = new Set<string>();
    const copies = validateCopies(actor, path, issues);
    if (typeof actor.id === 'string') {
      if (actor.id.includes(INSTANCE_SEPARATOR)) issues.push(`${path}.id must not contain "${INSTANCE_SEPARATOR}", which separates copy numbers`);
      else if (actorIds.has(actor.id)) issues.push(`${path}.id duplicates "${actor.id}"`);
      else {
        actorIds.add(actor.id);
        if (copies !== undefined) refs.copies.set(actor.id, copies);
        for (const id of instanceIds({ id: actor.id, copies })) refs.actors.set(id, sites);
      }
    }
    if (typeof actor.type !== 'string' || !ACTOR_TYPES.has(actor.type)) issues.push(`${path}.type is not supported`);
    if (actor.compartment !== undefined && !refs.compartments.has(actor.compartment as string)) issues.push(`${path}.compartment references unknown compartment "${String(actor.compartment)}"`);
    if (actor.molecule !== undefined) {
      if (actor.type !== 'molecule') issues.push(`${path}.molecule is only allowed on molecule actors`);
      else if (typeof actor.molecule !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(actor.molecule)) issues.push(`${path}.molecule must be a lowercase key such as "atp" or "nad-plus"`);
    }
    if (actor.initial !== undefined) validateInitial(actor.initial, `${path}.initial`, issues);
    if (actor.interfaces !== undefined) validateInterfaces(actor, path, issues);
    if (actor.footprint !== undefined) validateFootprint(actor, path, issues);
    const acid = nucleicDescriptor(actor);
    if (actor.nucleic !== undefined) {
      if (!acid) issues.push(`${path}.nucleic is only allowed on dna and rna actors`);
      else validateNucleic(actor.nucleic, `${path}.nucleic`, issues);
    }
    if (Array.isArray(actor.sites)) actor.sites.forEach((site, siteIndex) => {
      if (!isObject(site) || typeof site.id !== 'string' || !site.id) issues.push(`${path}.sites[${siteIndex}].id must be a non-empty string`);
      else if (sites.has(site.id)) issues.push(`${path}.sites duplicates "${site.id}"`);
      else sites.add(site.id);
      if (isObject(site)) validateSiteGeometry(site, `${path}.sites[${siteIndex}]`, acid, issues);
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
    case 'actors':
      if (!Array.isArray(value) || value.length === 0) { issues.push(`${path} must be a non-empty list of instances`); break; }
      value.forEach((item, index) => { if (typeof item !== 'string' || !refs.actors.has(item)) issues.push(`${path}[${index}] ${unknownActor(String(item), refs)}`); });
      if (new Set(value).size !== value.length) issues.push(`${path} lists an instance twice`);
      break;
    case 'interval':
      if (!Array.isArray(value) || value.length !== 2 || !value.every(item => Number.isInteger(item) && item >= 0) || value[0] >= value[1]) issues.push(`${path} must be [from, to] with integers 0 ≤ from < to`);
      break;
    case 'integer':
      if (!Number.isInteger(value) || (spec.min !== undefined && (value as number) < spec.min)) issues.push(`${path} must be an integer${spec.min !== undefined ? ` ≥ ${spec.min}` : ''}`);
      break;
    case 'enum':
      if (!spec.values.includes(value as string)) issues.push(`${path} must be one of: ${spec.values.join(', ')}`);
      break;
    case 'actor':
      if (typeof value !== 'string' || !refs.actors.has(value)) issues.push(`${path} ${unknownActor(String(value), refs)}`);
      break;
    case 'compartment':
      if (typeof value !== 'string' || !refs.compartments.has(value)) issues.push(`${path} references unknown compartment "${String(value)}"`);
      break;
    case 'reference':
    case 'site': {
      if (typeof value !== 'string') { issues.push(`${path} must be a string`); break; }
      const [actorId, siteId, ...extra] = value.split('.');
      const sites = actorId ? refs.actors.get(actorId) : undefined;
      if (!sites) issues.push(`${path} ${unknownActor(String(actorId), refs)}`);
      else if (extra.length) issues.push(`${path} must use actor or actor.site syntax`);
      else if (spec.kind === 'site' && !siteId) issues.push(`${path} must reference a site (actor.site)`);
      else if (siteId && !sites.has(siteId)) issues.push(`${path} references unknown site "${value}"`);
    }
  }
}

type NucleicDescriptor = Pick<ActorDefinition, 'type' | 'nucleic'>;

/** The geometry a dna/rna actor's sites are checked against; invalid `nucleic` values fall back to the defaults. */
function nucleicDescriptor(actor: Record<string, unknown>): NucleicDescriptor | undefined {
  if (actor.type !== 'dna' && actor.type !== 'rna') return undefined;
  const declared = isObject(actor.nucleic) ? actor.nucleic : {};
  return {
    type: actor.type,
    nucleic: {
      ...(Number.isInteger(declared.length) && (declared.length as number) >= 1 && { length: declared.length as number }),
      ...(FORMS.has(declared.form as string) && { form: declared.form as 'duplex' | 'single' }),
    },
  };
}

function validateNucleic(nucleic: unknown, path: string, issues: string[]) {
  if (!isObject(nucleic)) return issues.push(`${path} must be an object`);
  for (const key of Object.keys(nucleic)) if (!['length', 'form', 'strands'].includes(key)) issues.push(`${path}.${key} is not supported`);
  if (nucleic.length !== undefined && (!Number.isInteger(nucleic.length) || (nucleic.length as number) < 1)) issues.push(`${path}.length must be an integer ≥ 1`);
  if (nucleic.form !== undefined && !FORMS.has(nucleic.form as string)) issues.push(`${path}.form must be one of: duplex, single`);
  if (nucleic.strands === undefined) return;
  if (!isObject(nucleic.strands)) return issues.push(`${path}.strands must be an object`);
  for (const [strand, value] of Object.entries(nucleic.strands)) {
    if (!STRANDS.has(strand)) issues.push(`${path}.strands.${strand} is not a strand (top, bottom)`);
    else if (strand === 'bottom' && nucleic.form === 'single') issues.push(`${path}.strands.bottom is not allowed on a single-stranded molecule`);
    if (!isObject(value) || Object.keys(value).some(key => key !== 'label') || (value.label !== undefined && typeof value.label !== 'string')) {
      issues.push(`${path}.strands.${strand} must be an object with an optional string label`);
    }
  }
}

/**
 * Coordinates are biology, `position` is layout (RFC 0004 §6). A nucleic-acid site has exactly one
 * of `at`, `span` (a coordinate) or a `Point` position (none); other actors' sites have no geometry
 * beyond an optional `Point`.
 */
function validateSiteGeometry(site: Record<string, unknown>, path: string, acid: NucleicDescriptor | undefined, issues: string[]) {
  if (site.position !== undefined && !(isObject(site.position) && typeof site.position.x === 'number' && typeof site.position.y === 'number')) {
    issues.push(`${path}.position must be a point { x, y }${typeof site.position === 'string' ? '; use `at` for a coordinate' : ''}`);
  }
  if (!acid) {
    for (const key of ['at', 'span', 'strand']) if (site[key] !== undefined) issues.push(`${path}.${key} is only allowed on dna and rna sites`);
    return;
  }
  const length = nucleicLength(acid);
  const inRange = (value: unknown) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= length;
  const located = [site.at, site.span, site.position].filter(value => value !== undefined).length;
  if (located === 0) issues.push(`${path} needs a coordinate (at or span) or a position`);
  if (located > 1) issues.push(`${path} must use only one of at, span, position`);
  if (site.at !== undefined && !inRange(site.at)) issues.push(`${path}.at must be an integer between 0 and ${length}`);
  if (site.span !== undefined && !(Array.isArray(site.span) && site.span.length === 2 && site.span.every(inRange) && site.span[0] < site.span[1])) {
    issues.push(`${path}.span must be [from, to] with 0 ≤ from < to ≤ ${length}`);
  }
  if (site.strand !== undefined) {
    if (site.strand !== 'top' && site.strand !== 'bottom' && site.strand !== 'both') issues.push(`${path}.strand must be one of: top, bottom, both`);
    else if (site.strand !== 'top' && nucleicForm(acid) === 'single') issues.push(`${path}.strand must be top on a single-stranded molecule`);
  }
}

/** Interfaces: unique ids, valence an integer ≥ 1; nucleic acids bind by occupancy and declare none. */
function validateInterfaces(actor: Record<string, unknown>, path: string, issues: string[]) {
  if (actor.type === 'dna' || actor.type === 'rna') return issues.push(`${path}.interfaces is not allowed on dna and rna: proteins rest on them by occupancy`);
  if (!Array.isArray(actor.interfaces)) return issues.push(`${path}.interfaces must be an array`);
  const ids = new Set<string>();
  actor.interfaces.forEach((item, index) => {
    const at = `${path}.interfaces[${index}]`;
    if (!isObject(item) || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(item.id)) return issues.push(`${at}.id must be a lowercase id such as "dimer"`);
    if (ids.has(item.id)) issues.push(`${path}.interfaces duplicates "${item.id}"`);
    ids.add(item.id);
    for (const key of Object.keys(item)) if (key !== 'id' && key !== 'valence') issues.push(`${at}.${key} is not supported`);
    if (item.valence !== undefined && (!Number.isInteger(item.valence) || (item.valence as number) < 1)) issues.push(`${at}.valence must be an integer ≥ 1`);
  });
}

function validateFootprint(actor: Record<string, unknown>, path: string, issues: string[]) {
  if (actor.type === 'dna' || actor.type === 'rna') return issues.push(`${path}.footprint is not allowed on dna and rna`);
  const footprint = actor.footprint;
  if (!isObject(footprint)) return issues.push(`${path}.footprint must be an object`);
  for (const key of Object.keys(footprint)) if (key !== 'length' && key !== 'form') issues.push(`${path}.footprint.${key} is not supported`);
  if (!Number.isInteger(footprint.length) || (footprint.length as number) < 1) issues.push(`${path}.footprint.length must be an integer ≥ 1`);
  if (footprint.form !== undefined && !['single', 'duplex', 'any'].includes(footprint.form as string)) issues.push(`${path}.footprint.form must be one of: single, duplex, any`);
}

/** `copies` is an integer ≥ 2 (omit it for one copy) and is not allowed on nucleic acids (RFC 0005 §6). */
function validateCopies(actor: Record<string, unknown>, path: string, issues: string[]): number | undefined {
  if (actor.copies === undefined) return undefined;
  if (!Number.isInteger(actor.copies) || (actor.copies as number) < 2) { issues.push(`${path}.copies must be an integer ≥ 2 (omit it for a single copy)`); return undefined; }
  if (actor.type === 'dna' || actor.type === 'rna') { issues.push(`${path}.copies is not allowed on dna and rna: pairing nucleic-acid molecules is out of scope`); return undefined; }
  return actor.copies as number;
}

/** Message for a reference that names no instance, explaining copies when that is the cause. */
function unknownActor(value: string, refs: References): string {
  const [actorId, copy] = value.split(INSTANCE_SEPARATOR);
  const copies = refs.copies.get(actorId!);
  if (copies !== undefined && copy === undefined) return `references "${actorId}", which has ${copies} copies; name one instance such as "${actorId}${INSTANCE_SEPARATOR}1"`;
  if (copies !== undefined) return `references unknown instance "${value}" ("${actorId}" has ${copies} copies)`;
  return `references unknown actor "${value}"`;
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
