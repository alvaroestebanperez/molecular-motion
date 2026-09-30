export type ActorType = 'dna' | 'rna' | 'protein' | 'molecule' | 'complex';
export type LesionType = 'single-strand-break' | 'double-strand-break' | 'base-damage' | 'adduct';

export interface Point { x: number; y: number }

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
  initiallyVisible?: boolean;
}

export interface BaseAction { duration?: number }
export type MechanismAction =
  | (BaseAction & { type: 'create-lesion'; target: string; lesion?: LesionType })
  | (BaseAction & { type: 'repair-lesion'; target: string })
  | (BaseAction & { type: 'bind' | 'recruit'; actor: string; target: string })
  | (BaseAction & { type: 'unbind'; actor: string })
  | (BaseAction & { type: 'polymerize'; actor: string; product: string; length?: number })
  | (BaseAction & { type: 'modify'; actor: string; modification: string; label?: string })
  | (BaseAction & { type: 'show' | 'hide'; actor: string });

export interface MechanismStep {
  id: string;
  title: string;
  description?: string;
  duration?: number;
  actions: MechanismAction[];
}

export interface MechanismDefinition {
  schemaVersion: 1;
  mechanism: { id: string; name: string; description?: string };
  actors: ActorDefinition[];
  steps: MechanismStep[];
}

export interface PolymerState { product: string; length: number }
export interface ModificationState { id: string; label: string }
export interface ActorState extends ActorDefinition {
  visible: boolean;
  boundTo?: string;
  polymer?: PolymerState;
  modifications: ModificationState[];
}

export interface MechanismSnapshot {
  stepIndex: number;
  step: MechanismStep;
  actors: Record<string, ActorState>;
  lesions: Record<string, LesionType>;
}
