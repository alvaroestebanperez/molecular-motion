# RFC 0001 — Schema v2: action registry, typed state, compartments

- **Status:** accepted
- **Target mechanisms:** PARP1 SSB repair, homologous recombination (HR), base excision repair (BER), cGAS–STING, EGFR–MAPK

## Goals

1. Actions become **registry entries**: each one owns its field validation, its state transition, and its presentation metadata.
2. `ActorState` is **typed and closed**: enough for activity, modification, binding, visibility, presence, and localisation—no arbitrary key/value bag.
3. **Compartments are declared entities**, not magic strings.
4. **Sequential and parallel** action groups inside a step.
5. A **small primitive core**; biologically expressive verbs are **aliases** that desugar to primitives.
6. The renderer consumes **resolved state plus a generic change list**. It never switches on action types.
7. **Total determinism**: every step is a pure fold of the initial state over the preceding actions.
8. **Clean migration** from v1. PARP1 and HR keep producing the same scenes.

**Design rule.** A primitive does exactly what its verb says, with as few implicit side effects as possible. The side effects that remain are listed in §9 and are part of the contract.

Non-goals for v2: stoichiometry and repeated instances, multi-partner complexes, continuous kinetics, per-step citations (tracked separately as the next RFC).

---

## 1. Proposed interfaces

```ts
// ---- Definition (what authors write, after normalisation) ----
export interface MechanismDefinition {
  schemaVersion: 2;
  mechanism: { id: string; name: string; description?: string };
  compartments: CompartmentDefinition[];      // may be empty
  actors: ActorDefinition[];
  steps: MechanismStep[];
}

export interface ActorDefinition {
  id: string;
  type: 'dna' | 'rna' | 'protein' | 'molecule' | 'complex';
  label?: string;
  description?: string;
  color?: string;
  position?: Point;
  sites?: ActorSite[];
  compartment?: string;                        // initial localisation
  initial?: { present?: boolean; visible?: boolean; activity?: Activity };
}

export interface MechanismStep {
  id: string;
  title: string;
  description?: string;
  duration?: number;                           // playback override (ms)
  actions: ActionNode[];                       // a top-level list is a sequence
}

export type ActionNode = ActionSpec | { sequence: ActionNode[] } | { parallel: ActionNode[] };

export interface ActionSpec {
  type: string;                                // primitive or alias name
  duration?: number;                           // ms, default 600
  by?: string;                                 // causal agent (enzyme, ligand, drug)
  [field: string]: unknown;                    // validated by the registry entry
}

// ---- Registry ----
export interface PrimitiveDefinition<A extends ActionSpec = ActionSpec> {
  kind: 'primitive';
  type: string;
  description: string;
  fields: Record<string, FieldSpec>;           // drives validation *and* JSON Schema
  presentation: Presentation;
  validate?(action: A, ctx: ValidationContext): void;     // static cross-field checks
  apply(state: MechanismState, action: A, ctx: ApplyContext): void; // mutates a draft
}

export interface AliasDefinition<A extends ActionSpec = ActionSpec> {
  kind: 'alias';
  type: string;
  description: string;
  fields: Record<string, FieldSpec>;
  presentation: Presentation;
  expand(action: A): ActionSpec;               // exactly one primitive (or another alias)
}

export interface Presentation { verb: string; tone?: 'activating' | 'inhibitory' | 'neutral' }

// ---- Resolved output ----
export interface MechanismSnapshot {
  stepIndex: number;
  step: MechanismStep;
  definition: MechanismDefinition;             // shared, frozen
  actors: Record<string, ActorState>;
  sites: Record<string, SiteState>;            // keyed by "actor.site"
  timeline: TimedAction[];                     // this step's actions, with offsets
}

export interface TimedAction {
  path: string;                                // "steps[1].actions[0].parallel[1]"
  type: string;                                // as authored, e.g. "phosphorylate"
  primitive: string;                           // e.g. "modify"
  presentation: Presentation;
  subject?: string;
  agent?: string;
  start: number;                               // ms from step start
  duration: number;
  changes: StateChange[];                      // generic diff produced by the engine
}

export interface StateChange { key: string; from: unknown; to: unknown }  // key: "actors.parp1.activity"
```

