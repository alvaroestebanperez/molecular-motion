# RFC 0006 — Nucleic topology: pairing between strands of different molecules

- **Status:** accepted. Decisions in §11.
- **Builds on:** [RFC 0004](0004-nucleic-acid-geometry.md) (coordinates, strand state), [RFC 0005](0005-assemblies-and-occupancy.md) (instances, interactions, occupancy)
- **Roadmap item:** *Interactions between nucleic-acid molecules: strand invasion, D-loops, synthesis on a sister chromatid, Holliday junctions*

## 1. Problem

The HR example stops at the RAD51 filament because every nucleic-acid relation in the model is internal to one molecule. Base pairs are derived from "both strands present and not unwound". RFC 0004 §10.7 and RFC 0005 §6 forbade faking a second molecule with `open` or `nascent` ranges. To continue HR honestly, the model must express this chain as explicit actions:

```text
RAD51-coated ssDNA → homology engagement → strand invasion → displaced strand
   → synthesis using the sister chromatid as template → resolution
```

The RFC looks for the **smallest generic abstraction** that does so. It does not add a `DLoop` primitive, a D-loop state, or any other named structure. HR is the main case. Annealing of complementary molecules and other branched structures are the check that the abstraction is generic (§9).

## 2. Three layers, kept apart

RFC 0005 separated who binds whom from who sits where. This RFC adds a third relation and keeps the same discipline: each layer answers one question, is stored once, and is never inferred from another.

| Layer | Relation | Question | Lives in | RFC |
|---|---|---|---|---|
| **Interaction graph** | instance ↔ instance | Who is bound to whom, through which interface? | `state.interactions` | 0005 |
| **Occupancy** | instance → span of a nucleic acid | Which nucleotides does a protein cover, on which strand? | `state.occupancy` | 0005 |
| **Nucleic topology** | strand span ↔ strand span of another molecule | Which nucleotides are base-paired with which? | `state.pairings` | this one |

```text
instances ◀──edges── interactions                       (layer 1)
    │
    └──holds──▶ occupancy ──on──▶ strand span           (layer 2)
                                      ▲
                                      └──paired with──▶ strand span of another molecule   (layer 3)
```

How the HR chain falls on the layers:

| Event | Layer 1 | Layer 2 | Layer 3 |
|---|---|---|---|
| RAD51-coated ssDNA | `protomer` edges between copies | each copy occupies 3 nt of the overhang | none |
| Homology engagement | unchanged | filament copies also rest on the donor (D9) | **none**: no base pair exists yet |
| Strand invasion | unchanged | unchanged, or copies leave by `vacate` | a pairing appears |
| Synthesis on the donor | a polymerase binds | the polymerase may occupy | the pairing grows |
| Resolution | proteins leave | occupants leave | the pairing is removed |

Rules that follow:

- **A pairing never names a protein, and an occupancy never names a second molecule.** RAD51 does not "hold" the two DNAs together in the state. If the filament bridges them, that is two occupancies by the same instance (layer 2).
- **No layer derives another.** A pairing does not create an interaction between the two molecules, and removing every protein does not remove a pairing.
- **Layers constrain each other only through named validation rules**, as occupancy already does with strand state (`requireOccupantsFit`). Section 7 lists them.

## 3. Nucleic topology

### 3.1 The only new state

```ts
interface StrandSpan { acid: string; strand: StrandId; from: number; to: number }  // interbase, RFC 0004
interface Pairing { ends: [StrandSpan, StrandSpan] }   // equal lengths; ends in canonical order
// state.pairings: Record<string, Pairing[]>   keyed by strand pair, e.g. "chromosome.bottom~sister.top"
```

A pairing says that the nucleotides of one strand span are base-paired, one to one, with the nucleotides of another strand span. Nothing else is stored: no kind, no name, no reference to why it formed. Lists are normalised like RFC 0004 ranges (adjacent segments with the same correspondence merge), so a pairing that grows by synthesis changes one diff key, `pairings.<strand pair>`.

### 3.2 Polarity fixes the coordinate correspondence (D2)

