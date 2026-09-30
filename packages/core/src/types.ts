export type ActorType = 'dna' | 'rna' | 'protein' | 'molecule' | 'complex';
export type LesionType = 'single-strand-break' | 'double-strand-break' | 'base-damage' | 'abasic-site' | 'adduct';
export type Activity = 'active' | 'inactive' | 'inhibited';
export type CompartmentKind =
  | 'extracellular' | 'membrane' | 'cytoplasm' | 'nucleus' | 'er' | 'golgi'
  | 'mitochondrion' | 'endosome' | 'generic';

export interface Point { x: number; y: number }

// ---- Definition ----

export interface ActorSite {
  id: string;
  type?: string;
  label?: string;
  position?: 'start' | 'center' | 'end' | Point;
}

export interface ActorDefinition {
  id: string;
  type: ActorType;
  label?: string;
  description?: string;
  color?: string;
  position?: Point;
  sites?: ActorSite[];
  compartment?: string;
  initial?: { present?: boolean; visible?: boolean; activity?: Activity };
}

export interface CompartmentDefinition {
  id: string;
  kind: CompartmentKind;
  label?: string;
  parent?: string;
}

/** A single action as authored. Fields beyond the base ones are validated by its registry entry. */
export interface ActionSpec {
  type: string;
  duration?: number;
  by?: string;
  [field: string]: unknown;
}

export type ActionNode = ActionSpec | { sequence: ActionNode[] } | { parallel: ActionNode[] };

export interface MechanismStep {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  actions: ActionNode[];
}

export interface MechanismDefinition {
  schemaVersion: 2;
  mechanism: { id: string; name: string; description?: string };
  compartments: CompartmentDefinition[];
  actors: ActorDefinition[];
  steps: MechanismStep[];
}

/** Authoring form: compartments may use the string shorthand and may be omitted. */
export interface MechanismInput extends Omit<MechanismDefinition, 'compartments'> {
  compartments?: (string | CompartmentDefinition)[];
}

// ---- Resolved state ----

export interface Modification {
  id: string;
  kind: string;
  site?: string;
  label: string;
  length?: number;
}

export interface ActorState {
  id: string;
  present: boolean;
  visible: boolean;
  compartment?: string;
  boundTo?: string;
  activity?: { state: Activity; by?: string };
  modifications: Modification[];
}

export interface SiteState { lesion?: LesionType }

export interface MechanismState {
  actors: Record<string, ActorState>;
  sites: Record<string, SiteState>;
}

export interface Presentation { verb: string; tone?: 'activating' | 'inhibitory' | 'neutral' }

export interface StateChange { key: string; from: unknown; to: unknown }

export interface TimedAction {
  path: string;
  type: string;
  primitive: string;
  presentation: Presentation;
  subject?: string;
  agent?: string;
  start: number;
  duration: number;
  changes: StateChange[];
}

export interface MechanismSnapshot extends MechanismState {
  stepIndex: number;
  step: MechanismStep;
  definition: MechanismDefinition;
  timeline: TimedAction[];
  /** Total duration of the step's timeline in ms. */
  duration: number;
}