## 2. Example registry entry

```ts
export const bind = definePrimitive<BindAction>({
  type: 'bind',
  description: 'Associate an actor with another actor or with one of its sites.',
  fields: { actor: field.actor({ required: true }), target: field.reference({ required: true }) },
  presentation: { verb: 'binds' },
  apply(state, action, ctx) {
    const actor = ctx.requirePresent(action.actor);
    ctx.requirePresent(action.target.split('.')[0]!);
    actor.boundTo = action.target;
    actor.visible = true;                      // binding brings an actor into the scene
  },
});
```

The registry is an immutable value: `builtinRegistry.extend([myPrimitive, myAlias])` returns a new registry, which is passed to `parseMechanism(source, { registry })` / `compileMechanism(input, { registry })`.

Field kinds: `actor`, `reference` (`actor` or `actor.site`), `site` (must be `actor.site`), `compartment`, `string`, `integer`, `boolean`, `enum`. A single generic validator checks existence, types, and cross-references, and `toJsonSchema(registry)` generates `schema.json`. A test fails if the committed schema drifts from the registry.

## 3. `ActorState`

```ts
export type Activity = 'active' | 'inactive' | 'inhibited';

export interface ActorState {
  id: string;
  present: boolean;                            // exists (false before synthesis, after degradation)
  visible: boolean;                            // shown in the narrative right now
  compartment?: string;
  boundTo?: string;                            // "actor" or "actor.site"
  activity?: { state: Activity; by?: string }; // undefined = not specified
  modifications: Modification[];               // ordered, unique by id
}

export interface Modification {
  id: string;                                  // "phosphorylation@Y1068", "parylation"
  kind: string;                                // open vocabulary: the extension point
  site?: string;
  label: string;
  length?: number;                             // chains and filaments (PAR, RAD51)
}

export interface SiteState { lesion?: LesionType }
export type LesionType =
  'single-strand-break' | 'double-strand-break' | 'base-damage' | 'abasic-site' | 'adduct';
```

Example: EGFR after ligand binding and autophosphorylation.

```json
{
  "id": "egfr",
  "present": true,
  "visible": true,
  "compartment": "membrane",
  "boundTo": "egf",
  "activity": { "state": "active", "by": "egf" },
  "modifications": [
    { "id": "phosphorylation@Y1068", "kind": "phosphorylation", "site": "Y1068", "label": "P" }
  ]
}
```

Static data (label, colour, type) stays in the definition. State holds only what changes over time, so diffs and equality checks stay trivial.

## 4. Compartments

```ts
export interface CompartmentDefinition {
  id: string;
  kind: CompartmentKind;                       // semantic + layout hint
  label?: string;
  parent?: string;                             // nesting, e.g. nucleus ⊂ cytoplasm
}
export type CompartmentKind =
  'extracellular' | 'membrane' | 'cytoplasm' | 'nucleus' | 'er' | 'golgi' |
  'mitochondrion' | 'endosome' | 'generic';
```

Authors can use a string shorthand that resolves against a small built-in **library**, which is data rather than engine logic:

```yaml
compartments: [extracellular, membrane, cytoplasm, nucleus]
# equivalent to
compartments:
  - { id: cytoplasm, kind: cytoplasm, label: Cytoplasm }
  - { id: nucleus,   kind: nucleus,   label: Nucleus, parent: cytoplasm }
  # …
```

Custom compartments use the object form (`{ id: er-lumen, kind: generic, parent: er }`). The engine only checks that references exist and that `parent` is acyclic. It never special-cases an id. The renderer maps `kind` to a layout band.

## 5. Sequential vs parallel

```yaml
actions:                         # top-level list = sequence
  - type: recruit                #   t = 0 … 600
    actor: lig3
    target: xrcc1
  - parallel:                    #   t = 600 … 1400 (= longest branch)
      - type: ligate
        target: dna.lesion
        by: lig3
        duration: 800
      - type: unbind
        actor: polb
```

