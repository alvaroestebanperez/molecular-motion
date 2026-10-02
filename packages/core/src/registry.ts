import type { ActionSpec, ActorState, MechanismDefinition, MechanismState, Presentation, SiteState } from './types';

// ---- Field specs: one declaration drives validation and JSON Schema generation ----

interface FieldOptions { required?: boolean; description?: string }
export type FieldSpec =
  | (FieldOptions & { kind: 'actor' | 'actors' | 'reference' | 'site' | 'compartment' | 'string' | 'boolean' | 'interval' })
  | (FieldOptions & { kind: 'integer'; min?: number })
  | (FieldOptions & { kind: 'enum'; values: readonly string[] });

export const field = {
  actor: (options: FieldOptions = {}): FieldSpec => ({ kind: 'actor', ...options }),
  /** A non-empty list of distinct instances. */
  actors: (options: FieldOptions = {}): FieldSpec => ({ kind: 'actors', ...options }),
  /** An interbase interval `[from, to]` with integers 0 ≤ from < to. */
  interval: (options: FieldOptions = {}): FieldSpec => ({ kind: 'interval', ...options }),
  reference: (options: FieldOptions = {}): FieldSpec => ({ kind: 'reference', ...options }),
  site: (options: FieldOptions = {}): FieldSpec => ({ kind: 'site', ...options }),
  compartment: (options: FieldOptions = {}): FieldSpec => ({ kind: 'compartment', ...options }),
  string: (options: FieldOptions = {}): FieldSpec => ({ kind: 'string', ...options }),
  boolean: (options: FieldOptions = {}): FieldSpec => ({ kind: 'boolean', ...options }),
  integer: (options: FieldOptions & { min?: number } = {}): FieldSpec => ({ kind: 'integer', ...options }),
  enum: (values: readonly string[], options: FieldOptions = {}): FieldSpec => ({ kind: 'enum', values, ...options }),
};

/** Fields every action accepts in addition to its own. */
export const BASE_FIELDS: Record<string, FieldSpec> = {
  duration: field.integer({ min: 0, description: 'Duration in milliseconds (presentation only).' }),
  by: field.actor({ description: 'Causal agent: enzyme, ligand, drug, or sensor.' }),
};

// ---- Contexts ----

export interface ValidationContext {
  readonly definition: MechanismDefinition;
  issue(message: string): void;
}

/** Thrown by `apply` when an action is impossible in the current state. */
export class ActionFailure extends Error {}

export interface ApplyContext {
  readonly definition: MechanismDefinition;
  fail(message: string): never;
  actor(id: string): ActorState;
  site(reference: string): SiteState;
  requirePresent(id: string): ActorState;
}

// ---- Definitions ----

export interface PrimitiveDefinition<A extends ActionSpec = ActionSpec> {
  kind: 'primitive';
  type: string;
  description: string;
  fields: Record<string, FieldSpec>;
  presentation: Presentation;
  validate?(action: A, ctx: ValidationContext): void;
  apply(state: MechanismState, action: A, ctx: ApplyContext): void;
}

export interface AliasDefinition<A extends ActionSpec = ActionSpec> {
  kind: 'alias';
  type: string;
  description: string;
  fields: Record<string, FieldSpec>;
  presentation: Presentation;
  expand(action: A): ActionSpec;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ActionDefinition = PrimitiveDefinition<any> | AliasDefinition<any>;

export const definePrimitive = <A extends ActionSpec>(definition: Omit<PrimitiveDefinition<A>, 'kind'>): PrimitiveDefinition<A> =>
  ({ kind: 'primitive', ...definition });
export const defineAlias = <A extends ActionSpec>(definition: Omit<AliasDefinition<A>, 'kind'>): AliasDefinition<A> =>
  ({ kind: 'alias', ...definition });

export interface ResolvedAction {
  primitive: PrimitiveDefinition;
  spec: ActionSpec;
  /** Aliases traversed from the authored action down to the primitive. */
  via: AliasDefinition[];
}

const MAX_ALIAS_DEPTH = 8;

/** Immutable collection of action definitions. */
export class ActionRegistry {
  private readonly entries: ReadonlyMap<string, ActionDefinition>;

  constructor(definitions: readonly ActionDefinition[]) {
    const entries = new Map<string, ActionDefinition>();
    for (const definition of definitions) {
      if (entries.has(definition.type)) throw new Error(`Action "${definition.type}" is already registered`);
      entries.set(definition.type, definition);
    }
    this.entries = entries;
  }

  get(type: string): ActionDefinition | undefined { return this.entries.get(type); }
  list(): ActionDefinition[] { return [...this.entries.values()]; }
  extend(definitions: readonly ActionDefinition[]): ActionRegistry { return new ActionRegistry([...this.entries.values(), ...definitions]); }

  /** Expand aliases until a primitive is reached. Undefined fields are dropped so specs stay JSON-clean. */
  resolve(spec: ActionSpec): ResolvedAction {
    const via: AliasDefinition[] = [];
    let current = spec;
    for (;;) {
      const definition = this.entries.get(current.type);
      if (!definition) throw new Error(`Unknown action "${current.type}"`);
      if (definition.kind === 'primitive') return { primitive: definition, spec: current, via };
      if (via.length >= MAX_ALIAS_DEPTH) throw new Error(`Alias "${spec.type}" expands too deeply`);
      via.push(definition);
      current = stripUndefined(definition.expand(current));
    }
  }
}

function stripUndefined(spec: ActionSpec): ActionSpec {
  return Object.fromEntries(Object.entries(spec).filter(([, value]) => value !== undefined)) as ActionSpec;
}