Base pairing is antiparallel. RFC 0004 fixes each strand's polarity: `top` runs 5′→3′ with increasing coordinates, `bottom` with decreasing ones. Given two spans of equal length, the nucleotide-by-nucleotide map is therefore forced, and no orientation flag or map is stored:

| Strands paired | Correspondence | Typical case |
|---|---|---|
| `top` ↔ `bottom` | direct: `a.from + i ↔ b.from + i` | two duplexes aligned in the same direction |
| `top` ↔ `top`, `bottom` ↔ `bottom` | mirrored: `a.from + i ↔ b.to − 1 − i` | two complementary single strands; an inverted repeat |

The 5′ end of one span always meets the 3′ end of the other. Which end of a paired span is a 3′ end, and therefore where a polymerase can act, is read from the strand, as in RFC 0004.

### 3.3 One invariant: at most one partner per nucleotide

A nucleotide is in exactly one of three conditions, all derived by one helper (`partnerOf(state, acid, strand, range)`):

- **paired in cis**: the other strand of its own molecule is present and the position is not `open` (RFC 0004, unchanged, still derived);
- **paired in trans**: it lies inside a pairing;
- **unpaired**: neither.

`pairingConflicts` is the single check, in the style of `occupancyConflicts`: a pairing may only cover nucleotides that are **present and unpaired**. A strand becomes unpaired in the ways RFC 0004 already provides: its partner was removed (`resect`), the duplex was opened (`unwind`), or the molecule is single-stranded.

This is why `open` needs no change of meaning. It already says "both strands present, not paired with each other". A donor strand paired in trans sits inside an `open` region, and the other donor strand in that region is the displaced strand.

### 3.4 Structures are derived, never stored

A **branch point** is a position where the partner of a strand changes along its length (cis → trans, trans → unpaired, one pairing → another). The core does not store, name or count branch points. A D-loop is "an `open` region with a pairing into one of its strands". An R-loop is the same with an RNA. A Holliday junction is two reciprocal pairings (§9). The renderer draws strands and their partners. A step title may call the result a D-loop; no code does.

## 4. Alignment: what a pairing may form between (D3, D4)

The core has no sequence. It cannot know, and never asserts, that two molecules are homologous or complementary. The author declares which ranges **correspond**, in a top-level list:

```yaml
alignments:
  - id: sister
    between: [chromosome, sister]
    range: [0, 80]                  # same coordinates on both
    # or: a: { acid: chromosome, span: [0, 80] }, b: { acid: sister, span: [100, 180] }
    orientation: same               # same | opposite
```

**Alignment and pairing are two concepts, and they stay apart:**

| | `alignment` | `Pairing` |
|---|---|---|
| Says | these two ranges correspond, position by position, so their strands *may* pair | these nucleotides *are* base-paired now |
| Lives in | the definition | `state.pairings` |
| Changes over time | never | yes, only through `pair`, `unpair` and `extend` |
| Biological claim | none. Why the ranges correspond (homology, complementarity, a designed guide) is the author's business | a base pair exists |

- **Which strands may pair follows from polarity.** With `same`, `a.top` may pair with `b.bottom` and `a.bottom` with `b.top`. With `opposite`, `top` with `top` and `bottom` with `bottom`.
- **An alignment is required (D3).** `pair` is rejected unless an alignment covers both spans with the matching correspondence. `pair { target, with }` uses it to derive the partner span, so the author does not repeat coordinates.
- **The state does not reference it.** A pairing is valid or not by §3.3 alone. The alignment is checked when a pairing is created or grown, and an alignment with no pairing changes nothing.
- A molecule may be aligned with itself over two ranges (repeats, inverted repeats).

## 5. Actions

| Action | Effect | Fails when |
|---|---|---|
| `pair { target, with, strand?, span?, alignment? }` | Pairs a strand span of the target molecule with the corresponding strand span of `with`, found through the alignment | either span is not present and unpaired (§3.3); no alignment covers them |
| `unpair { target, strand?, span? }` | Removes the pairing over that span. Both strands become unpaired | nothing is paired there |
| *(alias)* `invade` → `pair` | Presentation verb "invades" | — |