- **State semantics:** actions are applied in document order. The final state of a step does not depend on timing.
- **Parallel contract:** `parallel` declares that the author considers its branches independent. The compiler guarantees there are no *write* conflicts: branches must not change the same state key. The engine diffs each branch and rejects overlaps (`steps[4].actions[1]: parallel branches [0] and [1] both change actors.x.boundTo`). It does **not** analyse read-after-write dependencies (see §9.5).
- **Time semantics:** `sequence` adds up durations; `parallel` takes the longest branch. Every `TimedAction` gets a deterministic `start`/`duration` in integer milliseconds, ready for renderers to interpolate.

## 6. PARP1 fragment in v2

```yaml
schemaVersion: 2
mechanism: { id: parp1-ssb-repair, name: PARP1-mediated SSB repair }
compartments: [nucleus]

actors:
  - id: dna
    type: dna
    compartment: nucleus
    sites: [{ id: lesion, type: single-strand-break, position: center }]
  - id: parp1
    type: protein
    label: PARP1
    compartment: nucleus
    initial: { activity: inactive }

steps:
  - id: damage
    title: Single-strand break
    actions:
      - type: cleave
        target: dna.lesion
  - id: recognition
    title: PARP1 detects the break
    actions:
      - type: bind
        actor: parp1
        target: dna.lesion
      - type: activate          # alias → set-state
        actor: parp1
        by: dna
  - id: parylation
    title: PAR synthesis
    actions:
      - type: parylate          # alias → modify { kind: parylation, length }
        actor: parp1
        length: 9
```

## 7. Implementing an alias: `phosphorylate`

```ts
export const phosphorylate = defineAlias<PhosphorylateAction>({
  type: 'phosphorylate',
  description: 'Add a phosphate group, optionally at a named residue.',
  fields: { actor: field.actor({ required: true }), site: field.string(), label: field.string() },
  presentation: { verb: 'phosphorylates', tone: 'activating' },
  expand: ({ actor, site, label, by, duration }) => ({
    type: 'modify', actor, kind: 'phosphorylation', site, label: label ?? 'P', by, duration,
  }),
});
```

Aliases are expanded at compile time. The engine runs primitives only. Each `TimedAction` keeps the authored `type` and the alias's `presentation`, so captions and accessible descriptions still say *phosphorylates*. Validation errors point to the authored path, not to the expansion.

### Built-in vocabulary

| Primitives | Effect on state |
|---|---|
| `bind` / `unbind` | `boundTo`, reveals the actor |
| `set-state` | `visible`, `activity` (actors); `lesion` (sites) |
| `modify` | add/remove a `Modification` (unique by `kind@site`) |
| `translocate` | `compartment` of the actor only; with `includeBound: true`, also of every actor bound to it (transitively). Bindings are never changed |
| `synthesize` | `present: true` for a declared product; compartment defaults to the agent's |
| `degrade` | `present: false`, hides it, releases everything bound to it |
| `cleave` | site lesion → break (`single-strand-break` default) |
| `ligate` | clears a break; error if the site has no break |

| Aliases | Expands to |
|---|---|
| `recruit` | `bind` |
| `show` / `hide` | `set-state { visible }` |
| `activate` / `inactivate` / `inhibit` | `set-state { activity }` |
| `phosphorylate` / `dephosphorylate` | `modify { kind: phosphorylation }` (add/remove) |
| `ubiquitinate` | `modify { kind: ubiquitination }` |
| `parylate` | `modify { kind: parylation, length }` |
| `polymerize` | `modify { kind: polymer, label: product, length }` |
| `damage` / `excise` / `repair` | `set-state { lesion: base-damage \| abasic-site \| none }` |

### Coverage check against the five target mechanisms

| Mechanism | Needs | Covered by |
|---|---|---|
| PARP1 | break, binding, activation, PAR chain | `cleave`, `bind`, `activate`, `parylate`, `ligate` |
| HR | DSB, recruitment, RAD51 filament | `cleave`, `recruit`, `polymerize`, `repair` |
| BER | base damage → AP site → nick → seal | `damage`, `excise`, `cleave`, `ligate` |
| cGAS–STING | cytosolic DNA, cGAMP synthesis, ER→Golgi, IRF3 → nucleus | compartments, `synthesize`, `translocate`, `phosphorylate`, `activate` |
| EGFR–MAPK | ligand binding at membrane, phospho-cascade, ERK → nucleus | compartments, `bind`, `phosphorylate`, `activate`, `translocate` |

