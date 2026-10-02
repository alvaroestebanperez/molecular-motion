# RFC 0005 — Actor instances, interaction graph, and nucleic-acid occupancy

- **Status:** draft. The decisions in §9 are open and must be settled before implementation.
- **Builds on:** [RFC 0001](0001-schema-v2.md) §9.2, [RFC 0004](0004-nucleic-acid-geometry.md)
- **Roadmap item:** *Complex assembly, stoichiometry, and repeated actor instances*

## 1. Problem

Schema v3 has three structural limits. RFC 0001 accepted all three on purpose and said they must not be emulated:

1. **One copy per actor.** A RAD51 filament, RPA coating ssDNA, an EGFR dimer, a STING tetramer, and a histone octamer all need several copies of the same protein. Today a filament is faked as a `modify { length }` chain. The HR example from RFC 0004 ends with a branched PAR-style chain floating above the 3′ overhang for exactly this reason.
2. **One binding partner per actor** (`ActorState.boundTo`). This cannot express an EGFR monomer bound to EGF *and* to the other EGFR, cGAMP bridging two STING protomers, or BRCA2 holding RAD51 while bound to ssDNA.
3. **Binding to DNA is a point.** `bind x → dna.site` says nothing about how much DNA the protein covers, on which strand, in which orientation, or whether two proteins can sit on the same nucleotides.

## 2. Four concepts, kept apart

This RFC does **not** introduce one "complex" abstraction that does everything. It separates four concepts, and each answers one question:

| Concept | Question | Lives in | Changes over time? |
|---|---|---|---|
| **Actor definition** | What kind of molecule is it, and what does it look like? | `definition.actors[]` | no |
| **Actor instance** | Which copy, and what is its state? | `state.instances` | yes |
| **Interaction graph** | Who is bound to whom, and through which interface? | `state.interactions` | yes |
| **Spatial occupancy** | Which nucleotides does an instance cover, on which strand, facing which way? | `state.occupancy` | yes |

A **complex** is not a fifth stored concept. It is a *derived* view: a connected component of the interaction graph (§9, D6).

```text
definition.actors ──instantiates──▶ instances ◀──edges── interactions
                                        │
                                        └──holds──▶ occupancy ──on──▶ nucleic acid (RFC 0004 coordinates)
```

## 3. Actor definitions and instances

### 3.1 Compact declaration, explicit instances (preferred, D1)

```yaml
actors:
  - id: rad51
    type: protein
    label: RAD51
    copies: 8                  # compiles to rad51#1 … rad51#8
    footprint: { length: 3, form: single }
    interfaces:
      - { id: protomer, valence: 2 }   # one neighbour on each side of the filament
```

- `copies: n` compiles to `n` individual instances `rad51#1 … rad51#n`. Each instance has its own `present`, `visible`, `compartment`, `activity`, `modifications`, bindings, and occupancy.
- **An actor without `copies` has exactly one instance whose id is the actor id** (`parp1`, not `parp1#1`). Legacy references, diff keys, `data-key`s, and URLs therefore stay unchanged. This is the main lever for byte-identical regression.
- References: `rad51#3` addresses one copy. Bare `rad51` is an error when `copies > 1`, because it is ambiguous. Selectors for many copies at once are an open decision (D3).
- **The pool is static** (D2). All copies exist in the definition from the start. A copy that is not yet in the story uses `initial: { present: false }` per actor or a per-copy override, and comes in through `synthesize`, `show`, or binding. Seeking stays a pure fold over a fixed set of keys.

### 3.2 Count only vs explicit instances

| | `count` only (one actor + a number) | Explicit instances (preferred) |
|---|---|---|
| State per copy | No. All copies share activity, modifications, bindings | Yes. `rad51#3` can be phosphorylated while `rad51#4` is not |
| Bindings | Need "k of n bound" arithmetic; cannot say *which* copy binds whom | Edges name the copy |
| Occupancy | One span for the whole group; no gaps, no displacement of one copy | Per-copy spans, so RAD51 can displace RPA one copy at a time |
| Layout and animation | Stable for a group, but a copy cannot move alone | Each copy gets its own `data-key`, so the animation is truthful |
| Authoring cost | Lowest | Low with `copies: n`. The expansion is mechanical |
| Engine cost | O(actors) | O(instances). Fine at tens to hundreds |