`pair` and `unpair` do nothing else. They do not unwind, anneal, displace, or move proteins.

**Displacement of an existing strand is explicit (D6).** To pair with a strand that is paired in cis, the duplex is first opened with `unwind` (RFC 0004), and the old partner stays in the bubble as the displaced strand. After `unpair`, the bubble stays `open` until `anneal`. `unwind` and `pair` are independent primitives and there is no concerted action. If authoring proves too verbose, a later alias may compile to several actions, which changes no state and no primitive.

**Existing strand actions gain one guard each**, all through `partnerOf`:

| Action | Added rule |
|---|---|
| `anneal` | fails if a strand it would close is paired in trans: `unpair` first. An optional `span` closes only part of the bubble |
| `resect` | fails across nucleotides paired in trans |
| `unwind` | unchanged. An adjacent span merges into the existing bubble, which is how a bubble grows |
| `degrade` (of a nucleic acid) | removes its pairings, as it removes edges and occupancies |

## 6. Templated synthesis

### 6.1 The template is the partner of the 3′ end (D7)

`extend` copies "the opposite strand". With pairings, that becomes: **the template is whatever the 3′-terminal nucleotide is paired with.** The invariant gives it at most one partner, so the template is never ambiguous and needs no field.

- 3′ end paired **in cis**: RFC 0004 behaviour, unchanged.
- 3′ end paired **in trans**: the template is the partner strand, continuing past the end of the pairing. The new nucleotides become `nascent` on the extending molecule, and the pairing grows to cover them, in the same action. A new strand is base-paired to its template, as in-molecule `extend` creates a duplex implicitly.
- **This is the continuation of an existing pairing, not an implicit `pair`.** The pairing already joins the 3′ end to the strand being used as template, and `extend` only prolongs it:
  - a valid trans pairing must exist at the initial 3′ end;
  - `extend` prolongs that pairing and no other. It never looks for, or creates, a different partner;
  - the coordinate correspondence comes from the existing pairing's polarity and its alignment;
  - conflicts, alignment and molecule limits, and continuity of the pairing are all enforced;
  - the synthesised range is `nascent` and paired in trans for as long as it stays on the template.
- Later, `unpair` removes only the trans pairing. The synthesised range stays `nascent` and `open` (§6.2), and cis pairing reappears only through an explicit `anneal`.
- The template nucleotides must be present and unpaired, and inside the alignment. Opening the donor further is an explicit `unwind`. Nothing is displaced silently (D6).

### 6.2 What happens on the extending molecule (D8)

The nascent nucleotides fill `missing` coordinates of their own molecule. If the opposite strand is present there, RFC 0004 would read them as paired in cis, which is false: they are paired with the donor. So:

- **Rule:** trans-templated `extend` also marks the new range `open` on the extending molecule wherever its opposite strand is present. `open` means exactly this: both present, not paired with each other.
- **Consequence:** when the pairing is later removed, the new strand and the old one are both unpaired. They pair only through an explicit `anneal`. In HR this is second-end annealing, and it is an action, not a side effect of `unpair`.
- **Covalent synthesis and pairing stay distinct transformations.** `extend` makes nucleotides, which are paired with the template they were copied from and with nothing else. It never pairs the new strand with any other strand, on its own molecule or elsewhere.

### 6.3 Bridged breaks (D11)

RFC 0004 forbids `extend` at a double-strand break because the 3′ end and its template lie on different fragments. That remains the default and becomes conditional:

- `extend` at a DSB is allowed when the 3′ end is **paired in trans** (§6.1), or when the break is **bridged**.
- A DSB is *bridged* for a 3′ end when the template strand is present at both nucleotides flanking the break, at least one of them is `nascent`, and the 3′ end being extended is paired in cis with it. Resection removed the original flanks, so only synthesis across the break, followed by annealing to the other fragment, satisfies this. The template's far flank is necessarily unpaired: it is what is about to be copied.
- `ligate` clears a DSB only when both strands are continuous across it. The existing gap guard already checks that.
- "Bridged" is computed on demand from `missing`, `nascent`, `open` and `pairings`, including the cis-continuity condition. Nothing about it is persisted. As in RFC 0004, the nicks where new and old DNA meet are not separate lesions: the break site carries the lesion until `ligate`.

