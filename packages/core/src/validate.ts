import type { ActorDefinition, MechanismAction, MechanismDefinition } from './types';

const ACTOR_TYPES = new Set(['dna', 'rna', 'protein', 'molecule', 'complex']);
const ACTION_TYPES = new Set(['create-lesion', 'repair-lesion', 'bind', 'recruit', 'unbind', 'polymerize', 'modify', 'show', 'hide']);
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export class MechanismValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid molecular mechanism:\n- ${issues.join('\n- ')}`);
    this.name = 'MechanismValidationError';
  }
}

export function validateMechanism(value: unknown): MechanismDefinition {
  const issues: string[] = [];
  if (!isObject(value)) throw new MechanismValidationError(['root must be an object']);
  if (value.schemaVersion !== 1) issues.push('schemaVersion must be 1');
  if (!isObject(value.mechanism)) issues.push('mechanism must be an object');
  else {
    requiredString(value.mechanism.id, 'mechanism.id', issues);
    requiredString(value.mechanism.name, 'mechanism.name', issues);
  }
  if (!Array.isArray(value.actors) || value.actors.length === 0) issues.push('actors must be a non-empty array');
  if (!Array.isArray(value.steps) || value.steps.length === 0) issues.push('steps must be a non-empty array');

  const actors = new Map<string, ActorDefinition>();
  if (Array.isArray(value.actors)) value.actors.forEach((actor, index) => {
    const path = `actors[${index}]`;
    if (!isObject(actor)) return issues.push(`${path} must be an object`);
    requiredString(actor.id, `${path}.id`, issues);
    if (typeof actor.id === 'string') {
      if (actors.has(actor.id)) issues.push(`${path}.id duplicates "${actor.id}"`);
      else actors.set(actor.id, actor as unknown as ActorDefinition);
    }
    if (typeof actor.type !== 'string' || !ACTOR_TYPES.has(actor.type)) issues.push(`${path}.type is not supported`);
    if (Array.isArray(actor.sites)) {
      const sites = new Set<string>();
      actor.sites.forEach((site, siteIndex) => {
        if (!isObject(site) || typeof site.id !== 'string' || !site.id) issues.push(`${path}.sites[${siteIndex}].id must be a non-empty string`);
        else if (sites.has(site.id)) issues.push(`${path}.sites duplicates "${site.id}"`);
        else sites.add(site.id);
      });
    }
  });

  const stepIds = new Set<string>();
  if (Array.isArray(value.steps)) value.steps.forEach((step, stepIndex) => {
    const path = `steps[${stepIndex}]`;
    if (!isObject(step)) return issues.push(`${path} must be an object`);
    requiredString(step.id, `${path}.id`, issues);
    requiredString(step.title, `${path}.title`, issues);
    if (typeof step.id === 'string') {
      if (stepIds.has(step.id)) issues.push(`${path}.id duplicates "${step.id}"`);
      stepIds.add(step.id);
    }
    if (!Array.isArray(step.actions)) return issues.push(`${path}.actions must be an array`);
    step.actions.forEach((action, actionIndex) => validateAction(action, `${path}.actions[${actionIndex}]`, actors, issues));
  });

  if (issues.length) throw new MechanismValidationError(issues);
  return value as unknown as MechanismDefinition;
}

function requiredString(value: unknown, path: string, issues: string[]) {
  if (typeof value !== 'string' || !value.trim()) issues.push(`${path} must be a non-empty string`);
}

function validateAction(value: unknown, path: string, actors: Map<string, ActorDefinition>, issues: string[]) {
  if (!isObject(value) || typeof value.type !== 'string' || !ACTION_TYPES.has(value.type)) {
    issues.push(`${path}.type is not supported`);
    return;
  }
  const action = value as unknown as MechanismAction;
  if ('actor' in action && !actors.has(action.actor)) issues.push(`${path}.actor references unknown actor "${action.actor}"`);
  if ('target' in action) validateTarget(action.target, path, actors, issues);
  if (action.type === 'polymerize') requiredString(action.product, `${path}.product`, issues);
  if (action.type === 'modify') requiredString(action.modification, `${path}.modification`, issues);
}

function validateTarget(target: string, path: string, actors: Map<string, ActorDefinition>, issues: string[]) {
  if (typeof target !== 'string') return issues.push(`${path}.target must be a string`);
  const [actorId, siteId, ...extra] = target.split('.');
  const actor = actorId ? actors.get(actorId) : undefined;
  if (!actor) return issues.push(`${path}.target references unknown actor "${actorId}"`);
  if (extra.length) issues.push(`${path}.target must use actor or actor.site syntax`);
  if (siteId && !actor.sites?.some(site => site.id === siteId)) issues.push(`${path}.target references unknown site "${target}"`);
}
