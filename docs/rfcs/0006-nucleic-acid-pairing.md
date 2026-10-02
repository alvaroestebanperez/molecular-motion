# RFC 0006 — Pairing between nucleic-acid molecules: homology, strand invasion, templated synthesis

- **Status:** draft. The decisions in §9 are open and must be settled before implementation.
- **Builds on:** [RFC 0004](0004-nucleic-acid-geometry.md) (coordinates, strand state), [RFC 0005](0005-assemblies-and-occupancy.md) (instances, interactions, occupancy)
- **Roadmap item:** *Interactions between nucleic-acid molecules: strand invasion, D-loops, synthesis on a sister chromatid, Holliday junctions*

## 1. Problem

The HR example stops at the RAD51 filament because every nucleic-acid relation in the model is internal to one molecule. Base pairs are derived from "both strands present and not unwound". RFC 0004 §10.7 and RFC 0005 §6 explicitly forbade faking a second molecule with `open` or `nascent` ranges. To continue HR honestly, the model needs four things:

1. A way to say that two molecules (a broken chromatid and its sister) **carry the same sequence over a region**.
2. **Base pairing between strands of different molecules** (the invading strand paired with the donor's complementary strand, inside a D-loop).
3. **Synthesis whose template is on another molecule** (extension of the invading 3′ end using the donor).
4. The end of the story, as consequences of explicit actions, never a `restore`: displacement of the extended strand, annealing to the other end, fill-in and ligation.

## 2. Scope

**In:** homology declarations, inter-molecular pairing, strand invasion and the D-loop, extension on a donor template, D-loop disassembly, and annealing to the second end. Together these complete **synthesis-dependent strand annealing (SDSA)** end to end.

**Out (later RFCs):**
- double Holliday junctions, branch migration of four-way junctions, and their resolution;
- crossover outcomes, which permanently exchange arms between molecules and need molecule-level connectivity;
- break-induced replication;
- sequence content and mismatch repair in heteroduplex DNA.

The design must not preclude them (§8).

## 3. Homology: a static declaration

```yaml
homology:
  - id: sister
    between: [chromosome, sister]   # two dna actors
    range: [0, 80]                  # interbase, on both (same coordinates)
    # or, for differing coordinates:
    # a: { acid: chromosome, span: [0, 80] }
    # b: { acid: sister, span: [100, 180] }
    orientation: same               # same | opposite
```

- **Homology is authored data:** "these coordinates carry the same sequence". It has no sequence and no scoring, and the core knows no biology beyond it.
- It defines a **coordinate map** between the two molecules. `same` maps `p ↦ p + offset`; `opposite` maps `p ↦ end − p`, for an inverted repeat or a molecule drawn in the other direction.
- **Complementarity follows polarity (RFC 0004).** With `same` orientation, A's `top` is complementary to B's `bottom`, and A's `bottom` to B's `top`. With `opposite`, `top` pairs with `top`, and the antiparallel requirement still holds through the map.

## 4. Pairing: inter-molecular base pairing (state)

```ts
interface PairedStrand { acid: string; strand: StrandId; from: number; to: number }
interface Pairing {
  id: string;               // canonical from both ends
  homology: string;         // the declaration that licenses it
  ends: [PairedStrand, PairedStrand];
}
// state.pairings: Record<string, Pairing>
```

**One invariant, checked generically: every nucleotide of every strand has at most one partner.** That partner is either its own molecule's other strand (present, not missing, not inside an `open` region) or exactly one inter-molecular pairing. It follows that:

- the invading strand must be single across the span (its own partner missing, e.g. a resected 3′ overhang);
- the donor strand it pairs with must be unpaired across the mapped span, i.e. inside an `open` region of the donor (its own partner displaced);
- the two ranges must map onto each other through the homology, and the strands must be complementary per §3.

**The D-loop is derived, not stored:** a donor `open` region plus a pairing into it. The displaced donor strand is whatever is left unpaired in the bubble. Renderers name and draw it, and the core never stores "D-loop".

## 5. Actions

| Action | Effect | Notes |
|---|---|---|
| `pair { target, with, homology?, strand? }` | Pairs the target strand range (a site or span on molecule A) with the complementary strand of the homologous range on molecule `with` | One transformation. It fails unless the invariant holds, so the donor must already be unwound (`unwind`, RFC 0004) |
| `unpair { target }` | Dissolves the pairing on that range | The invader is released; the donor stays `open` until `anneal` |
| *(alias)* `invade` → `pair` | Presentation verb "invades" | Expands to exactly one action (RFC 0001 §9.3) |

**Templated synthesis (change to `extend`, RFC 0004 §5).** When the nucleotides next to a 3′ end are **paired with another molecule**, the template is the partner strand on that molecule, read through the homology map:

- the new nucleotides become `nascent` on the invading molecule;
- the **pairing grows** with them, because a newly made strand is base-paired to its template: one transformation, as in-molecule `extend` creates a duplex implicitly;
- the donor template must be unpaired across the new range, so a longer D-loop needs an explicit `unwind` first. Nothing is displaced silently.

**Bridged breaks (change to RFC 0004 §5's DSB rule).** RFC 0004 forbids `extend` at a double-strand break because the 3′ end and its template lie on different fragments. That remains the default, and becomes conditional:

- **Rule:** a DSB is *bridged* by a strand when that strand is present at both nucleotides flanking the break, and at least one of them is `nascent`. Resection removed the original flanks, so only synthesis across the break can make a strand present on both sides.
- **Effect on `extend` at a DSB:** it is allowed when the template is a pairing, or when the break is bridged. A bridged break means the other fragment is annealed and physically connected.
- **Effect on `ligate`:** it clears a DSB only when both strands are continuous across it. The existing gap guard already checks that.
- **Everything is derived from RFC 0004 state:** there is no new storage for fragment connectivity.
- **Abstraction kept from RFC 0004:** the nicks where new and old DNA meet (for example at the far end of a fill-in) are not tracked as separate lesions. The break site carries the lesion, and `ligate` seals it once no gap remains.

### SDSA as explicit actions (the target story)

```text
resect ──▶ RPA / RAD51 (RFC 0005) ──▶ unwind sister.region ──▶ invade chromosome.right-overhang with sister
   ──▶ extend chromosome.break (template: sister, via the pairing) ──▶ unpair ──▶ anneal sister
   ──▶ (the extended strand and the left 3′ overhang are now both present: paired, break bridged)
   ──▶ extend the left 3′ end (template: the extended strand, same molecule) ──▶ ligate ──▶ intact
```

Every arrow is one existing or proposed action, and the end state is the consequence of all of them.

## 6. Interplay with occupancy (RFC 0005)

A footprint form reads strand state. Pairing adds a new way for a strand to be "paired", so the forms need a definition that includes it (D6):

- **`single`** means unpaired (no in-molecule partner and no pairing).
- **`duplex`** means paired, in-molecule or by pairing.

The presynaptic RAD51 filament performs the invasion, so its footprint form determines whether it may stay on the strand when it pairs (D6). Strand-changing actions (`pair`, `unpair`, `extend`) keep RFC 0005's rule: every span occupant must still fit afterwards, or the action fails naming it.

## 7. Rendering (renderer decisions, no schema impact)

- **Two molecules:** the broken molecule above and the donor below, stacked with room for the D-loop between them. Today's layout puts a second molecule at the bottom edge, so it must change when several molecules are shown.
- **Pairing:** the invading strand leaves its molecule through an S-curve at the edges of the paired range, and runs inside the donor's bubble alongside the template strand. The displaced donor strand bows away (RFC 0004 `open` geometry). Base pairs are drawn between the paired strands only.
- **Synthesis on the donor** uses the RFC 0004 nascent style on the invading strand inside the bubble.
- **Polarity labels** stay per molecule. The invading 3′ end is labelled where it sits in the bubble.
- **Description:** "chromosome bottom strand 40–58 paired with sister top strand 40–58 (D-loop)".

## 8. Extensibility check (not implemented)

- **dHJ.** Second-end capture creates a second pairing. A double Holliday junction is two pairings plus crossing strands, so it needs strand-continuity *between* molecules (which strand connects to which across a junction). That is a later "connectivity" concept layered on pairings, not a replacement for them.
- **Mismatch / heteroduplex.** It would be a property of a pairing (a site inside it), not new pairing storage.
- **NHEJ.** End synapsis is an interaction between proteins at two ends of one molecule (RFC 0005). Microhomology annealing would be a pairing within one molecule across a break (`homology` from a molecule to itself).

## 9. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| **D1** | Where homology lives | (a) top-level `homology` list with explicit ranges and orientation; (b) a property on the nucleic acid (`homologousTo`) | **(a)**: ranges and orientation are first-class, several homologies per molecule are possible, and the same shape can later carry microhomology |
| **D2** | Coordinate mapping | (a) offset + orientation (`same`/`opposite`); (b) arbitrary piecewise maps | **(a)**. Piecewise maps (indels between homologs) can come later without changing pairing storage |
| **D3** | Pairing storage | (a) `state.pairings` records between strand ranges of two molecules; (b) extend `NucleicState` of each molecule with partner references | **(a)**: stored once, like interactions (RFC 0005 D5), with no duplicated state on both molecules |
| **D4** | Invasion as actions | (a) explicit `unwind` (donor) then `pair`, with `invade` as a presentation alias of `pair`; (b) one `invade` primitive that unwinds and pairs | **(a)**: one transformation per action. The donor bubble is a separate, visible event |
| **D5** | Templated synthesis | (a) `extend` reads the pairing as template and grows the pairing, with the donor already unwound; (b) `extend` also unwinds the donor ahead of synthesis (D-loop migration) | **(a)**: no silent displacement. Migration is an explicit `unwind` |
| **D6** | Footprint forms and pairing | (a) strict: `single` = unpaired by any means, `duplex` = paired by any means; (b) forms read only in-molecule strands | **(a)**: forms describe what the protein sits on. Under (a), a `single` RAD51 could not stay on the strand it pairs. Because RAD51 binds both ssDNA and dsDNA, the HR example declares it `form: any`, so the filament stays through invasion and leaves through an explicit `vacate` (the RAD54-like step). RPA stays `single` |
| **D7** | DSB extension and ligation | (a) derived "bridged" rule (§5) relaxing RFC 0004's ban; (b) keep the ban and add explicit per-strand break state | **(a)**: no new storage, and it follows from resection plus synthesis |
| **D8** | Schema version | (a) `schemaVersion: 5` with automatic v4 → v5; (b) additive under v4 | **(a)**: a new kind of state (RFC 0001 §9.1). Migration is identity, and the baselines stay byte-identical |
| **D9** | Scope of this RFC | (a) SDSA end to end; dHJ, resolution, crossovers and BIR deferred; (b) include dHJ | **(a)**: dHJ needs inter-molecular strand connectivity (§8), a concept of its own |

## 10. Implementation plan (after the decisions)

| PR | Scope | Output change |
|---|---|---|
| 0. Baseline | Freeze the v4 examples as fixtures; extend the render and semantic baselines | none |
| 1. Homology + pairing | Declarations, `state.pairings`, the invariant, `pair`/`unpair`/`invade`, v5 migration, footprint forms reading pairing | none for legacy docs |
| 2. Templated synthesis | `extend` through pairings, bridged-DSB rule, `ligate` across bridged breaks | none for legacy docs |
| 3. Rendering | Several molecules, D-loop geometry, paired strands, description | only for docs with pairings |
| 4. Example | HR continues: sister chromatid, invasion, D-loop, extension, displacement, annealing, fill-in, ligation | intended |