## 7. Where the layers meet

- **Footprint forms read pairing status (D10).** `single` means the occupied strand is unpaired. `duplex` means it is paired, in cis or in trans. `any` needs only the strand present. `strand: both` still requires cis pairing for `duplex`.
- **`form: any` is the absence of a form restriction on that footprint.** It tells the validator not to check pairing status for this occupant. It is not a biological statement that the protein binds every form of nucleic acid. The HR example declares RAD51 `any` so the filament can stay on the strand through `pair` and leave by an explicit `vacate`.
- **Strand-changing actions keep RFC 0005's rule.** After `pair`, `unpair`, `extend`, `unwind` or `anneal`, every span occupant on the affected molecules must still fit, or the action fails naming it. A `single` RPA on the second end therefore stays valid while the nascent strand is still paired with the donor (§6.2), and must be vacated before `anneal`.
- **Engagement with the donor is not a pairing (D9).** Before invasion there are no base pairs, so layer 3 is empty. Engagement is the filament resting on the donor: a second occupancy by the same instances. A `Pairing` exists only once strands are actually paired. This already works, since occupancy ids are per `<instance>@<acid>` and `vacate` takes a `target`.
- **No interaction is created between nucleic acids.** `componentOf` is unchanged. Whether `translocate { includeBound }` carries a paired molecule is left out: it is not needed for the cases in scope.

## 8. HR as explicit actions (SDSA)

Starting state, from the current example: `chromosome` (length 80), DSB at 40, 18 nt resected. `bottom [40, 58)` is the right 3′ overhang, coated with RAD51. `top [22, 40)` is the left 3′ overhang, coated with RPA. `sister` is an intact duplex, aligned with it over `[0, 80]`, `same`.

| # | Action | State change | Layer |
|---|---|---|---|
| 1 | filament copies rest on `sister [40, 58)` | occupancies on `sister` | 2 |
| 2 | `unwind sister.donor` | `sister.open [40, 58)` | RFC 0004 |
| 3 | `invade chromosome.right-overhang with sister` | pairing `chromosome.bottom [40, 58) ~ sister.top [40, 58)`; `sister.bottom [40, 58)` is the displaced strand | 3 |
| 4 | `vacate` RAD51 copies | occupancies removed | 2 |
| 5 | `unwind sister.ahead` | `sister.open [22, 58)` | RFC 0004 |
| 6 | `extend chromosome.break, strand: bottom, length: 18` | `chromosome.bottom [22, 40)` nascent; pairing grows to `[22, 58)`; `chromosome.open [22, 40)` | 3 + RFC 0004 |
| 7 | `unpair` the invading strand | pairing removed | 3 |
| 8 | `anneal sister.donor` | `sister` intact again | RFC 0004 |
| 9 | `vacate` RPA; `anneal chromosome.left-overhang` | second end annealed; break bridged by `bottom` | 2, RFC 0004 |
| 10 | `extend chromosome.break, strand: top, length: 18` | `chromosome.top [40, 58)` nascent, template in cis | RFC 0004 |
| 11 | `ligate chromosome.break` | lesion cleared | RFC 0001 |

The final state is an intact chromosome with two `nascent` tracts and an untouched sister. It is the fold of the eleven actions. Removing any of them makes a later one fail or leaves a different final state (without step 8 the sister simply stays open).

## 9. Generality check (not implemented by this RFC)

