import { builtinRegistry } from './actions';
import { actorInstances } from './instances';
import { ActionFailure, type ActionRegistry, type ApplyContext } from './registry';
import type {
  ActionNode, ActionSpec, ActorState, MechanismDefinition, MechanismSnapshot, MechanismState, NucleicState, StateChange, TimedAction,
} from './types';
import { MechanismValidationError, validateMechanism } from './validate';

export const DEFAULT_ACTION_DURATION = 600;

export interface CompileOptions { registry?: ActionRegistry }

export interface CompiledMechanism {
  readonly definition: MechanismDefinition;
  readonly length: number;
  at(step: number | string): MechanismSnapshot;
}

/**
 * Validate, then fold every step once. Each step boundary is stored as a frozen snapshot, so `at()`
 * is O(1) and always returns the same object for the same step. State-dependent errors
 * (binding a degraded actor, ligating an intact site, conflicting parallel branches) are reported here.
 */
export function compileMechanism(input: unknown, options: CompileOptions = {}): CompiledMechanism {
  const registry = options.registry ?? builtinRegistry;
  const definition = deepFreeze(validateMechanism(input, { registry }));
  const issues: string[] = [];
  let state = initialState(definition);

  const snapshots = definition.steps.map((step, stepIndex): MechanismSnapshot => {
    const timeline: TimedAction[] = [];

    const run = (node: ActionNode, path: string, start: number): { end: number; keys: Set<string> } => {
      const group = node as { sequence?: ActionNode[]; parallel?: ActionNode[] };
      if (group.sequence) return runSequence(group.sequence, `${path}.sequence`, start);
      if (group.parallel) {
        const branches = group.parallel.map((child, index) => ({ index, ...run(child, `${path}.parallel[${index}]`, start) }));
        const keys = new Set<string>();
        for (const branch of branches) {
          for (const key of branch.keys) {
            const owner = branches.find(other => other.index < branch.index && other.keys.has(key));
            if (owner) issues.push(`${path}: parallel branches [${owner.index}] and [${branch.index}] both change ${key}`);
            keys.add(key);
          }
        }
        return { end: Math.max(start, ...branches.map(branch => branch.end)), keys };
      }
      return runAction(node as ActionSpec, path, start);
    };

    const runSequence = (nodes: ActionNode[], path: string, start: number) => {
      const keys = new Set<string>();
      let cursor = start;
      nodes.forEach((child, index) => {
        const result = run(child, `${path}[${index}]`, cursor);
        cursor = result.end;
        result.keys.forEach(key => keys.add(key));
      });
      return { end: cursor, keys };
    };

    const runAction = (authored: ActionSpec, path: string, start: number) => {
      const { primitive, spec, via } = registry.resolve(authored);
      const duration = authored.duration ?? DEFAULT_ACTION_DURATION;
      const draft = structuredClone(state);
      try {
        primitive.apply(draft, spec, applyContext(draft, definition));
      } catch (error) {
        if (!(error instanceof ActionFailure)) throw error;
        issues.push(`${path}: ${error.message}`);
        return { end: start + duration, keys: new Set<string>() };
      }
      const changes = diff(state, draft);
      state = draft;
      const subject = (spec.actor ?? spec.product ?? spec.target) as string | undefined;
      timeline.push({
        path,
        type: authored.type,
        primitive: primitive.type,
        presentation: via[0]?.presentation ?? primitive.presentation,
        ...(subject && { subject }),
        ...(spec.by && { agent: spec.by }),
        start,
        duration,
        changes,
      });
      return { end: start + duration, keys: new Set(changes.map(change => change.key)) };
    };

    const { end } = runSequence(step.actions, `steps[${stepIndex}].actions`, 0);
    const resolved = structuredClone(state);
    return deepFreeze({
      stepIndex, step, definition, actors: resolved.actors, sites: resolved.sites,
      interactions: resolved.interactions, occupancy: resolved.occupancy, timeline, duration: end,
    });
  });

  if (issues.length) throw new MechanismValidationError(issues);
  const indexById = new Map(definition.steps.map((step, index) => [step.id, index]));
  return {
    definition,
    length: snapshots.length,
    at(step) {
      const index = typeof step === 'string' ? indexById.get(step) : step;
      const snapshot = index === undefined ? undefined : snapshots[index];
      if (!snapshot) throw new RangeError(`Unknown mechanism step: ${step}`);
      return snapshot;
    },
  };
}

export function initialState(definition: MechanismDefinition): MechanismState {
  const actors: Record<string, ActorState> = {};
  const sites: MechanismState['sites'] = {};
  for (const { id, actor } of actorInstances(definition)) {
    actors[id] = {
      id,
      present: actor.initial?.present ?? true,
      visible: actor.initial?.visible ?? (actor.type === 'dna' || actor.type === 'rna'),
      ...(actor.compartment && { compartment: actor.compartment }),
      ...(actor.initial?.activity && { activity: { state: actor.initial.activity } }),
      modifications: [],
    };
    for (const site of actor.sites ?? []) sites[`${id}.${site.id}`] = {};
  }
  return { actors, sites, interactions: {}, occupancy: {} };
}

function applyContext(state: MechanismState, definition: MechanismDefinition): ApplyContext {
  const fail = (message: string): never => { throw new ActionFailure(message); };
  const actor = (id: string) => state.actors[id] ?? fail(`unknown actor "${id}"`);
  return {
    definition,
    fail,
    actor,
    site: reference => state.sites[reference] ?? fail(`unknown site "${reference}"`),
    requirePresent(id) {
      const found = actor(id);
      if (!found.present) fail(`"${id}" is not present (not yet synthesized, or degraded)`);
      return found;
    },
  };
}

/**
 * Flatten state into comparable keys. Modifications are keyed by id so diffs are stable; strand
 * state is keyed per list (`actors.dna.nucleic.missing`) so parallel branches conflict per list.
 */
function flatten(state: MechanismState): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const actor of Object.values(state.actors)) {
    for (const [key, value] of Object.entries(actor)) {
      if (key === 'id' || value === undefined) continue;
      if (key === 'modifications') for (const modification of value as ActorState['modifications']) out.set(`actors.${actor.id}.modifications.${modification.id}`, modification);
      else if (key === 'nucleic') for (const [list, ranges] of Object.entries(value as NucleicState)) { if (ranges.length) out.set(`actors.${actor.id}.nucleic.${list}`, ranges); }
      else out.set(`actors.${actor.id}.${key}`, value);
    }
  }
  for (const [reference, site] of Object.entries(state.sites)) {
    for (const [key, value] of Object.entries(site)) if (value !== undefined) out.set(`sites.${reference}.${key}`, value);
  }
  // One key per binding: parallel branches conflict only when they touch the same edge or occupancy.
  for (const interaction of Object.values(state.interactions)) out.set(`interactions.${interaction.id}`, interaction);
  for (const occupancy of Object.values(state.occupancy)) out.set(`occupancy.${occupancy.id}`, occupancy);
  return out;
}

export function diff(before: MechanismState, after: MechanismState): StateChange[] {
  const previous = flatten(before);
  const next = flatten(after);
  const keys = new Set([...previous.keys(), ...next.keys()]);
  const changes: StateChange[] = [];
  for (const key of keys) {
    const from = previous.get(key);
    const to = next.get(key);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ key, from: structuredClone(from), to: structuredClone(to) });
  }
  return changes;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