A count is attractive for a "20 copies of ATP" bath where no copy has identity. It can be added later as a *presentation* hint (a "×20" badge) without changing state. It is not proposed as state now.

### 3.3 Visual identity is per definition

- **The renderer seeds silhouettes from the definition id, never the instance id.** Every `rad51#k` is the same shape and colour, so "this is RAD51" stays readable. Today `actorParticles(actor.id, …)` seeds from the actor id, so the scene will have to pass the definition id.
- An instance may change **position, orientation, state, and bindings**. It may never acquire another silhouette. Activity and modification styling still applies per instance, as it does today.
- Labels are a renderer decision. The default is one callout per visible group of copies ("RAD51 ×6"), not six pills.

## 4. Interaction graph

### 4.1 Options

**A. `boundTo: string[]` on the actor state.** This is the smallest change. But a binding is stored on *one* side, so "who is bound to EGFR#1?" means scanning every actor. If it is stored on both sides, every bind has to write two places and keep them consistent, and parallel-branch conflicts then appear on keys that the author never touched. It has no place to say *how* two molecules bind (which interface), so valence cannot be checked. Symmetric relations such as a homodimer have no natural owner.

**B. Edges with interfaces (preferred, D4).** Each interaction is stored **once**, in `state.interactions`:

```ts
interface InteractionEnd { instance: string; interface?: string }   // "egfr#1", "dimer"
interface Interaction {
  id: string;            // canonical: sorted ends, e.g. "egfr#1.dimer~egfr#2.dimer"
  ends: [InteractionEnd, InteractionEnd];
  symmetric?: boolean;   // homotypic (dimer); otherwise ends[0] is the binder
}
// state.interactions: Record<string, Interaction>
```