## 8. Code changes

| File | Change |
|---|---|
| `core/src/types.ts` | v2 definition, state, timeline types; v1 types kept as `v1.ts` for migration input |
| `core/src/registry.ts` *(new)* | `definePrimitive`, `defineAlias`, `field`, `ActionRegistry` |
| `core/src/actions.ts` *(new)* | built-in primitives and aliases |
| `core/src/compartments.ts` *(new)* | standard library + normalisation |
| `core/src/validate.ts` | structural validation of v2 + generic field validation through the registry |
| `core/src/engine.ts` | compile-time fold over all steps, diffing, parallel conflict check, timing, frozen snapshots |
| `core/src/migrate.ts` *(new)* | `migrateV1(doc)`, applied automatically by `parseMechanism` |
| `core/src/schema.ts` *(new)* + `schema.json` | generated from the registry; v1 schema kept as `schema.v1.json` |
| `svg/src/scene.ts` | reads `ActorState` + `definition`; lesions from `sites`; chains from modifications with `length`; passes activity/compartment through |
| `react/src/MolecularMechanism.tsx` | actor details read from the definition |
| `examples/*.yaml`, demo, README | v2 syntax |

## 9. Trade-offs and decisions to fix now

1. **Closed state, open vocabulary.** Custom primitives may only write the typed fields above. The open extension point is `Modification.kind`. If a mechanism needs a new *kind* of state, that is a schema change (v3), on purpose.
2. **One binding partner per actor** (`boundTo`). *Approved for v2.* Enough for tree-shaped assemblies (EGF→EGFR←GRB2←SOS; MRN←BRCA1). This is a deliberate, explicit limitation: no stoichiometry, complex graphs, or multiple binding interfaces. A richer complex representation stays open for a later schema version and must not be emulated through `boundTo`.
3. **Aliases expand to exactly one action.** *Approved.* Aliases are semantic sugar, not macros. If compound operations are needed later they will be a separate, explicit concept (e.g. `preset`), not an extension of aliases.
4. **Validation runs during the fold.** Errors such as "ligate on a site with no break" or "bind a degraded actor" are reported at compile time, because the engine precomputes every step boundary. Cost is O(steps × actors), negligible at this scale, and it makes `at()` O(1).
5. **Parallel safety is checked on writes only.** *Approved for now.* `parallel` means independence declared by the author. The compiler rejects write conflicts but does not detect read-after-write dependencies (e.g. binding to a product synthesised in a sibling branch). Authors must not make a branch depend on its siblings.
6. **`present` vs `visible`.** Biology (does it exist?) is kept separate from narrative (is it shown now?). `synthesize` and `degrade` change both. `show` and `hide` change only `visible`.
7. **Translocation moves only the named actor.** *Revised after review.* `translocate` never unbinds anything and, by default, never moves anything else. `includeBound: true` moves the actor plus every actor bound to it, directly or transitively, keeping all their bindings. The partner the actor itself is bound to is not moved: to move a whole complex, translocate its root. Separating an actor from its partner is always an explicit `unbind`.
8. **v1 stays readable.** `parseMechanism` migrates `schemaVersion: 1` documents automatically, and a golden test locks the migrated PARP1 and HR scenes to the exact output of the v1 engine.
9. **Durations are presentation only.** They never affect state, so seeking by step stays a pure function of the step index.
10. **Remaining implicit side effects.** Under the design rule, these are the only ones left, each justified by keeping state consistent or by v1 compatibility:
    - `bind` makes the bound actor visible, because a binding to an invisible actor cannot be drawn. It is also what v1 did, so the golden tests depend on it.
    - `synthesize` makes the product visible and, if no compartment is given, places it in the agent's compartment.
    - `degrade` hides the actor and releases the actor's own binding and every binding *to* it. Otherwise references would point to an actor that no longer exists.

    Candidate for later: make `degrade` fail while other actors are still bound to the degraded one, instead of releasing them, so the author has to write the `unbind`s.