| Structure | In this model | Needs anything new? |
|---|---|---|
| **Annealing of two complementary single strands** (oligos, RNA–DNA hybrid) | two `single` molecules, alignment `opposite`, one `top ~ top` pairing | no |
| **R-loop** (transcript or guide RNA in a duplex) | `open` on the DNA, a pairing from the RNA into it | no |
| **Second-end capture** | the displaced donor strand pairs with the other overhang: a second `pair` | no |
| **Double Holliday junction** | after second-end capture, synthesis and ligation: both strands of one molecule paired in trans with both strands of the other over one range | no |
| **Branch migration** | `unwind` ahead, `pair`, `unpair` behind, `anneal { span }` to close only part of a bubble | no, but four actions per increment (D6) |
| **dHJ dissolution** (non-crossover) | `unpair` both pairings, `anneal` both molecules | no |
| **Single-strand annealing, microhomology** | a molecule aligned with itself; pairing across the break | state: no. The 3′ flaps need a new trimming action |
| **Hairpin, cruciform** | self-alignment `opposite`; a strand pairs with itself | state: no. Rendering excluded by RFC 0004 |
| **Primer extension on a separate template; replication fork with nascent strands as molecules** | pairing plus trans-templated `extend` | authorable initial `missing` state, which does not exist today |
| **Nuclease resolution of a junction, crossover** | cutting and re-joining exchanges strands *between* molecules | **yes**: covalent connectivity across molecules. A later RFC, layered on pairings |
| **Flap, strand-displacement synthesis within one molecule** | two nucleotides at one (molecule, strand, coordinate) | **yes**: the same connectivity concept |
| **Triplex, G-quadruplex, parallel pairing** | more than one partner, or non-antiparallel | **yes**: relax §3.3 or §3.2, both single replaceable rules |

The line the check draws: pairings cover every structure made by changing **who is base-paired with whom**. They do not cover structures that change **which nucleotide is covalently joined to which**. That is the boundary of this RFC (D12).

## 10. Rendering (renderer decisions, no schema impact)

The scene reads `NucleicState` and `pairings`. It never sees action types and has no notion of invasion, D-loop, donor or recipient.

- **Several molecules:** stacked, with room between them. Today's layout puts a second molecule at the bottom edge and must change.
- **A strand paired in trans** leaves its molecule's axis at the edges of the paired span and runs beside its partner. Rungs are drawn between partners, whichever molecule they belong to. An unpaired strand in an `open` region bows away, as it does today.
- **Nascent** nucleotides keep the RFC 0004 style wherever they are drawn.
- **Polarity labels** stay per strand end.
- **Description** is structural: "chromosome bottom strand 40–58 paired with sister top strand 40–58; sister bottom strand 40–58 unpaired".
- **Keys:** each molecule stays one keyed group. Pairing geometry is redrawn between steps, as backbones are.

## 11. Decisions

