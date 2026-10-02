export type ActorType = 'dna' | 'rna' | 'protein' | 'molecule' | 'complex';
export type LesionType = 'single-strand-break' | 'nick' | 'double-strand-break' | 'base-damage' | 'abasic-site' | 'adduct';
export type Activity = 'active' | 'inactive' | 'inhibited';
export type CompartmentKind =
  | 'extracellular' | 'membrane' | 'cytoplasm' | 'nucleus' | 'er' | 'golgi'
  | 'mitochondrion' | 'endosome' | 'generic';

export interface Point { x: number; y: number }

// ---- Definition ----

/** Strands of a nucleic acid: `top` runs 5′→3′ with increasing coordinate, `bottom` is antiparallel. */
export type StrandId = 'top' | 'bottom';
export type SiteStrand = StrandId | 'both';
export type NucleicForm = 'duplex' | 'single';

/** Biological geometry of a `dna`/`rna` actor (RFC 0004). Coordinates are interbase, 0 … length. */
export interface NucleicDefinition {
  /** Nucleotides (single) or base pairs (duplex). Defaults to `DEFAULT_NUCLEIC_LENGTH`. */
  length?: number;
  /** Defaults to `duplex` for dna and `single` for rna. */
  form?: NucleicForm;
  strands?: Partial<Record<StrandId, { label?: string }>>;
}

export interface ActorSite {
  id: string;
  type?: string;
  label?: string;
  /** Nucleic acids: interbase coordinate; a nucleotide-level site at `n` is the nucleotide [n, n + 1). */
  at?: number;
  /** Nucleic acids: interbase interval [from, to), for footprints and patches. Exclusive with `at`. */
  span?: [number, number];
  /** Nucleic acids: strand the site lies on. Unset means the default for the lesion it receives. */
  strand?: SiteStrand;
  /** Layout override only; never a coordinate. */
  position?: Point;
}

export interface InterfaceDefinition { id: string; valence?: number }

/**
 * Nucleotides one copy covers on a nucleic acid, and what the covered strand(s) must be (RFC 0005 §5):
 * `single` needs its strand present and the partner missing, `duplex` both present and paired, `any`
 * only the occupied strand present. Authored data: the core knows no protein's footprint.
 */
export interface FootprintDefinition { length: number; form?: FootprintForm }

export interface ActorDefinition {
  id: string;
  type: ActorType;
  label?: string;
  description?: string;
  color?: string;
  position?: Point;
  sites?: ActorSite[];
  /** `dna`/`rna` actors only. */
  nucleic?: NucleicDefinition;
  /** Binding interfaces (RFC 0005 §4.1); `valence` (default 1) caps simultaneous partners per instance. */
  interfaces?: InterfaceDefinition[];
  /** Nucleotides covered by one copy when it occupies a nucleic acid (`occupy`, `coat`). */
  footprint?: FootprintDefinition;
  /**
   * Number of copies (RFC 0005 §3). `copies: n` compiles to instances `id#1 … id#n`, each with its own
   * state; without it the actor is one instance whose id is the actor id. Not allowed on dna/rna.
   */
  copies?: number;
  compartment?: string;
  /**
   * Molecule actors only: key of the renderer's small-molecule vocabulary (e.g. `atp`, `nad-plus`) that
   * names its structure. Opaque to the core; renderers fall back to a generic glyph for unknown keys.
   */
  molecule?: string;
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

/** A citable source. At least one resolvable identifier (pmid, doi, reactome, url) is required. */
export interface ReferenceDefinition {
  id: string;
  citation?: string;
  pmid?: string;
  doi?: string;
  reactome?: string;
  url?: string;
}

export interface MechanismStep {
  id: string;
  title: string;
  /** One-line subtitle for timelines and thumbnails. */
  summary?: string;
  description?: string;
  /** Ordered, human-readable events that happen in this step. */
  keyEvents?: string[];
  /** Ids from the mechanism's `references` list. */
  references?: string[];
  duration?: number;
  actions: ActionNode[];
}

export interface MechanismDefinition {
  schemaVersion: 4;
  mechanism: { id: string; name: string; description?: string; references?: string[] };
  references: ReferenceDefinition[];
  compartments: CompartmentDefinition[];
  actors: ActorDefinition[];
  steps: MechanismStep[];
}

/** Authoring form: compartments may use the string shorthand and may be omitted. */
export interface MechanismInput extends Omit<MechanismDefinition, 'compartments' | 'references'> {
  compartments?: (string | CompartmentDefinition)[];
  references?: ReferenceDefinition[];
}

/** One copy of an actor. Its state lives in `MechanismState.actors[id]`; identity comes from `actor`. */
export interface ActorInstance { id: string; actor: ActorDefinition }

// ---- Resolved state ----

export interface Modification {
  id: string;
  kind: string;
  site?: string;
  label: string;
  length?: number;
}

/** Nucleotides of one strand, as an interbase interval [from, to). */
export interface StrandRange { strand: StrandId; from: number; to: number }

/**
 * Strand-level state of a dna/rna actor (RFC 0004 §4). Ranges are normalised: per strand sorted and
 * merged, top before bottom. Single-stranded regions and base pairs are derived, never stored.
 */
export interface NucleicState {
  /** Nucleotides absent from one strand (resected, excised gap). */
  missing: StrandRange[];
  /** Nucleotides synthesised during the mechanism. */
  nascent: StrandRange[];
  /** Regions where both strands are present but unpaired (bubble). */
  open: Array<{ from: number; to: number }>;
}

export interface ActorState {
  id: string;
  present: boolean;
  visible: boolean;
  compartment?: string;
  activity?: { state: Activity; by?: string };
  modifications: Modification[];
  /** dna/rna only; absent while the molecule is intact. */
  nucleic?: NucleicState;
}

export interface SiteState { lesion?: LesionType }

/** One side of an interaction: an instance, optionally through a declared interface or at one of its sites. */
export interface InteractionEnd { instance: string; interface?: string; site?: string }

/**
 * A binding between two instances, stored once (RFC 0005 §4). Directed (`ends[0]` binds `ends[1]`)
 * unless `symmetric` (homotypic, same interface on both ends). Ends without an interface are the
 * anonymous legacy binding: at most one per binder, replaced by a new anonymous `bind` as in v3.
 */
export interface Interaction { id: string; ends: [InteractionEnd, InteractionEnd]; symmetric?: boolean }

export type FootprintForm = 'single' | 'duplex' | 'any';
export type Orientation = 'forward' | 'reverse';

/**
 * An instance resting on a nucleic acid (RFC 0005 §5). A *point* occupancy (legacy `bind` to a
 * molecule or site) claims no nucleotides. A *span* occupancy (`occupy`, `coat`) covers `span` on
 * `strand`, oriented relative to top 5′→3′; only span occupancies take part in occupancy rules.
 * Records are flat and independent: exclusivity is a validation rule, not part of the storage.
 */
export interface Occupancy {
  id: string;
  instance: string;
  acid: string;
  site?: string;
  span?: { from: number; to: number };
  strand?: SiteStrand;
  orientation?: Orientation;
}

export interface MechanismState {
  actors: Record<string, ActorState>;
  sites: Record<string, SiteState>;
  /** The only source of truth for bindings between instances. */
  interactions: Record<string, Interaction>;
  /** Instances on nucleic acids. */
  occupancy: Record<string, Occupancy>;
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