- **Single source of truth.** A binding exists once, and "partners of X" is an index built per snapshot rather than stored state.
- **Interfaces and valence** are declared on the definition (`interfaces: [{ id, valence }]`) and checked at compile time. For example, `egfr.dimer` has valence 1, so a third EGFR cannot join. A `ligand` interface with valence 1 accepts one EGF.
- **Diff keys** are `interactions.<id>`. Two parallel branches conflict only if they create or remove the *same* interaction.
- **Legacy.** `bind { actor, target }` creates an edge from `actor` (anonymous binder interface, valence 1, which is exactly v3's single `boundTo`) to `target` (anonymous, unlimited valence). `unbind { actor }` removes the actor's anonymous edge.

### 4.2 What stays derived

- **Complexes** are the connected components of the graph (D6). `translocate { includeBound: true }` becomes "move the component". `degrade` removes every edge touching the instance, as today, but now over the graph.
- **`ActorState.boundTo` leaves the stored state** in v4. A helper (`partnersOf(snapshot, id)`) and a derived "primary partner" for legacy UI replace it (D5).

## 5. Spatial occupancy on nucleic acids

```ts
interface Occupancy {
  id: string;              // "<instance>@<acid>"
  instance: string;        // "rad51#3"
  acid: string;            // "dna"
  span: { from: number; to: number };   // interbase, RFC 0004 coordinates
  strand: 'top' | 'bottom' | 'both';
  orientation?: 'forward' | 'reverse';  // relative to top 5′→3′; meaningful for polar assemblies
}
// state.occupancy: Record<string, Occupancy>
```

**The footprint is authored data on the definition, never a core constant:**

```yaml
footprint:
  length: 3            # nucleotides covered per copy (author's choice, abstract units)
  form: single         # single | duplex | any: what the covered strand(s) must be
```

Validation is generic and uses RFC 0004 state:

- The span must lie inside the molecule and match `footprint.length`. A `form: single` occupant needs its strand present and its partner `missing` across the span. A `form: duplex` occupant needs both strands present and no `open` region. `any` needs only the occupied strand present.
- **Occupancy is exclusive per strand.** Two occupancies may not cover the same nucleotide on the same strand. `both` counts as both strands.
- RFC 0004 actions respect occupancy. `resect`, `unwind`, and `extend` fail across occupied nucleotides whose required form they would break. As in RFC 0004, they never displace occupants silently: displacement is an explicit `vacate`.

**Actions** (names provisional, D7):

| Action | Effect |
|---|---|
| `occupy { actor: rad51#3, target: dna.site \| span, strand?, orientation? }` | Adds one occupancy. Without a span, it is anchored at the site and sized by the footprint |
| `vacate { actor }` | Removes the instance's occupancy |
| `coat { actors: [rad51#1, …], target: dna.overhang, orientation? }` | Places the listed copies **adjacently** from one end of the span. It fails if they do not fit or if the region is occupied. A list action, not a hidden count (D3) |

**Legacy.** `bind { actor, target: dna.site }` becomes an occupancy at the site with the actor's footprint. Without a declared footprint the occupancy is a zero-length point, which is exactly what v3 draws.

**Occupancy and interaction are independent.** RAD51 protomers along ssDNA have *both*: occupancy on DNA, and `protomer` edges to their neighbours. Neither is inferred from the other.

## 6. Test cases for the design (not implemented here)

| Case | Instances | Interactions | Occupancy |
|---|---|---|---|
| **RPA → RAD51 on the 3′ overhang** | `rpa` ×3, `rad51` ×6, `brca2` | `brca2`–`rad51#k` (mediator); `rad51#k.protomer`–`rad51#k+1.protomer` | `coat` RPA (form single); `vacate` RPA one by one while RAD51 copies `occupy`. Every step is explicit |
| **EGFR dimerization** | `egfr` ×2, `egf` ×2 | `egf#i`–`egfr#i.ligand`; `egfr#1.dimer`–`egfr#2.dimer`; trans-autophosphorylation `phosphorylate egfr#2 by egfr#1` | none (membrane, compartments) |
| **STING activation** | `sting` ×4, `cgamp` | `sting#1.dimer`–`sting#2.dimer`; cGAMP edges to *both* protomers of a dimer (pocket at the interface); `sting.oligo` edges between dimers | none. `translocate` ER→Golgi moves the whole component |
| **Nucleosome** | Either one `complex` actor `nucleosome` (footprint 147, form duplex) or 8 histone instances with edges (D8) | Octamer edges if instances are used | One duplex occupancy of 147 bp. Wrapping is a renderer decision |

**Explicitly out of scope:** strand invasion, D-loops, Holliday junctions, and any pairing of two nucleic-acid molecules. Occupancy is between a protein instance and *one* nucleic acid. Nothing here may be used to fake a second molecule pairing with the first.

## 7. Rendering (renderer decisions, no schema impact)

- Scene actors become scene **instances**, keyed `actor:<instance>`. For single-copy actors this is the same key as today.
- An occupant is laid out at its span on its strand: centred on the span, oriented by `orientation`, resting on the strand surface that RFC 0004 already computes. Adjacent occupants of the same definition read as a filament.
- An interaction draws the existing contact (no line). A component is laid out by docking along edges, as `boundTo` children are now, generalised to more than one partner and to interface-specific docking directions.
- The modification chain stays for real polymers attached to one protein (PAR). RAD51 in the HR example moves from a chain to copies plus occupancy in a later example PR.

## 8. Schema version and migration

New kinds of state (`instances`, `interactions`, `occupancy`), together with the removal of `ActorState.boundTo`, make this **`schemaVersion: 4`** (RFC 0001 §9.1):

- **v3 → v4 is automatic.** Actors keep a single instance with id = actor id. `bind` to an actor becomes an anonymous edge. `bind` to a site becomes a point occupancy. No document needs editing.
- **The regression is in place before any code changes**, as in RFC 0004: SHA-256 of every step's full and compact SVG for the frozen v2 fixtures *and* the current v3 examples. Both must stay byte-identical through the migration PR.
- **Snapshot API change.** `snapshot.actors` becomes `snapshot.instances` (or keeps its name with instance keys; D5). `boundTo` is replaced by helpers. React's "bound to" chip reads the helper. This is the one breaking change for consumers, and it ships with the migration PR.

## 9. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Copies | (a) `copies: n` → `id#1…n`; (b) count only; (c) both, with count as a presentation badge | **(a)** now. Add a presentation badge later if baths of identical molecules need it |
| **D2** | Instance lifecycle | (a) static pool declared up front; (b) dynamic creation (`spawn`) | **(a)**: fixed key set, pure seeking, simple diffs. `present: false` covers "not yet there" |
| **D3** | Acting on many copies | (a) one instance per action; author writes N actions (in `parallel`); (b) list fields (`actors: [...]`) applied atomically by the primitive; (c) selectors/ranges (`rad51#1..6`, `rad51#*`) | **(b)** for occupancy (`coat`) and **(a)** elsewhere. Defer ranges: they are syntax, not semantics, and can desugar to (b) later. No "next free copies" magic |
| **D4** | Binding representation | (a) `boundTo: string[]`; (b) edges with optional interfaces in `state.interactions` | **(b)**: stored once, interfaces and valence, per-edge diff keys |
| **D5** | Legacy `boundTo` and snapshot shape | (a) remove from state and expose helpers; (b) keep as a derived read-only field in snapshots | **(a)**, with a `primaryPartner()` helper for UIs. A derived field in snapshots is duplicated state by another name |
| **D6** | Complexes | (a) derived connected components; (b) declared complex entities with names | **(a)**. Named complexes can later be a *label* over a component, never stored membership |
| **D7** | Protein–DNA binding | (a) always occupancy (bind to a site → occupancy); (b) an edge to a site *plus* optional occupancy | **(a)**: one concept for "on DNA", and edges stay instance-to-instance |
| **D8** | Who holds an occupancy | (a) one instance (a multi-protein unit that sits on DNA as one, such as a nucleosome, is one `complex` actor with a footprint); (b) a whole component holds one occupancy | **(a)** now. The histone composition can come later as instances plus edges, with occupancy still held by one designated instance |
| **D9** | Footprint | (a) on the definition (`length`, `form`); (b) on each `occupy` action | **(a)**, overridable per action by an explicit `span`. Copies of one actor behave alike |
| **D10** | Occupancy overlap | (a) exclusive per strand; (b) declared stacking/compatibility between definitions | **(a)** now. Compatibility rules are a later extension |
| **D11** | Orientation | (a) semantic (`forward`/`reverse` on occupancy, relative to top 5′→3′); (b) renderer only | **(a)** on occupancy only, because filament polarity is biology. Free-space rotation stays a renderer matter |
| **D12** | Version | (a) `schemaVersion: 4` with automatic v3 → v4; (b) additive fields under v3 | **(a)**, following RFC 0001 §9.1 as RFC 0004 did |

## 10. Implementation plan (after the decisions)

| PR | Scope | Output change |
|---|---|---|
| 0. Regression | SHA-256 renders of the v2 fixtures and current v3 examples | none |
| 1. Instances + v4 | `copies`, instance expansion, per-instance state, v3 → v4 migration, scene keyed by instance and seeded by definition | none (byte-identical) |
| 2. Interaction graph | `state.interactions`, interfaces, valence, `bind`/`unbind`/`degrade`/`translocate` over edges, helpers, React chip | none |
| 3. Occupancy | `state.occupancy`, footprints, `occupy`/`vacate`/`coat`, RFC 0004 actions respect occupants | none for legacy docs |
| 4. Rendering | occupants on strands, multi-partner docking, grouped labels | only for documents that use the new features |
| 5. Examples | HR: RPA coating, then RAD51 copies on the overhang, replacing the chain. A small EGFR dimer example | intended |