| # | Decision | Options | Outcome |
|---|---|---|---|
| **D1** | What a pairing relates, and where it is stored | (a) strand span ↔ strand span, stored once in `state.pairings`; (b) partner references inside each molecule's `NucleicState`; (c) whole-molecule relation plus a range | **(a)** *(accepted)* |
| **D2** | Coordinate correspondence | (a) derived from strand polarity and equal span length (§3.2); (b) stored orientation or map on each pairing | **(a)** *(accepted)* |
| **D3** | What licenses `pair` | (a) a prior declaration is required; (b) optional; (c) none | **(a)** *(accepted)* |
| **D4** | Shape and name of the declaration | (a) top-level list between two molecule ranges with `same`/`opposite`; (b) strand-level declarations; (c) a property on the nucleic acid. Name: `homology` or `alignment` | **(a), named `alignments`** *(accepted)*. The core has no sequence and does not assert biological homology. An alignment declares correspondence between spans; a `Pairing` is the pairing that exists in the state. The two stay separate (§4) |
| **D5** | Cis pairing | (a) stays derived (RFC 0004); only trans pairing is stored; (b) all base pairing becomes explicit records | **(a)** *(accepted)* |
| **D6** | Displacing an existing partner | (a) explicit `unwind`, then `pair`; (b) one concerted primitive; (c) both | **(a)** *(accepted)*. `unwind` and `pair` stay independent primitives; no concerted action for now. A later alias may compile to several actions without changing the model |
| **D7** | Template of `extend` | (a) derived: the partner of the 3′ end; (b) an explicit `template` field | **(a)** *(accepted)* |
| **D8** | Nascent strand vs its own molecule | (a) trans-templated `extend` leaves the range `nascent` and `open`; annealing is an explicit `anneal`; (b) `unpair` anneals implicitly | **(a)** *(accepted)*. Covalent synthesis and pairing are distinct transformations |
| **D9** | Engagement with the donor | (a) occupancy of the filament copies on the donor, no pairing; (b) a non-base-paired record in layer 3; (c) not modelled | **(a)** *(accepted)*. No `Pairing` exists until strands are actually paired |
| **D10** | Footprint forms | (a) forms read pairing status by any means; (b) forms read only the molecule's own strands | **(a)** *(accepted)*. The HR example declares RAD51 `form: any`, documented as the absence of a form restriction on the footprint, not a general biological claim about RAD51 (§7) |
| **D11** | DSB extension and ligation | (a) derived "bridged" rule (§6.3); (b) explicit per-strand break state and tracked nicks | **(a)** *(accepted)*. Fully derived, including the cis-continuity condition. No persistent state |
| **D12** | Scope | (a) core tested beyond SDSA; renderer and example SDSA only; (b) SDSA only everywhere; (c) include nuclease resolution and crossovers | **(a)** *(accepted)*. Core tested up to dHJ formation, branch migration and dissolution. The renderer and the HR mechanism stop at SDSA |
| **D13** | Verbs | (a) `pair`/`unpair` for trans, `anneal`/`unwind` keep their cis meaning; (b) generalise `anneal` and `unwind` | **(a)** *(accepted)* |
| **D14** | Schema version | (a) `schemaVersion: 5` with automatic v4 → v5; (b) additive under v4 | **(a)** *(accepted)*, with legacy baselines |

## 12. Implementation plan

Each PR keeps every frozen fixture (v1–v4) byte-identical in render and identical in the semantic projection, until PR 5 changes the HR example on purpose.

| PR | Scope | Tests | Output change |
|---|---|---|---|
| **0. Baseline** | Freeze the three v4 examples as fixtures; SHA-256 of full, compact and ghosted renders; per-step semantic projection; keep `schema.v4.json` | the baselines themselves | none |
| **1. Schema v5, alignments, pairings** | `schemaVersion: 5` and identity migration v4 → v5; `alignments` in types, schema and validation (nucleic actors, ranges inside the molecules, equal lengths); `state.pairings` with normalised segments and diff keys; `partnerOf` and `pairingConflicts`; `pair`, `unpair`, alias `invade`; `degrade` removes pairings; one generic post-check on `resect`, `extend`, `unwind` and `anneal` so no strand action can break a pairing | migration; alignment validation; correspondence for `top~bottom` and `top~top`; the invariant; normalisation and merge; determinism and seek; parallel-conflict keys | none |
| **2. Layer rules** | Footprint forms read `partnerOf`; occupants re-checked on both molecules after `pair` and `unpair`; a second occupancy of one instance on another molecule (engagement) | `single`/`duplex`/`any` against cis, trans and unpaired; RPA on a strand whose opposite is nascent and `open` | none |
| **3. Templated synthesis** | `extend` through a pairing (template from the 3′ end, pairing grows, range `open` on the extending molecule); `extend` on a `single` molecule paired in trans; derived bridged rule; `ligate` across a bridged break | SDSA end to end (§8), including that removing any action makes a later one fail; annealing of two single strands; dHJ formation, branch migration and dissolution | none |
| **4. Rendering** | Layout for several nucleic acids; strands paired in trans; rungs between partners; structural description; keys | geometry and contact tests; description; legacy SHA baselines | only for documents with pairings |
| **5. Example and docs** | HR continues from the filament to an intact chromosome (§8): `sister` actor, alignment, RAD51 `form: any`; README roadmap; notes in RFC 0004 §10.7–10.9 and RFC 0005 §6 pointing here | new HR baseline | intended |
